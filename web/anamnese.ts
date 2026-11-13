import {
  salvarAnamneseSchema,
  type Anamnese,
  type SalvarAnamnese,
} from '../packages/contracts/src/index.js';
import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.js';
import { esqueletoCarregando } from './esqueleto.js';

/** Roteiro sugerido de FR-003. Vem do banco (`ffcm.anamnese.roteiro`), editável na tela de
 *  administração pela diretriz de 11/11/2026 — a estrutura de seis seções foi aprovada pelo
 *  solicitante em 13/11/2026 e mora na migration `20261123100000`, não aqui.
 *
 *  Continua sendo sugestão, não formulário fixo: quem preencher mantém "Outra seção" e
 *  "Outro campo" livres logo abaixo. Lista vazia é estado legítimo — a tela deixa de sugerir
 *  e nada mais muda. */
type Sugestao = { secao: string; campo: string };

const SEPARADOR_ROTEIRO = '::';

/** Converte as linhas `Seção :: Pergunta` do catálogo. Linha sem separador, sem seção ou sem
 *  pergunta é ignorada em silêncio: é configuração digitada por pessoa, e uma entrada torta
 *  não pode derrubar a tela inteira da anamnese. */
export function lerRoteiroAnamnese(linhas: readonly string[]): Sugestao[] {
  const vistas = new Set<string>();
  const sugestoes: Sugestao[] = [];
  for (const linha of linhas) {
    const corte = linha.indexOf(SEPARADOR_ROTEIRO);
    if (corte < 0) continue;
    const secao = linha.slice(0, corte).trim();
    const campo = linha.slice(corte + SEPARADOR_ROTEIRO.length).trim();
    if (!secao || !campo) continue;
    const chave = `${secao}${SEPARADOR_ROTEIRO}${campo}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    sugestoes.push({ secao, campo });
  }
  return sugestoes;
}

type Servico = {
  consultarAnamnese(pacienteId: string): Promise<Anamnese | null>;
  consultarHistoricoAnamnese?(pacienteId: string, antesVersao?: number): Promise<Anamnese | null>;
  salvarAnamnese(pacienteId: string, entrada: SalvarAnamnese, chave: string): Promise<Anamnese>;
};

/** Interface isolada; montagem depende da integração segura do servidor. */
export function montarAnamnese(
  raiz: HTMLElement,
  pacienteId: string,
  servico: Servico,
  acessoPerdido: (erro: unknown) => void,
  alteracaoPendente: (pendente: boolean) => void = () => {},
  historicoHabilitado: boolean | Promise<boolean> = false,
  roteiroSugerido: readonly string[] | Promise<readonly string[]> = [],
): () => void {
  let ativa = true;
  let versao = 0;
  let conflitoVersao = false;
  let sugestoes: Sugestao[] = [];
  let redesenharSugeridas: (() => void) | undefined;
  let pendente: { entrada: SalvarAnamnese; chave: string } | null = null;
  const descartarAcesso = (erro: unknown): boolean => {
    if (!exigeNovoAcesso(erro)) return false;
    ativa = false;
    pendente = null;
    raiz.replaceChildren();
    acessoPerdido(erro);
    return true;
  };
  const elemento = <K extends keyof HTMLElementTagNameMap>(tipo: K, texto?: string) => {
    const el = document.createElement(tipo);
    if (texto !== undefined) el.textContent = texto;
    return el;
  };
  const status = elemento('p', 'Carregando anamnese…');
  status.setAttribute('role', 'status');
  raiz.replaceChildren(esqueletoCarregando(3, true), status);
  let historicoDisponivel = false;
  let mostrarHistorico: (() => void) | undefined;
  const desenhar = (resultado: Anamnese | null) => {
    if (!ativa) return;
    versao = resultado?.versao ?? 0;
    const form = elemento('form');
    const campos = elemento('div');
    const aviso = elemento('p');
    aviso.setAttribute('role', 'status');
    const salvar = elemento('button', 'Salvar anamnese');
    salvar.type = 'submit';
    const retry = elemento('button', 'Tentar confirmar salvamento');
    retry.type = 'button';
    retry.hidden = true;
    form.append(elemento('h2', 'Anamnese de coordenação'));
    const secoes = resultado?.secoes ?? [];
    const resumoPendencias = elemento('p');
    form.append(resumoPendencias);
    if (!secoes.length) form.append(elemento('p', 'Nenhuma pergunta registrada ainda.'));
    type Campo = {
      secao: string;
      campo: string;
      esperado: boolean;
      estado: HTMLSelectElement;
      valor: HTMLTextAreaElement;
      fonte: HTMLInputElement;
      data: HTMLInputElement;
    };
    const entradas: Campo[] = [];
    const respostaDe = (e: Campo) =>
      e.estado.value === 'pendente'
        ? { campo: e.campo, estado: 'pendente' }
        : {
            campo: e.campo,
            estado: e.estado.value,
            fonte: e.fonte.value,
            data: e.data.value,
            ...(e.estado.value === 'informado' ? { valor: e.valor.value } : {}),
          };
    const atualizarPendencias = () => {
      const secoesPendentes = [
        ...new Set(
          entradas
            .filter(
              (e) =>
                e.esperado &&
                (e.estado.value === 'pendente' ||
                  !salvarAnamneseSchema.safeParse({
                    versao_esperada: versao,
                    secoes: [
                      { id: e.secao, camposEsperados: [e.campo], respostas: [respostaDe(e)] },
                    ],
                  }).success),
            )
            .map((e) => e.secao),
        ),
      ];
      resumoPendencias.textContent =
        !entradas.length && !secoes.length
          ? 'Escolha uma pergunta sugerida ou crie a sua para começar.'
          : secoesPendentes.length
            ? `Seções com pendências: ${secoesPendentes.join(', ')}.`
            : 'Nenhuma pendência identificada nos campos informados.';
    };
    const adicionar = (
      secao: string,
      campo: string,
      esperado: boolean,
      resposta?: (typeof secoes)[number]['respostas'][number],
    ) => {
      const grupo = elemento('fieldset');
      grupo.append(elemento('legend', `${secao} — ${campo}`));
      const estado = elemento('select');
      for (const [valor, texto] of [
        ['pendente', 'Pendente'],
        ['informado', 'Informado'],
        ['desconhecido', 'Desconhecido'],
        ['nao_se_aplica', 'Não se aplica'],
      ] as const) {
        const opcao = elemento('option', texto);
        opcao.value = valor;
        estado.append(opcao);
      }
      estado.value = resposta?.estado ?? 'pendente';
      const valor = elemento('textarea');
      const fonte = elemento('input');
      const data = elemento('input');
      data.type = 'date';
      if (resposta?.estado === 'informado') valor.value = resposta.valor;
      if (resposta && resposta.estado !== 'pendente') {
        fonte.value = resposta.fonte;
        data.value = resposta.data;
      }
      const rotular = (texto: string, controle: HTMLElement) => {
        const label = elemento('label', texto);
        label.append(controle);
        grupo.append(label);
      };
      rotular('Estado', estado);
      rotular('Resposta', valor);
      rotular('Fonte', fonte);
      rotular('Data', data);
      const atualizar = () => {
        valor.disabled = estado.value !== 'informado';
        fonte.disabled = data.disabled = estado.value === 'pendente';
      };
      estado.addEventListener('change', () => {
        atualizar();
        atualizarPendencias();
      });
      atualizar();
      entradas.push({ secao, campo, esperado, estado, valor, fonte, data });
      campos.append(grupo);
      atualizarPendencias();
    };
    for (const secao of secoes) {
      const nomes = new Set([...secao.camposEsperados, ...secao.respostas.map((r) => r.campo)]);
      for (const campo of nomes)
        adicionar(
          secao.id,
          campo,
          secao.camposEsperados.includes(campo),
          secao.respostas.find((r) => r.campo === campo),
        );
    }
    atualizarPendencias();
    const novaSecao = elemento('input');
    const novoCampo = elemento('input');
    const rotularNovo = (texto: string, controle: HTMLElement) => {
      const label = elemento('label', texto);
      label.append(controle);
      form.append(label);
    };
    form.append(campos);

    const sugeridas = elemento('div');
    const existe = (secao: string, campo: string) =>
      entradas.some((entrada) => entrada.secao === secao && entrada.campo === campo);
    const atualizarSugeridas = () => {
      const faltantes = sugestoes.filter(({ secao, campo }) => !existe(secao, campo));
      if (!faltantes.length) {
        sugeridas.replaceChildren();
        return;
      }
      const escolha = elemento('select');
      const vazia = elemento('option', 'Escolha uma pergunta sugerida');
      vazia.value = '';
      escolha.append(vazia);
      faltantes.forEach(({ secao, campo }, indice) => {
        const opcao = elemento('option', `${secao} — ${campo}`);
        opcao.value = String(indice);
        escolha.append(opcao);
      });
      escolha.addEventListener('change', () => {
        const escolhida = faltantes[Number(escolha.value)];
        if (!escolhida) return;
        const { secao, campo } = escolhida;
        if (existe(secao, campo)) return;
        adicionar(secao, campo, true);
        alteracaoPendente(true);
        aviso.textContent = '';
        atualizarSugeridas();
      });
      const rotuloEscolha = elemento('label', 'Perguntas sugeridas');
      rotuloEscolha.append(escolha);
      const todas = elemento('button', 'Adicionar todas as sugeridas');
      todas.type = 'button';
      todas.addEventListener('click', () => {
        for (const { secao, campo } of faltantes)
          if (!existe(secao, campo)) adicionar(secao, campo, true);
        alteracaoPendente(true);
        aviso.textContent = '';
        atualizarSugeridas();
      });
      sugeridas.replaceChildren(rotuloEscolha, todas);
    };
    atualizarSugeridas();
    // O roteiro chega do servidor depois do primeiro desenho; guardar o redesenho aqui faz as
    // sugestões aparecerem sem recarregar a aba.
    redesenharSugeridas = atualizarSugeridas;
    form.append(sugeridas);

    rotularNovo('Outra seção', novaSecao);
    rotularNovo('Outro campo', novoCampo);
    const adicionarBotao = elemento('button', 'Adicionar campo');
    adicionarBotao.type = 'button';
    adicionarBotao.addEventListener('click', () => {
      const secao = novaSecao.value.trim();
      const campo = novoCampo.value.trim();
      if (!secao || !campo || entradas.some((e) => e.secao === secao && e.campo === campo)) {
        aviso.textContent = 'Informe seção e campo ainda não cadastrado.';
        return;
      }
      adicionar(secao, campo, true);
      alteracaoPendente(true);
      novaSecao.value = '';
      novoCampo.value = '';
      aviso.textContent = '';
      atualizarSugeridas();
    });
    form.append(adicionarBotao, salvar, retry, aviso);
    mostrarHistorico = () => {
      if (
        !ativa ||
        !historicoDisponivel ||
        !servico.consultarHistoricoAnamnese ||
        form.querySelector('[data-historico]')
      )
        return;
      const historico = elemento('section');
      historico.dataset.historico = '';
      historico.append(elemento('h3', 'Histórico de versões'));
      const conteudo = elemento('div');
      const historicoStatus = elemento('p');
      historicoStatus.setAttribute('role', 'status');
      const anterior = elemento('button', 'Consultar histórico');
      anterior.type = 'button';
      let cursor: number | undefined;
      anterior.addEventListener('click', async () => {
        if (!servico.consultarHistoricoAnamnese) return;
        anterior.disabled = true;
        historicoStatus.textContent = 'Carregando histórico…';
        try {
          const pagina = await servico.consultarHistoricoAnamnese(pacienteId, cursor);
          if (!ativa) return;
          conteudo.replaceChildren();
          if (!pagina) {
            historicoStatus.textContent = 'Não há outras versões.';
            return;
          }
          cursor = pagina.versao;
          historicoStatus.textContent = `Versão ${pagina.versao} — ${pagina.criado_em ?? ''} — autor ${pagina.criado_por_usuario_id ?? ''}`;
          for (const secao of pagina.secoes) {
            conteudo.append(elemento('h4', secao.id));
            for (const resposta of secao.respostas) {
              const detalhe =
                resposta.estado === 'pendente'
                  ? 'Pendente'
                  : `${resposta.estado}${resposta.estado === 'informado' ? `: ${resposta.valor}` : ''} — ${resposta.fonte} — ${resposta.data}`;
              conteudo.append(elemento('p', `${resposta.campo}: ${detalhe}`));
            }
          }
          anterior.textContent = 'Versão anterior';
          anterior.disabled = false;
        } catch (erro) {
          if (!ativa || descartarAcesso(erro)) return;
          historicoStatus.textContent = mensagemFalha(erro);
          anterior.disabled = false;
        }
      });
      historico.append(anterior, historicoStatus, conteudo);
      form.append(historico);
    };
    mostrarHistorico();
    const enviar = async () => {
      if (!pendente) return;
      salvar.disabled = retry.disabled = adicionarBotao.disabled = true;
      aviso.textContent = 'Salvando anamnese…';
      try {
        const salvo = await servico.salvarAnamnese(pacienteId, pendente.entrada, pendente.chave);
        if (!ativa) return;
        pendente = null;
        alteracaoPendente(false);
        desenhar(salvo);
        const mensagem = raiz.querySelector('[role="status"]');
        if (mensagem) mensagem.textContent = 'Anamnese salva.';
      } catch (erro) {
        if (!ativa || descartarAcesso(erro)) return;
        if (resultadoIncerto(erro)) {
          aviso.textContent =
            'Não foi possível confirmar o salvamento. Tente confirmar antes de editar novamente.';
          retry.hidden = false;
          retry.disabled = false;
        } else {
          pendente = null;
          campos.removeAttribute('inert');
          novaSecao.disabled = novoCampo.disabled = false;
          conflitoVersao = erro instanceof FalhaApi && erro.codigo === 'conflito_versao';
          salvar.disabled = conflitoVersao;
          adicionarBotao.disabled = false;
          retry.hidden = true;
          aviso.textContent = conflitoVersao
            ? 'A anamnese foi alterada por outra pessoa. Copie seu rascunho antes de recarregar a página para consultar a versão atual; suas alterações ainda não foram salvas.'
            : mensagemFalha(erro);
        }
      }
    };
    form.addEventListener('input', () => {
      alteracaoPendente(true);
      atualizarPendencias();
    });
    form.addEventListener('change', () => alteracaoPendente(true));
    form.addEventListener('submit', (evento) => {
      evento.preventDefault();
      if (pendente || conflitoVersao) return;
      if (novaSecao.value.trim() || novoCampo.value.trim()) {
        aviso.textContent = 'Adicione o campo preenchido ou limpe seção e campo antes de salvar.';
        (novaSecao.value.trim() ? novoCampo : novaSecao).focus();
        return;
      }
      const agrupadas = new Map<
        string,
        { id: string; camposEsperados: string[]; respostas: unknown[] }
      >();
      for (const secao of secoes) {
        agrupadas.set(secao.id, { id: secao.id, camposEsperados: [], respostas: [] });
      }
      for (const e of entradas) {
        const secao = agrupadas.get(e.secao) ?? { id: e.secao, camposEsperados: [], respostas: [] };
        if (e.esperado) secao.camposEsperados.push(e.campo);
        secao.respostas.push(respostaDe(e));
        agrupadas.set(e.secao, secao);
      }
      const validada = salvarAnamneseSchema.safeParse({
        versao_esperada: versao,
        secoes: [...agrupadas.values()],
      });
      if (!validada.success) {
        aviso.textContent =
          'Preencha resposta, fonte e data para os estados informados; confira as datas.';
        return;
      }
      pendente = { entrada: validada.data, chave: crypto.randomUUID() };
      alteracaoPendente(true);
      campos.setAttribute('inert', '');
      novaSecao.disabled = novoCampo.disabled = true;
      void enviar();
    });
    retry.addEventListener('click', () => {
      void enviar();
    });
    raiz.replaceChildren(form);
  };
  const consultar = () => {
    status.textContent = 'Carregando anamnese…';
    raiz.replaceChildren(esqueletoCarregando(3, true), status);
    void servico
      .consultarAnamnese(pacienteId)
      .then(desenhar)
      .catch((erro: unknown) => {
        if (!ativa || descartarAcesso(erro)) return;
        status.textContent = mensagemFalha(erro);
        const tentarNovamente = elemento('button', 'Tentar novamente');
        tentarNovamente.type = 'button';
        tentarNovamente.addEventListener('click', consultar);
        raiz.replaceChildren(status, tentarNovamente);
      });
  };
  void Promise.resolve(historicoHabilitado)
    .then((disponivel) => {
      if (!ativa) return;
      historicoDisponivel = disponivel;
      mostrarHistorico?.();
    })
    .catch(() => {});
  void Promise.resolve(roteiroSugerido)
    .then((linhas) => {
      if (!ativa) return;
      sugestoes = lerRoteiroAnamnese(linhas);
      redesenharSugeridas?.();
    })
    .catch(() => {});
  consultar();
  return () => {
    ativa = false;
    pendente = null;
    raiz.replaceChildren();
  };
}
