import type { ComponentPropsWithRef, ReactNode } from 'react';
import { juntar } from './juntar.js';

/** Campo de texto: rótulo acima, controle, dica e erro na mesma coluna
 *  (`web/ui/ui.css:117-173`, `web/ui/basicos.ts:60-115`).
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

/* `text-(length:--texto-N)` e não `text-N`: `juntar` usa a configuração padrão do
   tailwind-merge, que não conhece a escala tipográfica da Francescato e classifica
   `text-1`/`text-2` como COR. Escritos junto de `text-texto` ou `text-contraste`, eles
   eram descartados na junção e o controle perdia o tamanho de fonte — no campo isso
   significa o iOS dar zoom ao focar. A forma com tipo explícito cai no grupo certo.
   A correção definitiva é ensinar a escala ao `juntar`, fora do alcance desta frente. */
/** Medidas do controle, compartilhadas por campo, área de texto e seleção simples. */
export const classeControle = juntar(
  'block w-full min-h-controle-md px-3 py-[10px]',
  'rounded-campo border border-borda-forte',
  'bg-superficie text-texto caret-primaria',
  'font-sans text-(length:--texto-2) font-normal leading-[1.4]',
  'disabled:bg-superficie-3 disabled:text-texto-suave',
  'aria-invalid:border-erro',
);

export type PropsEnvelope = {
  /** Id do controle: liga `label`, dica e erro. Obrigatório, como em `basicos.ts:35`. */
  id: string;
  rotulo: string;
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
  marcaRotulo,
  dica,
  erro,
  className,
  children,
}: PropsEnvelope) {
  return (
    <div className={juntar('grid min-w-0 gap-2 mb-4', className)}>
      <label
        htmlFor={id}
        className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 m-0 text-(length:--texto-2) font-semibold leading-[1.4]"
      >
        <span>{rotulo}</span>
        {marcaRotulo ? (
          <span className="text-texto-suave text-(length:--texto-1) font-normal">
            {marcaRotulo}
          </span>
        ) : null}
      </label>
      {children}
      {dica ? (
        <p id={`${id}-dica`} className="m-0 max-w-[68ch] text-texto-suave text-(length:--texto-1)">
          {dica}
        </p>
      ) : null}
      <p id={`${id}-erro`} className="m-0 text-erro text-(length:--texto-1) empty:hidden">
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
        className={juntar(classeControle, className)}
        {...resto}
      />
    </EnvelopeCampo>
  );
}
