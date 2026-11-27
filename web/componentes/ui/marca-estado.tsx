import { cva } from 'class-variance-authority';
import type { ComponentPropsWithRef, ReactNode } from 'react';
import { juntar } from './juntar.js';

export type TomMarcaEstado = 'padrao' | 'contorno' | 'suave';

/* `ComponentPropsWithRef` e não `HTMLAttributes`: o segundo não inclui `ref`. Mesma
   armadilha de `campo.tsx` e `botao.tsx` — sem referência a tela não move o foco nem
   limpa o controle por código, e acaba presa ao marcador cru do kit antigo. No React 19
   `ref` é propriedade comum e segue no espalhamento, sem `forwardRef`. */
export type PropsMarcaEstado = ComponentPropsWithRef<'span'> & {
  tom?: TomMarcaEstado;
  children: ReactNode;
};

const estiloMarcaEstado = cva(
  'inline-flex max-w-full items-center rounded-pilula px-sistema-2 py-0.5',
  {
    variants: {
      tom: {
        padrao: 'bg-sistema-hoje text-sistema-acao text-controle',
        contorno:
          'border border-sistema-contorno bg-sistema-superficie text-sistema-texto-secundario text-controle',
        suave: 'bg-sistema-fundo-desabilitado text-sistema-desabilitado text-meta font-semibold',
      } satisfies Record<TomMarcaEstado, string>,
    },
  },
);

export function MarcaEstado({ tom = 'padrao', className, children, ...resto }: PropsMarcaEstado) {
  return (
    <span data-tom={tom} className={juntar(estiloMarcaEstado({ tom }), className)} {...resto}>
      {children}
    </span>
  );
}
