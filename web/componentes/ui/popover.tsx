/** Popover da aplicação sobre Radix Popover.
 *
 *  É a superfície flutuante que a lista de seleção (`ui.css:237-253`) e o calendário
 *  (`ui.css:342`) já usavam: um dos dois únicos lugares do produto com sombra, porque
 *  sombra é reservada ao que flutua de verdade (`ui.css:11-12`).
 *
 *  O risco que este arquivo existe para não reintroduzir é o 11 de `componentes.md`:
 *  **o `Esc` de um popover não pode fechar o diálogo em volta.** Na camada anterior isso é
 *  um `stopPropagation` escrito à mão (`selecao.ts:225`, `data.ts:274`), travado por
 *  `selecao.test.ts:73`. Aqui a garantia muda de natureza: o Radix empilha camadas de
 *  dispensa e só a mais alta responde ao `Esc`. Mudou o mecanismo, não a garantia — e por
 *  isso há teste de popover DENTRO de diálogo, não só de popover sozinho.
 *
 *  Nota de CSP, conferida em 25/11/2026: o Radix posiciona o conteúdo por `style` aplicado
 *  via React, ou seja, pelo CSSOM. `style-src 'self'` não bloqueia CSSOM — bloqueia atributo
 *  `style` vindo do HTML. Nenhum `setAttribute('style', …)` foi encontrado em
 *  `@floating-ui/dom` nem em `@radix-ui/react-popover`.
 */
import * as Radix from '@radix-ui/react-popover';
import type { ComponentPropsWithRef } from 'react';
import { juntar } from './juntar';

export const Popover = Radix.Root;
export const GatilhoPopover = Radix.Trigger;
export const AncoraPopover = Radix.Anchor;

/** Medidas de `ui.css:237-266`: teto de 17rem, rolagem contida, filete, raio de controle e
 *  a sombra de menu — token, não o literal que `ui.css:252` ainda escreve. */
export const CLASSES_PAINEL_FLUTUANTE = juntar(
  'z-30 max-h-[17rem] min-w-[var(--radix-popover-trigger-width)] overflow-y-auto',
  'overscroll-contain rounded-controle border border-borda bg-superficie p-1',
  'text-2 text-texto shadow-menu',
);

export type PedidoConteudoPopover = ComponentPropsWithRef<typeof Radix.Content> & {
  /** Sem portal, o popover herda `overflow: hidden` do corpo do diálogo e some. */
  comPortal?: boolean;
};

export function ConteudoPopover({
  className,
  comPortal = true,
  sideOffset = 4,
  align = 'start',
  children,
  ...resto
}: PedidoConteudoPopover) {
  const conteudo = (
    <Radix.Content
      {...resto}
      align={align}
      sideOffset={sideOffset}
      className={juntar(CLASSES_PAINEL_FLUTUANTE, className)}
      data-painel="popover"
    >
      {children}
    </Radix.Content>
  );
  return comPortal ? <Radix.Portal>{conteudo}</Radix.Portal> : conteudo;
}
