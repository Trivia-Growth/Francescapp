import type { SituacaoCaso } from '../packages/contracts/src/index.js';

export type PacienteFicha = {
  id: string;
  nome: string;
  nome_preferencia: string | null;
  /** Só a lista do Administrador traz a situação; sem ela o cabeçalho não afirma nada. */
  situacao?: SituacaoCaso | null;
};

export type SecaoFicha = {
  id: string;
  rotulo: string;
  /** Sem `montar`, a seção é indicada como indisponível nesta versão, sem dados nem ação.
   *
   *  Pode devolver a desmontagem direto ou uma promessa dela. A promessa existe para a
   *  seção poder chegar por importação dinâmica: o código de uma aba só desce quando
   *  alguém abre aquela aba. Seção leve continua síncrona — não há ganho em adiar o que
   *  já está no pacote, e manter as duas formas evita converter o que não precisa. */
  montar:
    | ((
        raiz: HTMLElement,
        pendente: (pendente: boolean) => void,
      ) => (() => void) | Promise<() => void>)
    | null;
  /** Aviso de descarte quando a seção tem alteração não confirmada. */
  descarte?: string;
};

export type OpcoesFicha = {
  raiz: HTMLElement;
  paciente: PacienteFicha;
  secoes: SecaoFicha[];
  nivelTitulo?: 1 | 2;
  secaoInicial?: string;
  /** Ids que ficam na primeira faixa; os demais entram em "Mais seções". Sem esta lista, ou
   * se ela cobrir todas as seções recebidas, a ficha mantém a faixa única de sempre. */
  primarias?: readonly string[];
  /** Assíncrona desde que a confirmação passou a ser desenhada na própria página. */
  confirmar: (mensagem: string) => Promise<boolean>;
  aoSelecionar: (secao: string) => void;
  aoVoltar: () => void;
};

export type Ficha = {
  secaoAtual(): string;
  pendencia(): { secao: string; mensagem: string } | null;
  selecionar(secao: string, opcoes?: { confirmar?: boolean }): Promise<boolean>;
  /** Remove o conteúdo carregado da seção atual e invalida respostas pendentes. */
  limparSecao(): void;
  remontarSecao(): void;
  secaoVazia(): boolean;
  focarTitulo(): void;
  desmontar(): void;
};

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
