import type {
  MedidaSolicitacaoTitular,
  SolicitacaoTitular,
  TipoSolicitacaoTitular,
} from '../packages/contracts/src/solicitacao-titular.ts';
import type { ServicoSolicitacaoTitular } from './servico-solicitacao-titular-http.ts';

const formatadorData = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

const TIPOS: Record<TipoSolicitacaoTitular, string> = {
  acesso: 'Acesso aos próprios dados',
  correcao: 'Correção de dados',
  portabilidade: 'Portabilidade',
  exclusao: 'Exclusão',
};

const MEDIDAS: Record<MedidaSolicitacaoTitular, string> = {
  atendida: 'Atendida',
  atendida_parcialmente: 'Atendida em parte',
  recusada: 'Não atendida',
};

function dataLegivel(iso: string): string {
  const instante = new Date(iso);
  return Number.isNaN(instante.getTime()) ? iso : formatadorData.format(instante);
}

/** Solicitações do titular: acesso, correção, portabilidade e exclusão (FR-040).
 *
 * Registrar e responder. Responder NÃO apaga dado nenhum — grava a medida adotada e o
 * fundamento. É o que o requisito pede: "revogar consentimento não significa apagar
 * automaticamente todos os registros", e uma eventual guarda precisa de fundamento registrado.
 *
 * A tela mostra tipo, data, estado e medida. O texto do pedido e o da resposta ficam cifrados
 * no banco e não aparecem na listagem. */
export function montarSolicitacoesTitular(
  raiz: HTMLElement,
  servico: ServicoSolicitacaoTitular,
  opcoes: {
    pacienteId?: string;
    nomeDoPaciente?: (pacienteId: string) => string | undefined;
  } = {},
): () => void {
  let ativa = true;
  let cursorAtual: string | undefined;
  const anteriores: (string | undefined)[] = [];

  const secao = document.createElement('section');
  secao.className = 'solicitacoes-titular';
  const titulo = document.createElement('h2');
  titulo.textContent = 'Solicitações sobre dados pessoais';
  const explicacao = document.createElement('p');
  explicacao.className = 'solicitacoes-titular__explicacao';
  explicacao.textContent =
    'Registre aqui quando alguém pedir acesso, correção, portabilidade ou exclusão dos próprios dados, e registre a resposta dada. Responder um pedido de exclusão não apaga registros: a resposta informa a medida adotada e, quando houver guarda necessária, o motivo dela.';

  const status = document.createElement('p');
  status.className = 'solicitacoes-titular__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const lista = document.createElement('div');
  lista.className = 'solicitacoes-titular__lista';

  const voltar = document.createElement('button');
  voltar.type = 'button';
  voltar.className = 'button-secondary';
  voltar.textContent = 'Página anterior';
  const avancar = document.createElement('button');
  avancar.type = 'button';
  avancar.className = 'button-secondary';
  avancar.textContent = 'Próxima página';
  const paginacao = document.createElement('div');
  paginacao.className = 'solicitacoes-titular__paginacao';
  paginacao.append(voltar, avancar);

  // Registro de uma solicitação nova. Só aparece quando a tela está dentro de um caso: uma
  // solicitação é sempre sobre os dados de alguém, e escolher o paciente num campo de texto
  // livre seria convite a registrar no caso errado.
  const registro = document.createElement('form');
  registro.className = 'solicitacoes-titular__registro';
  registro.noValidate = true;
  const tipoSelecao = document.createElement('select');
  tipoSelecao.id = 'solicitacao-tipo';
  for (const [valor, texto] of Object.entries(TIPOS)) {
    const opcao = document.createElement('option');
    opcao.value = valor;
    opcao.textContent = texto;
    tipoSelecao.append(opcao);
  }
  const tipoRotulo = document.createElement('label');
  tipoRotulo.htmlFor = tipoSelecao.id;
  tipoRotulo.textContent = 'O que foi pedido';
  const descricao = document.createElement('textarea');
  descricao.id = 'solicitacao-descricao';
  descricao.rows = 3;
  descricao.maxLength = 4_000;
  const descricaoRotulo = document.createElement('label');
  descricaoRotulo.htmlFor = descricao.id;
  descricaoRotulo.textContent = 'Como o pedido chegou e o que foi pedido';
  const registrar = document.createElement('button');
  registrar.type = 'submit';
  registrar.className = 'button-primary';
  registrar.textContent = 'Registrar solicitação';
  const avisoRegistro = document.createElement('p');
  avisoRegistro.className = 'solicitacoes-titular__aviso';
  avisoRegistro.setAttribute('role', 'status');
  avisoRegistro.setAttribute('aria-live', 'polite');
  registro.append(tipoRotulo, tipoSelecao, descricaoRotulo, descricao, registrar, avisoRegistro);

  secao.append(titulo, explicacao);
  if (opcoes.pacienteId) secao.append(registro);
  secao.append(status, lista, paginacao);
  raiz.replaceChildren(secao);

  const desenharResposta = (item: SolicitacaoTitular, bloco: HTMLElement) => {
    const formulario = document.createElement('form');
    formulario.className = 'solicitacoes-titular__resposta';
    formulario.noValidate = true;
    const medida = document.createElement('select');
    medida.id = `solicitacao-medida-${item.solicitacao_id}`;
    for (const [valor, texto] of Object.entries(MEDIDAS)) {
      const opcao = document.createElement('option');
      opcao.value = valor;
      opcao.textContent = texto;
      medida.append(opcao);
    }
    const medidaRotulo = document.createElement('label');
    medidaRotulo.htmlFor = medida.id;
    medidaRotulo.textContent = 'Medida adotada';
    const texto = document.createElement('textarea');
    texto.id = `solicitacao-resposta-${item.solicitacao_id}`;
    texto.rows = 3;
    texto.maxLength = 4_000;
    const textoRotulo = document.createElement('label');
    textoRotulo.htmlFor = texto.id;
    textoRotulo.textContent = 'Resposta dada e, se houver guarda, o motivo dela';
    const enviar = document.createElement('button');
    enviar.type = 'submit';
    enviar.className = 'button-primary';
    enviar.textContent = 'Registrar resposta';
    const aviso = document.createElement('p');
    aviso.className = 'solicitacoes-titular__aviso';
    aviso.setAttribute('role', 'status');
    aviso.setAttribute('aria-live', 'polite');
    formulario.append(medidaRotulo, medida, textoRotulo, texto, enviar, aviso);
    bloco.append(formulario);

    formulario.addEventListener('submit', (evento) => {
      evento.preventDefault();
      if (enviar.disabled) return;
      if (!texto.value.trim()) {
        aviso.textContent = 'Escreva a resposta antes de registrar.';
        texto.focus();
        return;
      }
      enviar.disabled = true;
      aviso.textContent = 'Registrando…';
      void servico
        .responder({
          solicitacao_id: item.solicitacao_id,
          paciente_id: item.paciente_id,
          medida: medida.value as MedidaSolicitacaoTitular,
          resposta: texto.value.trim(),
          versao_esperada: item.versao,
        })
        .then(() => {
          if (!ativa) return;
          void carregar();
        })
        .catch((erro: unknown) => {
          if (!ativa) return;
          const codigo =
            erro && typeof erro === 'object' && 'codigo' in erro ? String(erro.codigo) : '';
          aviso.textContent =
            codigo === 'conflito_versao'
              ? 'Alguém respondeu esta solicitação enquanto você escrevia. Recarregue para ver.'
              : codigo === 'sem_permissao'
                ? 'Sua conta não pode responder solicitações.'
                : 'Não foi possível registrar a resposta. Tente de novo.';
          enviar.disabled = false;
        });
    });
  };

  const desenhar = (itens: readonly SolicitacaoTitular[]) => {
    lista.replaceChildren();
    for (const item of itens) {
      const bloco = document.createElement('article');
      bloco.className = `solicitacoes-titular__item solicitacoes-titular__item--${item.estado}`;
      const cabecalho = document.createElement('h3');
      cabecalho.textContent = TIPOS[item.tipo];
      const meta = document.createElement('p');
      meta.className = 'solicitacoes-titular__meta';
      const quem = opcoes.nomeDoPaciente?.(item.paciente_id);
      const partes = [`Recebida em ${dataLegivel(item.recebida_em)}`];
      if (quem && !opcoes.pacienteId) partes.push(quem);
      if (item.estado === 'respondida' && item.medida && item.respondida_em)
        partes.push(`${MEDIDAS[item.medida]} em ${dataLegivel(item.respondida_em)}`);
      else partes.push('Sem resposta registrada');
      meta.textContent = partes.join(' · ');
      bloco.append(cabecalho, meta);
      if (item.estado === 'recebida') desenharResposta(item, bloco);
      lista.append(bloco);
    }
  };

  const carregar = async () => {
    status.textContent = 'Carregando solicitações…';
    voltar.disabled = true;
    avancar.disabled = true;
    try {
      const pagina = await servico.listar({
        limite: 25,
        ...(cursorAtual ? { cursor: cursorAtual } : {}),
        ...(opcoes.pacienteId ? { paciente_id: opcoes.pacienteId } : {}),
      });
      if (!ativa) return;
      desenhar(pagina.itens);
      status.textContent =
        pagina.itens.length === 0 ? 'Nenhuma solicitação registrada até agora.' : '';
      avancar.disabled = pagina.proximo_cursor === null;
      avancar.dataset.cursor = pagina.proximo_cursor ?? '';
      voltar.disabled = anteriores.length === 0;
    } catch (erro) {
      if (!ativa) return;
      lista.replaceChildren();
      const codigo =
        erro && typeof erro === 'object' && 'codigo' in erro ? String(erro.codigo) : '';
      status.textContent =
        codigo === 'sem_permissao'
          ? 'Sua conta não pode ver as solicitações sobre dados pessoais.'
          : 'Não foi possível carregar as solicitações. Tente de novo.';
      voltar.disabled = anteriores.length === 0;
    }
  };

  registro.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const pacienteId = opcoes.pacienteId;
    if (!pacienteId || registrar.disabled) return;
    if (!descricao.value.trim()) {
      avisoRegistro.textContent = 'Descreva o pedido antes de registrar.';
      descricao.focus();
      return;
    }
    registrar.disabled = true;
    avisoRegistro.textContent = 'Registrando…';
    void servico
      .registrar({
        paciente_id: pacienteId,
        tipo: tipoSelecao.value as TipoSolicitacaoTitular,
        descricao: descricao.value.trim(),
        recebida_em: new Date().toISOString(),
      })
      .then(() => {
        if (!ativa) return;
        descricao.value = '';
        avisoRegistro.textContent = 'Solicitação registrada.';
        registrar.disabled = false;
        anteriores.length = 0;
        cursorAtual = undefined;
        void carregar();
      })
      .catch((erro: unknown) => {
        if (!ativa) return;
        const codigo =
          erro && typeof erro === 'object' && 'codigo' in erro ? String(erro.codigo) : '';
        avisoRegistro.textContent =
          codigo === 'sem_permissao'
            ? 'Sua conta não pode registrar solicitações.'
            : 'Não foi possível registrar. Tente de novo.';
        registrar.disabled = false;
      });
  });

  avancar.addEventListener('click', () => {
    const proximo = avancar.dataset.cursor;
    if (!proximo) return;
    anteriores.push(cursorAtual);
    cursorAtual = proximo;
    void carregar();
  });
  voltar.addEventListener('click', () => {
    if (anteriores.length === 0) return;
    cursorAtual = anteriores.pop();
    void carregar();
  });

  void carregar();
  return () => {
    ativa = false;
    raiz.replaceChildren();
  };
}
