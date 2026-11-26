/** Abas da aplicação sobre Radix Tabs.
 *
 *  A linguagem única de aba já estava decidida e valia para ficha, administração e
 *  financeiro (`web/styles.css:1017-1085`); o que não existia era componente. Este arquivo
 *  é o componente, com a aparência inalterada.
 *
 *  Duas decisões que não podem ser "melhoradas" (`componentes.md` §15, riscos 4 e 22):
 *
 *  - A SELEÇÃO NUNCA DEPENDE SÓ DE COR: traço de 3px no oliva da marca MAIS peso 700. A
 *    pílula preenchida foi abandonada por deixar o rótulo da aba ativa ilegível. E o oliva
 *    aparece como TRAÇO, nunca como cor de texto — 3,35:1 sobre branco não se lê.
 *  - O SINAL DE CONTINUIDADE DA FAIXA É PINTURA: os mesmos quatro gradientes
 *    `local`/`scroll` do corpo do diálogo, deitados. Sem JavaScript e sem animação, logo
 *    imune a `prefers-reduced-motion`. Trocar por sombra animada é regressão.
 *
 *  `aria-selected` continua sendo o gancho de estilo, e não `data-state`, porque as provas
 *  de tela já procuram por ele.
 */
import * as Radix from '@radix-ui/react-tabs';
import type { ComponentPropsWithRef } from 'react';
import { juntar } from './juntar';

export const Abas = Radix.Root;

/** Os quatro gradientes de `web/styles.css:1023-1031`, na horizontal. O literal
 *  `rgb(31 31 29 / 0.12)` vira `color-mix` sobre `--ink`: mesma intenção, token no lugar
 *  do valor. */
export const SINAL_ROLAGEM_HORIZONTAL =
  '[background:linear-gradient(to_right,var(--wash)_40%,transparent)_left/32px_100%_no-repeat_local,linear-gradient(to_left,var(--wash)_40%,transparent)_right/32px_100%_no-repeat_local,linear-gradient(to_right,color-mix(in_srgb,var(--ink)_12%,transparent),transparent)_left/18px_100%_no-repeat_scroll,linear-gradient(to_left,color-mix(in_srgb,var(--ink)_12%,transparent),transparent)_right/18px_100%_no-repeat_scroll]';

export const CLASSES_FAIXA = juntar(
  'flex gap-1 overflow-x-auto border-b border-borda [scrollbar-width:thin]',
  SINAL_ROLAGEM_HORIZONTAL,
);

export const CLASSES_ABA = juntar(
  'inline-flex flex-none items-center whitespace-nowrap',
  // Alvo de toque: 48px de altura, 44px de largura mínima.
  'min-h-[48px] min-w-[44px] px-4 py-3',
  'cursor-pointer rounded-none border-0 border-b-[3px] border-transparent bg-transparent',
  'font-sans text-2 font-semibold text-left text-texto-suave',
  'transition-[color,border-color,background-color] duration-[var(--mov-estado)] ease-entrada',
  'hover:bg-superficie-2 hover:text-texto',
  // Traço + peso. Nunca só cor.
  'aria-selected:border-b-marca aria-selected:text-primaria aria-selected:font-bold',
  'aria-[current=true]:border-b-marca aria-[current=true]:text-primaria aria-[current=true]:font-bold',
  'aria-[current=page]:border-b-marca aria-[current=page]:text-primaria aria-[current=page]:font-bold',
);

export function FaixaAbas({ className, ...resto }: ComponentPropsWithRef<typeof Radix.List>) {
  return <Radix.List {...resto} className={juntar(CLASSES_FAIXA, className)} data-faixa="abas" />;
}

export type PedidoAba = ComponentPropsWithRef<typeof Radix.Trigger> & {
  /** Contador ou estado curto à direita do rótulo. Fundo `--soft`, nunca cor de alarme. */
  estado?: string;
};

export function Aba({ className, children, estado, ...resto }: PedidoAba) {
  return (
    <Radix.Trigger {...resto} className={juntar(CLASSES_ABA, className)}>
      {children}
      {estado ? (
        <span className="ml-2 rounded-[20px] bg-superficie-2 px-2 py-[2px] text-1 text-texto-suave">
          {estado}
        </span>
      ) : null}
    </Radix.Trigger>
  );
}

export function PainelAba({ className, ...resto }: ComponentPropsWithRef<typeof Radix.Content>) {
  return <Radix.Content {...resto} className={juntar('min-w-0 pt-5', className)} />;
}
