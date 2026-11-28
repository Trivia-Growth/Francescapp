import { cva } from 'class-variance-authority';
import type { ComponentPropsWithRef, MouseEvent, ReactNode } from 'react';
import { juntar } from './juntar.js';

export type PesoBotao = 'principal' | 'secundario' | 'discreto' | 'perigo';

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
  /** Mantém o foco e a largura enquanto a gravação está pendente. */
  salvando?: boolean;
  /** Vira `data-acao`, o gancho que os testes de tela já usam. */
  marca?: string;
  /** Vira `aria-label` quando o rótulo visível não basta para quem ouve. */
  rotuloLeitura?: string;
  /** Nome de domínio para o clique; equivale a `onClick`. */
  aoAtivar?: (evento: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
};

const estiloBotao = cva(
  [
    'inline-flex min-h-alvo-toque items-center justify-center gap-sistema-2',
    'rounded-pilula border border-transparent px-sistema-4 py-2.5',
    'font-sans text-controle text-center no-underline',
    'cursor-pointer transition-colors ease-out [transition-duration:var(--movimento-controle)]',
    'focus-visible:outline-sistema-foco focus-visible:[outline-width:var(--espessura-foco)] focus-visible:[outline-offset:var(--recuo-foco)]',
    'disabled:cursor-not-allowed disabled:opacity-100 disabled:bg-sistema-fundo-desabilitado disabled:text-sistema-desabilitado',
    'aria-disabled:cursor-not-allowed aria-disabled:opacity-100 aria-disabled:bg-sistema-fundo-desabilitado aria-disabled:text-sistema-desabilitado',
  ],
  {
    variants: {
      peso: {
        principal: [
          'bg-sistema-acao text-sistema-superficie',
          '[&:hover:not(:active):not(:disabled):not([aria-disabled=true])]:bg-sistema-acao-hover',
          '[&:active:not(:disabled):not([aria-disabled=true])]:bg-sistema-acao-pressionada',
        ],
        secundario: [
          'border-sistema-contorno bg-sistema-superficie text-sistema-acao',
          '[&:hover:not(:active):not(:disabled):not([aria-disabled=true])]:bg-sistema-hoje',
          '[&:active:not(:disabled):not([aria-disabled=true])]:bg-sistema-fundo-desabilitado',
        ],
        discreto: [
          'bg-transparent text-sistema-acao underline underline-offset-[0.2em]',
          '[&:hover:not(:active):not(:disabled):not([aria-disabled=true])]:bg-sistema-hoje',
          '[&:active:not(:disabled):not([aria-disabled=true])]:bg-sistema-fundo-desabilitado',
        ],
        perigo: [
          'bg-sistema-erro text-sistema-superficie',
          '[&:hover:not(:active):not(:disabled):not([aria-disabled=true])]:bg-sistema-perigo-hover',
          '[&:active:not(:disabled):not([aria-disabled=true])]:bg-sistema-perigo-pressionada',
        ],
      } satisfies Record<PesoBotao, string[]>,
      largo: { true: 'w-full' },
    },
    defaultVariants: { peso: 'secundario' },
  },
);

/** Aparência do botão para os controles e links que pertencem ao HTML da página. */
export function classesBotao({
  peso,
  largo,
  className,
}: {
  peso?: PesoBotao;
  largo?: boolean;
  className?: string;
}): string {
  return juntar(estiloBotao({ peso, largo }), className);
}

export function Botao({
  peso = 'secundario',
  tipo = 'button',
  largo,
  salvando,
  marca,
  rotuloLeitura,
  aoAtivar,
  onClick,
  className,
  children,
  'aria-disabled': ariaDisabled,
  'aria-label': ariaLabel,
  ...resto
}: PropsBotao) {
  const acionar = aoAtivar ?? onClick;
  return (
    <button
      type={tipo}
      data-peso={peso}
      data-acao={marca}
      aria-label={salvando ? 'Salvando…' : (ariaLabel ?? rotuloLeitura)}
      aria-disabled={salvando || ariaDisabled}
      className={classesBotao({ peso, largo, className })}
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
      {salvando === undefined ? (
        children
      ) : (
        // As duas legendas medem a mesma célula desde o repouso. Trocar de legenda
        // conserva a largura e o próprio nó focado.
        <span className="inline-grid items-center">
          <span
            aria-hidden={salvando}
            className={juntar(
              'col-start-1 row-start-1 inline-flex items-center justify-center gap-sistema-2',
              salvando && 'invisible',
            )}
          >
            {children}
          </span>
          <span
            aria-hidden={!salvando}
            className={juntar('col-start-1 row-start-1', !salvando && 'invisible')}
          >
            Salvando…
          </span>
        </span>
      )}
    </button>
  );
}
