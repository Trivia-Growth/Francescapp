import type { ComponentPropsWithRef, ReactNode } from 'react';
import { juntar } from './juntar.js';

/** Marca de estado: a pílula curta que diz em que ponto um caso, uma aba ou um registro
 *  está. Unifica `.pessoa-situacao` (`web/styles.css:932-948`) e `.ficha-aba-estado`
 *  (`web/styles.css:1078-1085`), que eram a mesma peça escrita duas vezes.
 *
 *  Três tons, com o nome que a tela usa:
 *  - `padrao`  — situação afirmada: fundo `--superficie-3`, texto `--ink`, peso 600;
 *  - `contorno`— situação pendente ("completar"): fundo branco e contorno **contínuo**;
 *                a borda tracejada saiu por parecer defeito de renderização
 *                (`web/styles.css:942-943`);
 *  - `suave`   — contagem ou nota ao lado de um rótulo: fundo `--superficie-2`, texto
 *                `--muted`.
 *
 *  Não há tom de perigo nem de sucesso: `--sucesso*` e `--perigo*` ainda não existem na
 *  folha (`componentes.md:720-727`) e inventar o valor aqui é exatamente o que a regra
 *  de cor proíbe. O oliva nunca entra: ele é área e filete, nunca cor de palavra. */

export type TomMarcaEstado = 'padrao' | 'contorno' | 'suave';

/* `ComponentPropsWithRef` e não `HTMLAttributes`: o segundo não inclui `ref`. Mesma
   armadilha de `campo.tsx` e `botao.tsx` — sem referência a tela não move o foco nem
   limpa o controle por código, e acaba presa ao marcador cru do kit antigo. No React 19
   `ref` é propriedade comum e segue no espalhamento, sem `forwardRef`. */
export type PropsMarcaEstado = ComponentPropsWithRef<'span'> & {
  tom?: TomMarcaEstado;
  children: ReactNode;
};

/* `rounded-[20px]` e o par 2px/10px vêm da folha atual: medida herdada, não número novo.
   Nenhum raio da escala (`--radius-*`, 7 a 14px) corresponde à pílula. */
const base = 'inline-flex items-center rounded-[20px] py-[2px] text-(length:--texto-1)';

const porTom: Record<TomMarcaEstado, string> = {
  padrao: 'px-[10px] bg-superficie-3 text-texto font-semibold',
  contorno: 'px-[10px] border border-borda bg-superficie text-texto-suave font-semibold',
  suave: 'px-2 bg-superficie-2 text-texto-suave',
};

export function MarcaEstado({ tom = 'padrao', className, children, ...resto }: PropsMarcaEstado) {
  return (
    <span data-tom={tom} className={juntar(base, porTom[tom], className)} {...resto}>
      {children}
    </span>
  );
}
