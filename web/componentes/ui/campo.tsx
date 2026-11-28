import { cva } from 'class-variance-authority';
import type { ComponentPropsWithRef, ReactNode } from 'react';
import { juntar } from './juntar.js';

/** Campo de texto: rótulo acima, controle, dica e erro na mesma coluna
 *  (`web/estilos/ui.css:117-173`, `web/ui/basicos.ts:60-115`).
 *
 *  Três garantias que não podem se perder na migração:
 *  1. `aria-describedby` aponta dica **e** erro, sempre, na mesma ordem
 *     (`basicos.ts:89-104`);
 *  2. o nó de erro está sempre montado e some por `:empty`, para o texto aparecer sem
 *     empurrar a linha seguinte (`ui.css:166-173`);
 *  3. `aria-invalid` é acoplado ao texto do erro — nunca borda vermelha sem frase
 *     (`basicos.ts:109-113`).
 *
 *  O tamanho de fonte do controle é `--texto-2` (16px) por obrigação: menos que isso faz
 *  o iOS dar zoom ao focar (`web/styles.css:476`). */

/** Medidas do controle, compartilhadas por campo, área de texto e seleção simples. */
export const classeControle = juntar(
  'block w-full min-h-controle-md px-3 py-[10px]',
  'rounded-campo border border-borda-forte',
  'bg-superficie text-texto caret-primaria',
  'font-sans text-(length:--texto-2) font-normal leading-[1.4]',
  'disabled:bg-superficie-3 disabled:text-texto-suave',
  'aria-invalid:border-erro',
);

const estiloCampo = cva(
  [
    'block w-full min-h-alvo-toque rounded-pilula border px-sistema-4 py-2.5',
    'bg-sistema-superficie text-sistema-texto caret-sistema-acao',
    'font-sans text-corpo placeholder:text-sistema-texto-secundario',
    'disabled:bg-sistema-fundo-desabilitado disabled:text-sistema-desabilitado',
    'focus-visible:outline-sistema-foco focus-visible:[outline-width:var(--espessura-foco)] focus-visible:[outline-offset:var(--recuo-foco)]',
    'aria-invalid:border-sistema-erro',
  ],
  {
    variants: {
      invalido: { true: 'border-sistema-erro', false: 'border-sistema-contorno' },
    },
  },
);

/** Estilo do controle para campos que pertencem ao HTML da página. */
export function classesCampo(invalido = false, className?: string): string {
  return juntar(estiloCampo({ invalido }), className);
}

export type PropsEnvelope = {
  /** Id do controle: liga `label`, dica e erro. Obrigatório, como em `basicos.ts:35`. */
  id: string;
  rotulo: string;
  idRotulo?: string;
  idControle?: string;
  /** Texto curto à direita do rótulo: "obrigatório", "opcional", a unidade. */
  marcaRotulo?: string;
  /** A linha que explica o campo, abaixo dele. */
  dica?: string;
  /** Frase do erro. Vazia significa sem erro: o nó continua montado. */
  erro?: string;
  className?: string;
  children: ReactNode;
};

/** Invólucro do campo. `min-width: 0` é o que impede o controle de estourar a grade do
 *  diálogo no celular (`ui.css:122`). */
export function EnvelopeCampo({
  id,
  rotulo,
  idRotulo,
  idControle = id,
  marcaRotulo,
  dica,
  erro,
  className,
  children,
}: PropsEnvelope) {
  return (
    <div className={juntar('grid min-w-0 gap-sistema-1 mb-4', className)}>
      <label
        id={idRotulo}
        htmlFor={idControle}
        className="flex flex-wrap items-baseline justify-between gap-x-sistema-3 gap-y-sistema-1 m-0 mb-sistema-1 text-controle"
      >
        <span>{rotulo}</span>
        {marcaRotulo ? (
          <span className="text-sistema-texto-secundario text-meta">{marcaRotulo}</span>
        ) : null}
      </label>
      {children}
      {dica ? (
        <p id={`${id}-dica`} className="m-0 max-w-texto text-sistema-texto-secundario text-meta">
          {dica}
        </p>
      ) : null}
      <p id={`${id}-erro`} className="m-0 text-sistema-erro text-meta empty:hidden">
        {erro}
      </p>
    </div>
  );
}

/** Ids que descrevem o controle: dica e erro, nessa ordem, e o erro sempre presente. */
export function descritores(id: string, dica?: string): string {
  return dica ? `${id}-dica ${id}-erro` : `${id}-erro`;
}

/* `ComponentPropsWithRef` e não `InputHTMLAttributes`: o segundo não inclui `ref`, e por
   isso o campo não podia ser referenciado. Telas que precisam mover o foco ou limpar o
   controle — a de acesso, por exemplo — ficavam presas ao `<input>` cru do kit antigo.
   No React 19 `ref` é propriedade comum e segue no espalhamento, sem `forwardRef`. */
export type PropsCampo = Omit<ComponentPropsWithRef<'input'>, 'id' | 'type'> & {
  id: string;
  rotulo: string;
  tipo?: string;
  marcaRotulo?: string;
  dica?: string;
  erro?: string;
  /** Classe do invólucro; o `className` continua indo para o controle. */
  classeEnvelope?: string;
};

export function Campo({
  id,
  rotulo,
  tipo = 'text',
  marcaRotulo,
  dica,
  erro,
  classeEnvelope,
  className,
  ...resto
}: PropsCampo) {
  return (
    <EnvelopeCampo
      id={id}
      rotulo={rotulo}
      marcaRotulo={marcaRotulo}
      dica={dica}
      erro={erro}
      className={classeEnvelope}
    >
      <input
        id={id}
        type={tipo}
        aria-describedby={descritores(id, dica)}
        aria-invalid={erro ? true : undefined}
        className={classesCampo(Boolean(erro), className)}
        {...resto}
      />
    </EnvelopeCampo>
  );
}
