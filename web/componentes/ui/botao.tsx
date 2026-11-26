import type { ComponentPropsWithRef, MouseEvent, ReactNode } from 'react';
import { juntar } from './juntar.js';

/** Botão da aplicação: três pesos e só três — a ação do assunto, a alternativa e o
 *  comando discreto (`web/ui/ui.css:59-61`).
 *
 *  Os nomes de variante são os do domínio e chegam ao DOM como `data-peso`, porque telas
 *  e testes já procuram por eles (`componentes.md:35-44`). A altura mínima vem de
 *  `--controle-md` (46px), o alvo de toque confortável, e não de um número escrito aqui.
 *
 *  Desabilitado é um par: `:disabled` **e** `[aria-disabled="true"]`. O segundo mantém o
 *  botão focável e anunciável, então ele não pode acender no hover nem ativar a ação —
 *  hoje cada tela repete essa guarda à mão (`web/main.ts:2914`). */

export type PesoBotao = 'principal' | 'secundario' | 'discreto';

/* `ComponentPropsWithRef` e não `ButtonHTMLAttributes`, pelo mesmo motivo do `Campo`: o
   segundo não inclui `ref`, e sem referência um botão não pode receber foco inicial por
   código. Era o que mantinha o rodapé do diálogo preso ao `<button>` cru do kit antigo.
   No React 19 `ref` é propriedade comum e segue no espalhamento, sem `forwardRef`. */
export type PropsBotao = Omit<ComponentPropsWithRef<'button'>, 'type'> & {
  /** Peso da ação na página. Padrão `secundario`, como em `basicos.ts:25`. */
  peso?: PesoBotao;
  /** `type` do botão. Padrão `button`: submeter é decisão explícita. */
  tipo?: 'button' | 'submit';
  /** Ocupa a largura inteira do contêiner. */
  largo?: boolean;
  /** Vira `data-acao`, o gancho que os testes de tela já usam. */
  marca?: string;
  /** Vira `aria-label` quando o rótulo visível não basta para quem ouve. */
  rotuloLeitura?: string;
  /** Nome de domínio para o clique; equivale a `onClick`. */
  aoAtivar?: (evento: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
};

/* `text-(length:--texto-N)` e não `text-N`: `juntar` usa a configuração padrão do
   tailwind-merge, que não conhece a escala tipográfica da Francescato e classifica
   `text-1`/`text-2` como COR. Escritos junto de `text-texto` ou `text-contraste`, eles
   eram descartados na junção e o controle perdia o tamanho de fonte — no campo isso
   significa o iOS dar zoom ao focar. A forma com tipo explícito cai no grupo certo.
   A correção definitiva é ensinar a escala ao `juntar`, fora do alcance desta frente. */
/* Nada de `outline-none` nem `ring-0`: o foco visível é global
   (`web/styles.css:157-160`) e substituí-lo aqui seria perdê-lo. */
const base = juntar(
  'inline-flex items-center justify-center gap-2',
  'min-h-controle-md px-[18px] py-[10px]',
  'rounded-controle border border-transparent',
  'font-sans text-(length:--texto-2) font-semibold leading-[1.4] text-center no-underline',
  'cursor-pointer transition-colors ease-entrada [transition-duration:var(--mov-estado)]',
  // Desabilitado pelos dois caminhos, com a mesma opacidade de `ui.css:103-107`.
  'disabled:cursor-not-allowed disabled:opacity-[0.62]',
  '[&[aria-disabled=true]]:cursor-not-allowed [&[aria-disabled=true]]:opacity-[0.62]',
  '[&:not(:disabled):not([aria-disabled=true]):active]:translate-y-px',
);

const porPeso: Record<PesoBotao, string> = {
  principal: juntar(
    'bg-primaria text-contraste',
    '[&:hover:not(:disabled):not([aria-disabled=true])]:bg-primaria-hover',
  ),
  secundario: juntar(
    'border-borda-forte bg-superficie text-primaria',
    '[&:hover:not(:disabled):not([aria-disabled=true])]:bg-superficie-3',
  ),
  discreto: juntar(
    'px-2 bg-transparent text-primaria underline underline-offset-[0.2em]',
    '[&:hover:not(:disabled):not([aria-disabled=true])]:bg-superficie-3',
    '[&:hover:not(:disabled):not([aria-disabled=true])]:no-underline',
  ),
};

export function Botao({
  peso = 'secundario',
  tipo = 'button',
  largo,
  marca,
  rotuloLeitura,
  aoAtivar,
  onClick,
  className,
  children,
  ...resto
}: PropsBotao) {
  const acionar = aoAtivar ?? onClick;
  return (
    <button
      type={tipo}
      data-peso={peso}
      data-acao={marca}
      aria-label={rotuloLeitura}
      className={juntar(base, porPeso[peso], largo && 'w-full', className)}
      onClick={(evento) => {
        // Focável e anunciável, mas inerte: sem isto a ação dispara mesmo desabilitada.
        if (evento.currentTarget.getAttribute('aria-disabled') === 'true') {
          evento.preventDefault();
          return;
        }
        acionar?.(evento);
      }}
      {...resto}
    >
      {children}
    </button>
  );
}
