import type { EventoAuditoria } from '../packages/contracts/src/auditoria.ts';
import type { FiltrosAuditoria, ServicoAuditoria } from './servico-auditoria-http.ts';

const formatadorInstante = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: 'America/Sao_Paulo',
});

function instanteLegivel(iso: string): string {
  const instante = new Date(iso);
  return Number.isNaN(instante.getTime()) ? iso : formatadorInstante.format(instante);
}

const RESULTADOS = {
  permitido: 'Permitido',
  negado: 'Negado',
  falhou: 'Falhou',
} as const;

/** Converte `api.listar_concessoes_equipe` em "Listar concessões da equipe".
 * A trilha guarda o nome técnico da operação porque é ele que identifica o caminho de código;
 * a tela mostra o nome técnico junto do legível para que a pessoa consiga procurar por ele. */
function acaoLegivel(acao: string): string {
  const semPrefixo = acao.replace(/^api\./, '').replace(/_/g, ' ');
  return semPrefixo.charAt(0).toUpperCase() + semPrefixo.slice(1);
}

function autorDoEvento(
  evento: EventoAuditoria,
  nomeDoUsuario?: (usuarioId: string) => string | undefined,
): string {
  if (evento.ator_usuario_id)
    return (
      nomeDoUsuario?.(evento.ator_usuario_id) ?? `Usuário ${evento.ator_usuario_id.slice(0, 8)}`
    );
  if (evento.ator_auth_id) return `Acesso não vinculado ${evento.ator_auth_id.slice(0, 8)}`;
  return evento.operador_restrito ?? 'Origem não identificada';
}

/** Consulta da trilha de auditoria (FR-039).
 *
 * Mostra identidade, data, operação e objeto. NÃO mostra conteúdo: o motivo cifrado de uma
 * edição e o `request_id` nem chegam ao navegador — o banco não concede essas colunas a esta
 * operação. Abrir esta tela é, ela própria, um evento registrado na trilha. */
export function montarAuditoria(
  raiz: HTMLElement,
  servico: ServicoAuditoria,
  opcoes: { nomeDoUsuario?: (usuarioId: string) => string | undefined } = {},
): () => void {
  let ativa = true;
  let cursorAtual: string | undefined;
  const anteriores: (string | undefined)[] = [];

  const secao = document.createElement('section');
  secao.className = 'auditoria';
  const titulo = document.createElement('h2');
  titulo.textContent = 'Registro de acessos e alterações';
  const explicacao = document.createElement('p');
  explicacao.className = 'auditoria__explicacao';
  explicacao.textContent =
    'Cada consulta, alteração e mudança de acesso fica registrada com quem fez, quando e sobre o quê. O registro não guarda o conteúdo em si, e não pode ser apagado nem corrigido depois.';

  const filtros = document.createElement('form');
  filtros.className = 'auditoria__filtros';
  filtros.noValidate = true;

  const campo = (
    id: string,
    rotulo: string,
    controle: HTMLInputElement | HTMLSelectElement,
  ): HTMLElement => {
    const envolucro = document.createElement('div');
    envolucro.className = 'auditoria__campo';
    const etiqueta = document.createElement('label');
    etiqueta.htmlFor = id;
    etiqueta.textContent = rotulo;
    controle.id = id;
    envolucro.append(etiqueta, controle);
    return envolucro;
  };

  const acao = document.createElement('input');
  acao.type = 'text';
  acao.maxLength = 120;
  acao.placeholder = 'Ex.: api.consultar_auditoria';
  const resultado = document.createElement('select');
  const opcoesResultado: readonly (readonly [string, string])[] = [
    ['', 'Todos'],
    ...Object.entries(RESULTADOS),
  ];
  for (const [valor, texto] of opcoesResultado) {
    const opcao = document.createElement('option');
    opcao.value = valor;
    opcao.textContent = texto;
    resultado.append(opcao);
  }
  const de = document.createElement('input');
  de.type = 'date';
  const ate = document.createElement('input');
  ate.type = 'date';

  const aplicar = document.createElement('button');
  aplicar.type = 'submit';
  aplicar.className = 'button-primary';
  aplicar.textContent = 'Aplicar filtros';
  const limpar = document.createElement('button');
  limpar.type = 'button';
  limpar.className = 'button-secondary';
  limpar.textContent = 'Limpar';
  const acoes = document.createElement('div');
  acoes.className = 'auditoria__acoes';
  acoes.append(aplicar, limpar);

  filtros.append(
    campo('auditoria-acao', 'Operação', acao),
    campo('auditoria-resultado', 'Resultado', resultado),
    campo('auditoria-de', 'A partir de', de),
    campo('auditoria-ate', 'Até', ate),
    acoes,
  );

  const status = document.createElement('p');
  status.className = 'auditoria__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const tabela = document.createElement('table');
  tabela.className = 'auditoria__tabela';
  const cabecalho = document.createElement('thead');
  const linhaCabecalho = document.createElement('tr');
  for (const texto of ['Quando', 'Quem', 'Operação', 'Objeto', 'Resultado']) {
    const celula = document.createElement('th');
    celula.scope = 'col';
    celula.textContent = texto;
    linhaCabecalho.append(celula);
  }
  cabecalho.append(linhaCabecalho);
  const corpo = document.createElement('tbody');
  tabela.append(cabecalho, corpo);

  const voltar = document.createElement('button');
  voltar.type = 'button';
  voltar.className = 'button-secondary';
  voltar.textContent = 'Página anterior';
  const avancar = document.createElement('button');
  avancar.type = 'button';
  avancar.className = 'button-secondary';
  avancar.textContent = 'Próxima página';
  const paginacao = document.createElement('div');
  paginacao.className = 'auditoria__paginacao';
  paginacao.append(voltar, avancar);

  secao.append(titulo, explicacao, filtros, status, tabela, paginacao);
  raiz.replaceChildren(secao);

  const filtrosAtuais = (): FiltrosAuditoria => {
    const entrada: FiltrosAuditoria = { limite: 25 };
    if (acao.value.trim()) entrada.acao = acao.value.trim();
    if (resultado.value) entrada.resultado = resultado.value as FiltrosAuditoria['resultado'];
    // O campo de data é um dia local; a trilha guarda instante com fuso. "A partir de" abre no
    // começo do dia e "até" fecha no fim, senão um evento das 14h some de um filtro do próprio dia.
    if (de.value) entrada.instante_de = new Date(`${de.value}T00:00:00`).toISOString();
    if (ate.value) entrada.instante_ate = new Date(`${ate.value}T23:59:59.999`).toISOString();
    if (cursorAtual) entrada.cursor = cursorAtual;
    return entrada;
  };

  const desenhar = (itens: readonly EventoAuditoria[]) => {
    corpo.replaceChildren();
    for (const evento of itens) {
      const linha = document.createElement('tr');
      const celulas = [
        instanteLegivel(evento.instante),
        autorDoEvento(evento, opcoes.nomeDoUsuario),
        acaoLegivel(evento.acao),
        evento.objeto_id
          ? `${evento.tipo_objeto} ${evento.objeto_id.slice(0, 8)}`
          : evento.tipo_objeto,
        RESULTADOS[evento.resultado],
      ];
      for (const [indice, texto] of celulas.entries()) {
        const celula = document.createElement('td');
        celula.textContent = texto;
        if (indice === 2) celula.title = evento.acao;
        if (indice === 4)
          celula.className = `auditoria__resultado auditoria__resultado--${evento.resultado}`;
        linha.append(celula);
      }
      corpo.append(linha);
    }
  };

  const carregar = async () => {
    status.textContent = 'Carregando registros…';
    aplicar.disabled = true;
    voltar.disabled = true;
    avancar.disabled = true;
    try {
      const pagina = await servico.consultar(filtrosAtuais());
      if (!ativa) return;
      desenhar(pagina.itens);
      status.textContent =
        pagina.itens.length === 0
          ? 'Nenhum registro para estes filtros.'
          : `${pagina.itens.length} ${pagina.itens.length === 1 ? 'registro' : 'registros'} nesta página.`;
      avancar.disabled = pagina.proximo_cursor === null;
      avancar.dataset.cursor = pagina.proximo_cursor ?? '';
      voltar.disabled = anteriores.length === 0;
    } catch (erro) {
      if (!ativa) return;
      corpo.replaceChildren();
      const codigo =
        erro && typeof erro === 'object' && 'codigo' in erro ? String(erro.codigo) : '';
      status.textContent =
        codigo === 'sem_permissao'
          ? 'Sua conta não pode consultar o registro de acessos.'
          : 'Não foi possível carregar o registro. Tente de novo.';
      avancar.disabled = true;
      voltar.disabled = anteriores.length === 0;
    } finally {
      if (ativa) aplicar.disabled = false;
    }
  };

  filtros.addEventListener('submit', (evento) => {
    evento.preventDefault();
    anteriores.length = 0;
    cursorAtual = undefined;
    void carregar();
  });
  limpar.addEventListener('click', () => {
    acao.value = '';
    resultado.value = '';
    de.value = '';
    ate.value = '';
    anteriores.length = 0;
    cursorAtual = undefined;
    void carregar();
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
