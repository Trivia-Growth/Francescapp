import type { SituacaoCaso } from '../packages/contracts/src/index.js';
import { rotulosSituacao } from './acompanhamento-caso.js';

export type PacienteFicha = {
  id: string;
  nome: string;
  nome_preferencia: string | null;
  /** Só a lista do Administrador traz a situação; sem ela o cabeçalho não afirma nada. */
  situacao?: SituacaoCaso | null;
};

/** Ação rápida de cada seção, no cabeçalho, para não obrigar a procurar a aba certa. */
const ATALHOS: Readonly<Record<string, string>> = Object.freeze({
  diario: 'Novo relato',
  tarefas: 'Nova tarefa',
  plano: 'Novo objetivo',
});
const LIMITE_ATALHOS = 2;

export type SecaoFicha = {
  id: string;
  rotulo: string;
  /** Sem `montar`, a seção é indicada como indisponível nesta versão, sem dados nem ação. */
  montar: ((raiz: HTMLElement, pendente: (pendente: boolean) => void) => () => void) | null;
  /** Aviso de descarte quando a seção tem alteração não confirmada. */
  descarte?: string;
};

export type OpcoesFicha = {
  raiz: HTMLElement;
  paciente: PacienteFicha;
  secoes: SecaoFicha[];
  secaoInicial?: string;
  confirmar: (mensagem: string) => boolean;
  aoSelecionar: (secao: string) => void;
  aoVoltar: () => void;
};

export type Ficha = {
  secaoAtual(): string;
  pendencia(): { secao: string; mensagem: string } | null;
  selecionar(secao: string, opcoes?: { confirmar?: boolean }): boolean;
  /** Remove o conteúdo carregado da seção atual e invalida respostas pendentes. */
  limparSecao(): void;
  remontarSecao(): void;
  secaoVazia(): boolean;
  focarTitulo(): void;
  desmontar(): void;
};

const DESCARTE_PADRAO =
  'Há alterações não confirmadas. Ao sair, elas serão descartadas. Deseja continuar?';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RotaFicha = { id: string; secao: string };

/** O fragmento nunca vai ao servidor; mesmo assim só um identificador opaco entra nele. */
export function lerRotaFicha(hash: string): RotaFicha | null {
  const encontrada = /^#paciente\/([^/]+)\/([a-z-]{1,24})$/.exec(hash);
  if (!encontrada) return null;
  const [, id, secao] = encontrada;
  if (!id || !secao || !UUID.test(id)) return null;
  return { id: id.toLowerCase(), secao };
}

export function hashFicha(id: string, secao: string): string {
  return `#paciente/${id}/${secao}`;
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = partes[0];
  if (!primeira) return '?';
  const ultima = partes.length > 1 ? partes[partes.length - 1] : '';
  return `${Array.from(primeira)[0] ?? ''}${ultima ? (Array.from(ultima)[0] ?? '') : ''}`.toLocaleUpperCase(
    'pt-BR',
  );
}

export function criarAvatar(nome: string): HTMLSpanElement {
  const avatar = document.createElement('span');
  avatar.className = 'avatar';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = iniciais(nome);
  return avatar;
}

/** Monta a ficha de um paciente: cabeçalho, abas e uma única seção montada por vez. */
export function montarFicha(opcoes: OpcoesFicha): Ficha {
  const { raiz, paciente, secoes } = opcoes;
  let ativa = true;
  let atual = '';
  let pendente = false;
  let montagem = 0;
  let desmontarSecao: (() => void) | null = null;
  let vazia = true;

  const elemento = <K extends keyof HTMLElementTagNameMap>(
    tipo: K,
    classe?: string,
    texto?: string,
  ) => {
    const el = document.createElement(tipo);
    if (classe) el.className = classe;
    if (texto !== undefined) el.textContent = texto;
    return el;
  };

  const voltar = elemento('button', 'button-quiet ficha-voltar', 'Voltar para a lista');
  voltar.type = 'button';
  voltar.id = 'ficha-voltar';
  const titulo = elemento('h1', undefined, paciente.nome);
  titulo.id = 'ficha-title';
  titulo.tabIndex = -1;
  const preferencia = elemento(
    'p',
    'ficha-preferencia',
    paciente.nome_preferencia
      ? `Nome de preferência: ${paciente.nome_preferencia}`
      : 'Nome de preferência não informado',
  );
  const identidade = elemento('div', 'ficha-identidade');
  const textoIdentidade = elemento('div');
  textoIdentidade.append(titulo, preferencia);
  if (paciente.situacao) {
    const situacao = elemento('span', 'pessoa-situacao', rotulosSituacao[paciente.situacao]);
    situacao.dataset.situacao = paciente.situacao;
    textoIdentidade.append(situacao);
  }
  identidade.append(criarAvatar(paciente.nome), textoIdentidade);
  const acoes = elemento('div', 'ficha-acoes');
  for (const secao of secoes) {
    if (acoes.childElementCount >= LIMITE_ATALHOS) break;
    const rotulo = ATALHOS[secao.id];
    if (!rotulo || !secao.montar) continue;
    const atalho = elemento('button', 'button-secondary', rotulo);
    atalho.type = 'button';
    atalho.addEventListener('click', () => {
      selecionar(secao.id);
    });
    acoes.append(atalho);
  }
  if (acoes.childElementCount) identidade.append(acoes);
  const cabecalho = elemento('header', 'ficha-cabecalho');
  cabecalho.append(voltar, identidade);

  const abas = elemento('div', 'ficha-abas');
  abas.setAttribute('role', 'tablist');
  abas.setAttribute('aria-label', 'Seções da ficha');
  const botoes = new Map<string, HTMLButtonElement>();
  for (const secao of secoes) {
    const aba = elemento('button', 'ficha-aba');
    aba.type = 'button';
    aba.id = `ficha-aba-${secao.id}`;
    aba.setAttribute('role', 'tab');
    aba.setAttribute('aria-controls', 'ficha-painel');
    aba.setAttribute('aria-selected', 'false');
    aba.tabIndex = -1;
    aba.append(secao.rotulo);
    if (!secao.montar) aba.append(' ', elemento('span', 'ficha-aba-estado', 'em breve'));
    aba.addEventListener('click', () => {
      if (!selecionar(secao.id)) botoes.get(atual)?.focus();
    });
    botoes.set(secao.id, aba);
    abas.append(aba);
  }

  const painel = elemento('div', 'ficha-painel');
  painel.id = 'ficha-painel';
  painel.setAttribute('role', 'tabpanel');
  painel.tabIndex = 0;
  raiz.replaceChildren(cabecalho, abas, painel);

  const mensagemAtual = (): string =>
    secoes.find((secao) => secao.id === atual)?.descarte ?? DESCARTE_PADRAO;

  function descartarSecao(): void {
    montagem += 1;
    pendente = false;
    desmontarSecao?.();
    desmontarSecao = null;
    vazia = true;
    painel.replaceChildren();
  }

  function marcarAbas(): void {
    for (const [id, aba] of botoes) {
      const selecionada = id === atual;
      aba.setAttribute('aria-selected', String(selecionada));
      aba.tabIndex = selecionada ? 0 : -1;
      // Na faixa rolável do celular, a aba atual precisa estar à vista, também depois de recarregar.
      if (selecionada) aba.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
    painel.setAttribute('aria-labelledby', `ficha-aba-${atual}`);
  }

  function montarSecao(secao: SecaoFicha): void {
    const marca = ++montagem;
    const conteudo = elemento('div', 'ficha-secao');
    conteudo.dataset.secao = secao.id;
    painel.replaceChildren(conteudo);
    vazia = false;
    if (!secao.montar) {
      conteudo.append(
        elemento('h2', undefined, `${secao.rotulo}: em breve`),
        elemento(
          'p',
          undefined,
          'Esta seção ainda não está disponível nesta versão. Nada foi registrado nem enviado aqui.',
        ),
      );
      return;
    }
    try {
      desmontarSecao = secao.montar(conteudo, (valor) => {
        if (ativa && marca === montagem) pendente = valor;
      });
    } catch {
      desmontarSecao = null;
      const erro = elemento('p', undefined, 'Não foi possível abrir esta seção. Tente novamente.');
      erro.dataset.tone = 'error';
      conteudo.replaceChildren(erro);
    }
  }

  function selecionar(id: string, { confirmar = true }: { confirmar?: boolean } = {}): boolean {
    if (!ativa) return false;
    const alvo = secoes.find((secao) => secao.id === id);
    if (!alvo) return false;
    if (id === atual) return true;
    if (confirmar && pendente && !opcoes.confirmar(mensagemAtual())) return false;
    descartarSecao();
    atual = id;
    marcarAbas();
    montarSecao(alvo);
    opcoes.aoSelecionar(id);
    return true;
  }

  voltar.addEventListener('click', () => {
    if (pendente && !opcoes.confirmar(mensagemAtual())) return;
    opcoes.aoVoltar();
  });

  abas.addEventListener('keydown', (evento) => {
    const ordem = secoes.map((secao) => botoes.get(secao.id)).filter((aba) => aba !== undefined);
    const foco = ordem.indexOf(document.activeElement as HTMLButtonElement);
    if (foco < 0) return;
    const destino =
      evento.key === 'ArrowRight'
        ? (foco + 1) % ordem.length
        : evento.key === 'ArrowLeft'
          ? (foco - 1 + ordem.length) % ordem.length
          : evento.key === 'Home'
            ? 0
            : evento.key === 'End'
              ? ordem.length - 1
              : -1;
    if (destino < 0) return;
    evento.preventDefault();
    for (const aba of ordem) aba.tabIndex = -1;
    const aba = ordem[destino];
    if (!aba) return;
    aba.tabIndex = 0;
    aba.focus();
  });

  const inicial = secoes.find((secao) => secao.id === opcoes.secaoInicial) ?? secoes[0];
  if (inicial) selecionar(inicial.id, { confirmar: false });

  return {
    secaoAtual: () => atual,
    pendencia: () => (pendente ? { secao: atual, mensagem: mensagemAtual() } : null),
    selecionar,
    limparSecao: descartarSecao,
    remontarSecao() {
      const secao = secoes.find((item) => item.id === atual);
      if (ativa && secao && vazia) montarSecao(secao);
    },
    secaoVazia: () => vazia,
    focarTitulo: () => titulo.focus(),
    desmontar() {
      ativa = false;
      descartarSecao();
      raiz.replaceChildren();
    },
  };
}
