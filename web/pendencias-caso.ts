import {
  avisoSinalOperacional,
  rotulosEstadoPendencia,
  rotulosEstadoSinal,
  rotulosTipoPendencia,
  type AcaoPendencia,
  type Pendencia,
  type SalvarAcordo,
  type SinalOperacional,
  type TratarPendencia,
} from '../packages/contracts/src/pendencia.js';
import type { ResponsavelOpcao } from './acompanhamento-caso.js';
import { exigeNovoAcesso, mensagemFalha } from './api.js';
import { dataDeInstante } from './datas.js';

export type ServicoPendencias = {
  consultar(pacienteId: string): Promise<SinalOperacional>;
  acordar(pacienteId: string, acordo: SalvarAcordo): Promise<SinalOperacional>;
  tratar(pacienteId: string, tratativa: TratarPendencia): Promise<SinalOperacional>;
};

function dataCivil(valor: string | null): string {
  if (!valor) return '';
  const [ano, mes, dia] = valor.split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
}

const elemento = <K extends keyof HTMLElementTagNameMap>(
  tipo: K,
  texto?: string,
  classe?: string,
): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tipo);
  if (texto !== undefined) el.textContent = texto;
  if (classe) el.className = classe;
  return el;
};

/** Ações oferecidas por estado. Nenhuma delas apaga a origem: todas gravam um evento
 * novo contra a mesma chave de origem (FR-027). "Reabrir" existe para desfazer uma
 * resolução sem apagar o registro de que ela aconteceu. */
function acoesDisponiveis(estado: Pendencia['estado']): { acao: AcaoPendencia; rotulo: string }[] {
  if (estado === 'resolvida') return [{ acao: 'reaberta', rotulo: 'Reabrir' }];
  return [
    ...(estado === 'aberta' ? [{ acao: 'reconhecida' as const, rotulo: 'Reconhecer' }] : []),
    { acao: 'atribuida' as const, rotulo: 'Atribuir' },
    { acao: 'resolvida' as const, rotulo: 'Resolver' },
  ];
}

/** Interface das pendências do caso (FR-027) e do sinal operacional (FR-028).
 *
 * Duas coisas que a tela nunca faz, porque o requisito proíbe:
 * - não apresenta o sinal como leitura clínica. O aviso de FR-028 aparece junto do estado,
 *   não escondido num rodapé, e "em dia" sempre vem com o motivo que o sustenta;
 * - não esconde a origem de uma pendência resolvida. Resolver muda o estado; a origem
 *   continua listada com o motivo que a gerou e pode ser reaberta.
 *
 * O editor de periodicidade só aparece para quem o servidor autoriza a gravá-lo; esconder
 * o formulário é conveniência, a recusa real continua no banco. */
export function montarPendenciasCaso(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoPendencias,
  acessoPerdido: (erro: unknown) => void,
  listarResponsaveis?: () => Promise<ResponsavelOpcao[]>,
): () => void {
  let ativa = true;
  let equipe: ResponsavelOpcao[] = [];
  const descartarAcesso = (erro: unknown): boolean => {
    if (!exigeNovoAcesso(erro)) return false;
    ativa = false;
    raiz.replaceChildren();
    acessoPerdido(erro);
    return true;
  };

  const status = elemento('p', 'Carregando pendências…', 'visao-estado');
  status.setAttribute('role', 'status');
  raiz.replaceChildren(status);

  const desenharPendencia = (
    pendencia: Pendencia,
    aplicar: (tratativa: TratarPendencia) => void,
  ): HTMLElement => {
    const item = elemento('li', undefined, 'pendencia-item');
    item.dataset.tipo = pendencia.tipo;
    item.dataset.estado = pendencia.estado;
    item.append(elemento('p', rotulosTipoPendencia[pendencia.tipo], 'pendencia-tipo'));
    item.append(elemento('p', pendencia.motivo, 'pendencia-motivo'));
    const marcas = [`Situação: ${rotulosEstadoPendencia[pendencia.estado]}`];
    if (pendencia.desde) marcas.push(`Desde ${dataCivil(pendencia.desde)}`);
    if (pendencia.atribuido_usuario_id)
      marcas.push(
        `Atribuída a ${
          equipe.find((opcao) => opcao.usuario_id === pendencia.atribuido_usuario_id)?.rotulo ??
          'pessoa da equipe'
        }`,
      );
    if (pendencia.tratada_em && dataDeInstante(pendencia.tratada_em))
      marcas.push(`Última tratativa em ${dataDeInstante(pendencia.tratada_em)}`);
    item.append(elemento('p', marcas.join(' · '), 'pendencia-marcas'));

    const acoes = elemento('div', undefined, 'pendencia-acoes');
    for (const { acao, rotulo } of acoesDisponiveis(pendencia.estado)) {
      if (acao === 'atribuida') {
        if (!equipe.some((opcao) => opcao.ativo)) continue;
        const campo = elemento('label', undefined, 'pendencia-atribuir');
        campo.append(elemento('span', 'Atribuir a'));
        const selecao = elemento('select');
        selecao.append(new Option('Escolha uma pessoa', ''));
        for (const opcao of equipe)
          if (opcao.ativo) selecao.append(new Option(opcao.rotulo, opcao.usuario_id));
        selecao.addEventListener('change', () => {
          if (!selecao.value) return;
          aplicar({
            tipo: pendencia.tipo,
            chave_origem: pendencia.chave_origem,
            acao: 'atribuida',
            atribuido_usuario_id: selecao.value,
          });
        });
        campo.append(selecao);
        acoes.append(campo);
        continue;
      }
      const botao = elemento('button', rotulo, 'button-secondary');
      botao.type = 'button';
      botao.addEventListener('click', () =>
        aplicar({
          tipo: pendencia.tipo,
          chave_origem: pendencia.chave_origem,
          acao,
          atribuido_usuario_id: null,
        }),
      );
      acoes.append(botao);
    }
    if (acoes.childElementCount) item.append(acoes);
    return item;
  };

  const desenharAcordo = (sinal: SinalOperacional, gravar: (acordo: SalvarAcordo) => void) => {
    const secao = elemento('section', undefined, 'pendencia-acordo');
    secao.append(elemento('h3', 'Periodicidade acordada para este caso'));
    if (!sinal.perfil_escrita_acordo) {
      secao.append(
        elemento(
          'p',
          sinal.acordo
            ? `Atualizar o caso a cada ${sinal.acordo.dias_entre_atualizacoes ?? '—'} dias · Avisar ${sinal.acordo.dias_antecedencia_revisao} dias antes da revisão · Cobrar retorno de encaminhamento em ${sinal.acordo.dias_retorno_encaminhamento} dias${sinal.acordo.proxima_revisao_em ? ` · Próxima revisão em ${dataCivil(sinal.acordo.proxima_revisao_em)}` : ''}`
            : 'Periodicidade ainda não acordada. A coordenação define esses prazos.',
        ),
      );
      return secao;
    }
    const formulario = elemento('form');
    formulario.noValidate = true;
    const numero = (
      nome: string,
      rotulo: string,
      valor: number | null,
      minimo: number,
      maximo: number,
      obrigatorio: boolean,
    ) => {
      const campo = elemento('label');
      campo.append(elemento('span', rotulo));
      const entrada = elemento('input');
      entrada.type = 'number';
      entrada.name = nome;
      entrada.min = String(minimo);
      entrada.max = String(maximo);
      entrada.inputMode = 'numeric';
      entrada.required = obrigatorio;
      entrada.value = valor === null ? '' : String(valor);
      campo.append(entrada);
      formulario.append(campo);
      return entrada;
    };
    const atualizacoes = numero(
      'dias_entre_atualizacoes',
      'Atualizar o caso a cada (dias, em branco para não cobrar)',
      sinal.acordo?.dias_entre_atualizacoes ?? null,
      1,
      365,
      false,
    );
    const antecedencia = numero(
      'dias_antecedencia_revisao',
      'Avisar antes da revisão (dias)',
      sinal.acordo?.dias_antecedencia_revisao ?? 14,
      1,
      180,
      true,
    );
    const retorno = numero(
      'dias_retorno_encaminhamento',
      'Cobrar retorno de encaminhamento após (dias)',
      sinal.acordo?.dias_retorno_encaminhamento ?? 21,
      1,
      365,
      true,
    );
    const campoRevisao = elemento('label');
    campoRevisao.append(elemento('span', 'Próxima revisão'));
    const revisao = elemento('input');
    revisao.type = 'date';
    revisao.name = 'proxima_revisao_em';
    revisao.value = sinal.acordo?.proxima_revisao_em ?? '';
    campoRevisao.append(revisao);
    formulario.append(campoRevisao);
    const erroCampo = elemento('p', '', 'visao-estado');
    erroCampo.setAttribute('role', 'alert');
    const salvar = elemento('button', 'Salvar periodicidade');
    salvar.type = 'submit';
    formulario.append(salvar, erroCampo);
    formulario.addEventListener('submit', (evento) => {
      evento.preventDefault();
      const opcional = atualizacoes.value.trim();
      const entre = opcional === '' ? null : Number(opcional);
      if (entre !== null && (!Number.isInteger(entre) || entre < 1 || entre > 365)) {
        erroCampo.textContent = 'Informe de 1 a 365 dias, ou deixe em branco.';
        atualizacoes.focus();
        return;
      }
      erroCampo.textContent = '';
      gravar({
        versao_esperada: sinal.acordo?.versao ?? 0,
        dias_entre_atualizacoes: entre,
        dias_antecedencia_revisao: Number(antecedencia.value),
        dias_retorno_encaminhamento: Number(retorno.value),
        proxima_revisao_em: revisao.value === '' ? null : revisao.value,
      });
    });
    secao.append(formulario);
    return secao;
  };

  const desenhar = (sinal: SinalOperacional) => {
    if (!ativa) return;
    const painel = elemento('section');
    painel.append(elemento('h2', 'Pendências e sinal do acompanhamento'));

    const cabecalho = elemento('section', undefined, 'pendencia-sinal');
    cabecalho.dataset.estado = sinal.estado;
    cabecalho.append(elemento('p', rotulosEstadoSinal[sinal.estado], 'visao-destaque'));
    cabecalho.append(elemento('p', avisoSinalOperacional, 'visao-aviso'));
    cabecalho.append(
      elemento(
        'p',
        sinal.ultima_atualizacao_em && dataDeInstante(sinal.ultima_atualizacao_em)
          ? `Última atualização registrada no caso: ${dataDeInstante(sinal.ultima_atualizacao_em)}.`
          : 'Nenhuma atualização registrada neste caso até agora.',
        'visao-data',
      ),
    );
    painel.append(cabecalho);

    const aviso = elemento('p', '', 'visao-estado');
    aviso.setAttribute('role', 'status');

    const aplicar = (tratativa: TratarPendencia) => {
      aviso.textContent = 'Registrando…';
      servico.tratar(pacienteId, tratativa).then(
        (atualizado) => {
          if (!ativa) return;
          desenhar(atualizado);
        },
        (erro: unknown) => {
          if (!ativa || descartarAcesso(erro)) return;
          aviso.textContent = mensagemFalha(erro);
          aviso.dataset.tone = 'error';
        },
      );
    };
    const gravarAcordo = (acordo: SalvarAcordo) => {
      aviso.textContent = 'Salvando periodicidade…';
      servico.acordar(pacienteId, acordo).then(
        (atualizado) => {
          if (!ativa) return;
          desenhar(atualizado);
        },
        (erro: unknown) => {
          if (!ativa || descartarAcesso(erro)) return;
          aviso.textContent = mensagemFalha(erro);
          aviso.dataset.tone = 'error';
        },
      );
    };

    const abertas = sinal.pendencias.filter((item) => item.estado !== 'resolvida');
    const resolvidas = sinal.pendencias.filter((item) => item.estado === 'resolvida');
    if (!sinal.pendencias.length)
      painel.append(
        elemento(
          'p',
          sinal.estado === 'informacao_insuficiente'
            ? 'Nenhuma pendência pode ser apurada enquanto a periodicidade do caso não for acordada.'
            : 'Nenhuma pendência operacional neste caso.',
        ),
      );
    if (abertas.length) {
      painel.append(elemento('h3', 'Em aberto'));
      const lista = elemento('ul', undefined, 'pendencia-lista');
      for (const pendencia of abertas) lista.append(desenharPendencia(pendencia, aplicar));
      painel.append(lista);
    }
    if (resolvidas.length) {
      painel.append(elemento('h3', 'Resolvidas'));
      painel.append(
        elemento(
          'p',
          'Resolver não apaga a origem: o registro continua aqui e pode ser reaberto.',
          'visao-aviso',
        ),
      );
      const lista = elemento('ul', undefined, 'pendencia-lista');
      for (const pendencia of resolvidas) lista.append(desenharPendencia(pendencia, aplicar));
      painel.append(lista);
    }
    painel.append(desenharAcordo(sinal, gravarAcordo), aviso);
    raiz.replaceChildren(painel);
  };

  void (async () => {
    try {
      // As duas consultas saem juntas, e a lista da equipe nunca atrasa a pendência: ela só
      // enriquece a atribuição. Em série, uma equipe lenta deixava a tela no esqueleto de
      // carregamento sem nada para mostrar (smoke de 13/11/2026).
      const equipePedida = listarResponsaveis
        ? listarResponsaveis().catch((erro: unknown) => {
            // Sem a lista da equipe a atribuição fica indisponível, mas a pendência não se perde.
            if (exigeNovoAcesso(erro)) throw erro;
            return [] as ResponsavelOpcao[];
          })
        : Promise.resolve([] as ResponsavelOpcao[]);
      const [sinal, equipeCarregada] = await Promise.all([
        servico.consultar(pacienteId),
        equipePedida,
      ]);
      if (!ativa) return;
      equipe = equipeCarregada;
      desenhar(sinal);
    } catch (erro) {
      if (!ativa || descartarAcesso(erro)) return;
      status.textContent = mensagemFalha(erro);
      status.dataset.tone = 'error';
    }
  })();

  return () => {
    ativa = false;
    raiz.replaceChildren();
  };
}
