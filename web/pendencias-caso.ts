import { esqueletoCarregando, iniciarAcao } from './esqueleto.js';
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
import type { PendenciaPlantaoHttp } from '../packages/contracts/src/ficha-plantao-http.js';
import type { ResponsavelOpcao } from './acompanhamento-caso.js';
import { exigeNovoAcesso, mensagemFalha } from './api.js';
import { dataDeInstante } from './datas.js';
import { botao as botaoDaCamada, estadoVazio } from './ui/basicos.js';

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
  /** FR-077, decisão 0.5 de 20/11/2026: as pendências ESCRITAS no plantão aparecem aqui ao
   * lado das quatro derivadas, com origem visível. Opcional porque a ficha de plantão tem
   * interruptor próprio: desligada, a carteira continua mostrando as derivadas como sempre,
   * e nenhuma delas muda de comportamento. */
  listarPendenciasEscritas?: () => Promise<PendenciaPlantaoHttp[]>,
): () => void {
  let ativa = true;
  let equipe: ResponsavelOpcao[] = [];
  // `null` = não deu para ler. Distinto de `[]`, que é "leu e não há nenhuma".
  let escritas: PendenciaPlantaoHttp[] | null = [];
  let gravacaoEmCurso = false;
  const atualizarControles = () => {
    for (const campo of raiz.querySelectorAll<HTMLButtonElement | HTMLSelectElement>(
      '.pendencia-acoes button, .pendencia-acoes select, .pendencia-acordo button[type=submit]',
    ))
      campo.disabled = gravacaoEmCurso;
  };
  const descartarAcesso = (erro: unknown): boolean => {
    if (!exigeNovoAcesso(erro)) return false;
    ativa = false;
    raiz.replaceChildren();
    acessoPerdido(erro);
    return true;
  };

  const status = elemento('p', 'Carregando pendências…', 'visao-estado');
  status.setAttribute('role', 'status');
  const carregamento = esqueletoCarregando(3, true);
  raiz.replaceChildren(status, carregamento);

  const desenharPendencia = (
    pendencia: Pendencia,
    aplicar: (tratativa: TratarPendencia, controle: HTMLElement) => void,
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
          aplicar(
            {
              tipo: pendencia.tipo,
              chave_origem: pendencia.chave_origem,
              acao: 'atribuida',
              atribuido_usuario_id: selecao.value,
            },
            campo,
          );
        });
        campo.append(selecao);
        acoes.append(campo);
        continue;
      }
      const botao = botaoDaCamada({ rotulo, peso: 'discreto' });
      botao.addEventListener('click', () =>
        aplicar(
          {
            tipo: pendencia.tipo,
            chave_origem: pendencia.chave_origem,
            acao,
            atribuido_usuario_id: null,
          },
          botao,
        ),
      );
      acoes.append(botao);
    }
    for (const controle of acoes.querySelectorAll<HTMLButtonElement | HTMLSelectElement>(
      'button, select',
    ))
      controle.disabled = gravacaoEmCurso;
    if (acoes.childElementCount) item.append(acoes);
    return item;
  };

  const desenharAcordo = (
    sinal: SinalOperacional,
    gravar: (acordo: SalvarAcordo, controle: HTMLElement) => void,
  ) => {
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
    const salvar = botaoDaCamada({
      rotulo: 'Salvar periodicidade',
      tipo: 'submit',
      peso: 'principal',
    });
    salvar.disabled = gravacaoEmCurso;
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
      gravar(
        {
          versao_esperada: sinal.acordo?.versao ?? 0,
          dias_entre_atualizacoes: entre,
          dias_antecedencia_revisao: Number(antecedencia.value),
          dias_retorno_encaminhamento: Number(retorno.value),
          proxima_revisao_em: revisao.value === '' ? null : revisao.value,
        },
        salvar,
      );
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

    const aplicar = (tratativa: TratarPendencia, controle: HTMLElement) => {
      if (gravacaoEmCurso) return;
      gravacaoEmCurso = true;
      atualizarControles();
      const finalizar = iniciarAcao(controle);
      aviso.textContent = 'Registrando…';
      servico
        .tratar(pacienteId, tratativa)
        .then(
          (atualizado) => {
            if (!ativa) return;
            desenhar(atualizado);
          },
          (erro: unknown) => {
            if (!ativa || descartarAcesso(erro)) return;
            aviso.textContent = mensagemFalha(erro);
            aviso.dataset.tone = 'error';
          },
        )
        .finally(() => {
          finalizar();
          gravacaoEmCurso = false;
          atualizarControles();
        });
    };
    const gravarAcordo = (acordo: SalvarAcordo, controle: HTMLElement) => {
      if (gravacaoEmCurso) return;
      gravacaoEmCurso = true;
      atualizarControles();
      const finalizar = iniciarAcao(controle);
      aviso.textContent = 'Salvando periodicidade…';
      servico
        .acordar(pacienteId, acordo)
        .then(
          (atualizado) => {
            if (!ativa) return;
            desenhar(atualizado);
          },
          (erro: unknown) => {
            if (!ativa || descartarAcesso(erro)) return;
            aviso.textContent = mensagemFalha(erro);
            aviso.dataset.tone = 'error';
          },
        )
        .finally(() => {
          finalizar();
          gravacaoEmCurso = false;
          atualizarControles();
        });
    };

    const abertas = sinal.pendencias.filter((item) => item.estado !== 'resolvida');
    const resolvidas = sinal.pendencias.filter((item) => item.estado === 'resolvida');
    if (!sinal.pendencias.length)
      painel.append(
        estadoVazio(
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
    // Pendência ESCRITA por pessoa, nunca misturada com as calculadas: seção própria,
    // origem declarada no texto, autor e plantão identificados. Quem lê a carteira
    // distingue o que alguém escreveu do que o sistema deduziu só de olhar.
    if (escritas === null) {
      painel.append(elemento('h3', 'Escritas no plantão'));
      painel.append(
        elemento(
          'p',
          'Não foi possível ler as pendências escritas no plantão agora. Isto não quer dizer que não existam — quer dizer que a leitura falhou. As pendências calculadas acima não dependem dessa consulta.',
        ),
      );
    } else if (escritas.length) {
      painel.append(elemento('h3', 'Escritas no plantão'));
      painel.append(
        elemento(
          'p',
          'Origem: escrita por pessoa, não deduzida pelo sistema. Resolver é ato explícito, na ficha do plantão.',
          'visao-aviso',
        ),
      );
      const lista = elemento('ul', undefined, 'pendencia-lista');
      for (const item of escritas) {
        const linha = elemento('li', undefined, 'pendencia-item');
        linha.dataset.origem = item.origem;
        linha.dataset.estado = item.situacao;
        linha.append(elemento('p', 'Pendência escrita no plantão', 'pendencia-tipo'));
        linha.append(elemento('p', item.texto, 'pendencia-motivo'));
        const marcas = [
          `Situação: ${item.situacao === 'aberta' ? 'Aberta' : 'Resolvida'}`,
          `Declarada por ${
            equipe.find((opcao) => opcao.usuario_id === item.declarado_por_usuario_id)?.rotulo ??
            'profissional do plantão'
          }`,
          `Plantão ${item.turno_id}`,
        ];
        if (dataDeInstante(item.registrado_em))
          marcas.push(`Registrada em ${dataDeInstante(item.registrado_em)}`);
        if (item.resolvido_em && dataDeInstante(item.resolvido_em))
          marcas.push(`Resolvida em ${dataDeInstante(item.resolvido_em)}`);
        linha.append(elemento('p', marcas.join(' · '), 'pendencia-marcas'));
        lista.append(linha);
      }
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
      // A ficha de plantão tem interruptor próprio e pode estar desligada: a falha dela não
      // pode derrubar a carteira nem alterar as quatro derivadas.
      // Falha de leitura NÃO pode virar "ninguém escreveu pendência": é informação que
      // existe para alertar, e omiti-la em silêncio é pior que mostrar erro. `null`
      // distingue "não deu para ler" de "leu e não há nenhuma".
      const escritasPedidas: Promise<PendenciaPlantaoHttp[] | null> = listarPendenciasEscritas
        ? listarPendenciasEscritas().catch((erro: unknown) => {
            if (exigeNovoAcesso(erro)) throw erro;
            return null;
          })
        : Promise.resolve([] as PendenciaPlantaoHttp[]);
      const [sinal, equipeCarregada, escritasCarregadas] = await Promise.all([
        servico.consultar(pacienteId),
        equipePedida,
        escritasPedidas,
      ]);
      if (!ativa) return;
      equipe = equipeCarregada;
      escritas = escritasCarregadas;
      desenhar(sinal);
    } catch (erro) {
      if (!ativa || descartarAcesso(erro)) return;
      carregamento.remove();
      status.textContent = mensagemFalha(erro);
      status.dataset.tone = 'error';
    }
  })();

  return () => {
    ativa = false;
    raiz.replaceChildren();
  };
}
