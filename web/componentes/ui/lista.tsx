import { type ReactNode, useId } from 'react';
import { BarreiraDaLinha, mensagemFalhaLinha } from './barreira-da-linha.js';
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

export type Coluna<T> = {
  /** Cabeçalho da coluna. */
  titulo: ReactNode;
  /** O que a coluna mostra para um registro. Use `valor()` para número e texto opcional. */
  celula: (item: T) => ReactNode;
  /** Colunas secundárias somem no celular, onde a linha empilha. */
  secundaria?: boolean;
  /** Esta coluna não pode cortar o conteúdo com reticências: quando o espaço aperta, o
   *  texto quebra em mais linhas em vez de virar `…`. Existe para o rótulo de uma ação
   *  (um botão de ~220px não pode ser lido como outro rótulo) e para o identificador de
   *  quem uma ação afeta — numa decisão de revogação de acesso, por exemplo, não dá para
   *  decidir sem ler o e-mail inteiro. Não use para colunas onde a reticência já basta. */
  semTruncamento?: boolean;
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
  /** Descrição opcional da ação. O nome acessível vem do texto visível da linha. */
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
      <div
        aria-hidden="true"
        hidden={itens.length === 0}
        className={juntar(
          'flex items-center gap-4 border-b border-borda bg-superficie-2 px-4 py-2 text-(length:--texto-1) font-semibold text-texto-suave',
          aoAbrir === undefined ? '' : 'max-sm:hidden',
        )}
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
            <BarreiraDaLinha
              aoFalhar={aoFalharLinha}
              fallback={
                <p className="m-0 px-4 py-3 text-(length:--texto-1) text-texto-suave">
                  {mensagemFalhaLinha}
                </p>
              }
            >
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
  const idDescricao = useId();
  const celulas = colunas.map((coluna, indice) => (
    <span
      key={`celula-${String(indice)}`}
      className={juntar(
        'min-w-0 flex-1',
        // `truncate` corta com reticência; `semTruncamento` quebra em vez de cortar. As
        // outras colunas continuam cortando — é o que impede a linha de quebrar (VIS-016).
        coluna.semTruncamento === true ? 'whitespace-normal break-words' : 'truncate',
        aoAbrir === undefined ? '' : 'max-sm:w-full max-sm:whitespace-normal max-sm:wrap-anywhere',
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
    aoAbrir === undefined ? '' : 'max-sm:flex-col max-sm:gap-2',
    'text-left font-sans text-(length:--texto-2) leading-[1.4] text-texto',
  );

  if (aoAbrir === undefined) return <div className={classe}>{celulas}</div>;
  const descricao = rotuloDaLinha?.(item);
  return (
    <>
      <button
        type="button"
        aria-describedby={descricao ? idDescricao : undefined}
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
      {descricao ? (
        <span id={idDescricao} hidden>
          {descricao}
        </span>
      ) : null}
    </>
  );
}
