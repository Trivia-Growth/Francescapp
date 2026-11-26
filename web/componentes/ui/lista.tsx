import { Component, type ReactNode } from 'react';
import { juntar } from './juntar.js';

/* Registro comparável é LINHA, não cartão (VIS-016).
 *
 * A queixa de 24/11/2026 foi literal: *"não existe visão de lista de pacientes, lista de
 * profissionais"*. Cartão lado a lado não deixa comparar — cada um alinha o nome num
 * lugar diferente, e o olho tem de recomeçar a cada bloco. Linha sob cabeçalho alinha as
 * mesmas colunas em todas as linhas, e a comparação sai de graça. */

/** Zero confirmado e indisponível são estados DIFERENTES.
 *
 *  Confundir os dois faz a coordenadora agir sobre um dado que não existe: "0 pendências"
 *  encerra o assunto, "—" diz que ninguém sabe. VIS-014 exige a distinção. */
export function valor(dado: number | string | null | undefined): string {
  if (dado === null || dado === undefined) return '—';
  if (typeof dado === 'number') return dado.toLocaleString('pt-BR');
  return dado.trim() === '' ? '—' : dado;
}

/** Barreira por linha: um registro que não pode ser apresentado degrada SOZINHO.
 *
 *  Sem isto, um campo inesperado numa linha derruba a listagem inteira e a pessoa perde o
 *  acesso a todos os outros registros — que foi exatamente o que aconteceu em 24/11/2026,
 *  quando uma única linha com conteúdo cifrado inválido apagou a lista de equipe. */
class BarreiraDaLinha extends Component<
  { children: ReactNode; aoFalhar?: (erro: unknown) => void },
  { falhou: boolean }
> {
  override state = { falhou: false };

  static getDerivedStateFromError() {
    return { falhou: true };
  }

  override componentDidCatch(erro: unknown) {
    this.props.aoFalhar?.(erro);
  }

  override render() {
    if (!this.state.falhou) return this.props.children;
    return (
      <p className="m-0 px-4 py-3 text-(length:--texto-1) text-texto-suave">
        Este registro não pôde ser apresentado. Os demais continuam disponíveis.
      </p>
    );
  }
}

export type Coluna<T> = {
  /** Cabeçalho da coluna. */
  titulo: ReactNode;
  /** O que a coluna mostra para um registro. Use `valor()` para número e texto opcional. */
  celula: (item: T) => ReactNode;
  /** Colunas secundárias somem no celular, onde a linha empilha. */
  secundaria?: boolean;
};

export function Lista<T>({
  itens,
  colunas,
  chave,
  aoAbrir,
  rotulo,
  rotuloDaLinha,
  carregando = false,
  aoFalharLinha,
  moldura = true,
}: {
  itens: readonly T[];
  colunas: ReadonlyArray<Coluna<T>>;
  chave: (item: T) => string;
  /** Torna a linha acionável. Sem isto a lista é de leitura. */
  aoAbrir?: (item: T) => void;
  /** Nome da lista para quem ouve. */
  rotulo: string;
  /** Nome acionável da linha, por extenso: "Abrir ficha de Fulano". */
  rotuloDaLinha?: (item: T) => string;
  carregando?: boolean;
  aoFalharLinha?: (erro: unknown) => void;
  /** Moldura própria. Passe `false` quando a lista já estiver DENTRO de uma `Superficie`:
   *  duas bordas para o mesmo assunto é a "caixa dentro de caixa" que o `DESIGN.md`
   *  proíbe, e foi a queixa literal do solicitante em 24/11/2026. */
  moldura?: boolean;
}) {
  return (
    <div
      className={juntar(
        'overflow-hidden',
        moldura ? 'rounded-cartao border border-borda bg-superficie' : '',
      )}
    >
      {/* O cabeçalho é guia VISUAL de alinhamento, por isso sai da árvore de
          acessibilidade: quem ouve recebe o nome inteiro da linha por `aria-label`, e
          repetir os títulos a cada registro só alongaria a leitura. */}
      <div
        aria-hidden="true"
        hidden={itens.length === 0}
        className="flex items-center gap-4 border-b border-borda bg-superficie-2 px-4 py-2 text-(length:--texto-1) font-semibold text-texto-suave"
      >
        {colunas.map((coluna, indice) => (
          <span
            // A posição é a identidade da coluna: a ordem é fixa pelo chamador e não há
            // outra chave estável.
            key={`coluna-${String(indice)}`}
            className={juntar(
              'min-w-0 flex-1',
              coluna.secundaria === true ? 'hidden sm:block' : '',
            )}
          >
            {coluna.titulo}
          </span>
        ))}
      </div>
      <ul aria-label={rotulo} aria-busy={carregando || undefined} className="m-0 list-none p-0">
        {itens.map((item) => (
          <li key={chave(item)} className="min-w-0 border-t border-borda first:border-t-0">
            <BarreiraDaLinha aoFalhar={aoFalharLinha}>
              <Linha
                item={item}
                colunas={colunas}
                aoAbrir={aoAbrir}
                rotuloDaLinha={rotuloDaLinha}
              />
            </BarreiraDaLinha>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Linha<T>({
  item,
  colunas,
  aoAbrir,
  rotuloDaLinha,
}: {
  item: T;
  colunas: ReadonlyArray<Coluna<T>>;
  aoAbrir?: (item: T) => void;
  rotuloDaLinha?: (item: T) => string;
}) {
  const celulas = colunas.map((coluna, indice) => (
    <span
      key={`celula-${String(indice)}`}
      className={juntar(
        'min-w-0 flex-1 truncate',
        indice === 0 ? 'font-semibold' : 'text-texto-suave',
        coluna.secundaria === true ? 'hidden sm:block' : '',
      )}
    >
      {coluna.celula(item)}
    </span>
  ));

  const classe = juntar(
    'flex w-full items-center gap-4 px-4 py-2',
    'min-h-[56px] max-sm:min-h-[64px] max-sm:items-start max-sm:py-3',
    'text-left font-sans text-(length:--texto-2) leading-[1.4] text-texto',
  );

  if (aoAbrir === undefined) return <div className={classe}>{celulas}</div>;
  return (
    <button
      type="button"
      aria-label={rotuloDaLinha?.(item)}
      onClick={() => aoAbrir(item)}
      // `-3px` porque o contorno global fica para fora e seria cortado pelo `overflow`
      // da moldura da lista (`ui.css:` bloco `.ui-linha:focus-visible`).
      className={juntar(
        classe,
        'cursor-pointer border-0 bg-transparent hover:bg-superficie-2 focus-visible:[outline-offset:-3px]',
      )}
    >
      {celulas}
    </button>
  );
}
