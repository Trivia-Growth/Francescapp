import type { ReactNode } from 'react';
import { BarreiraDaLinha, mensagemFalhaLinha } from './barreira-da-linha.js';
import { juntar } from './juntar.js';

export type ColunaTabela<T> = {
  titulo: string;
  celula: (item: T) => ReactNode;
  largura?: string;
};

type PropsRegistros<T> = {
  itens: readonly T[];
  /** A ordem das colunas é a ordem de leitura. A identidade vem primeiro. */
  colunas: readonly ColunaTabela<T>[];
  chave: (item: T) => string;
  rotulo: string;
  className?: string;
};

const celulaTabela = 'px-sistema-4 py-sistema-3 text-left align-middle wrap-anywhere text-controle';

export function Tabela<T>({ itens, colunas, chave, rotulo, className }: PropsRegistros<T>) {
  return (
    <table className={juntar('w-full table-fixed border-collapse', className)}>
      <caption className="sr-only">{rotulo}</caption>
      <thead>
        <tr className="border-b border-borda">
          {colunas.map(({ titulo, largura }) => (
            <th
              key={titulo}
              scope="col"
              className={juntar(celulaTabela, 'py-2.5 font-normal text-texto-suave', largura)}
            >
              {titulo}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {itens.map((item) => (
          <BarreiraDaLinha
            key={chave(item)}
            fallback={
              <tr className="border-b border-borda last:border-b-0">
                <td colSpan={colunas.length} className={celulaTabela}>
                  {mensagemFalhaLinha}
                </td>
              </tr>
            }
          >
            <LinhaTabela item={item} colunas={colunas} />
          </BarreiraDaLinha>
        ))}
      </tbody>
    </table>
  );
}

function LinhaTabela<T>({ item, colunas }: { item: T; colunas: readonly ColunaTabela<T>[] }) {
  return (
    <tr className="h-14 border-b border-borda last:border-b-0">
      {colunas.map(({ titulo, celula }, indice) =>
        indice === 0 ? (
          <th key={titulo} scope="row" className={juntar(celulaTabela, 'font-semibold')}>
            {celula(item)}
          </th>
        ) : (
          <td key={titulo} className={celulaTabela}>
            {celula(item)}
          </td>
        ),
      )}
    </tr>
  );
}

export function ListaRotulada<T>({ itens, colunas, chave, rotulo, className }: PropsRegistros<T>) {
  return (
    <ul aria-label={rotulo} className={juntar('m-0 list-none p-0', className)}>
      {itens.map((item) => (
        <li
          key={chave(item)}
          className="min-w-0 border-b border-borda py-sistema-3 last:border-b-0"
        >
          <BarreiraDaLinha fallback={<p className="m-0 text-controle">{mensagemFalhaLinha}</p>}>
            <RegistroRotulado item={item} colunas={colunas} />
          </BarreiraDaLinha>
        </li>
      ))}
    </ul>
  );
}

function RegistroRotulado<T>({ item, colunas }: { item: T; colunas: readonly ColunaTabela<T>[] }) {
  return (
    <dl className="m-0 grid gap-sistema-2 wrap-anywhere text-controle">
      {colunas.map(({ titulo, celula }, indice) => (
        <div
          key={titulo}
          className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-baseline gap-sistema-2 first:block"
        >
          <dt className={indice === 0 ? 'sr-only' : 'text-texto-suave'}>{titulo}</dt>
          <dd className={juntar('m-0 min-w-0', indice === 0 ? 'text-lg font-semibold' : '')}>
            {celula(item)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
