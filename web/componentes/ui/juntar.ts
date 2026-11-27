import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/* O `tailwind-merge` precisa saber quais grupos nossas classes ocupam para resolver
 * conflito. Sem este ajuste ele classifica `text-1` … `text-6` como COR, porque a
 * configuração padrão só reconhece os nomes de tamanho dele (`text-sm`, `text-lg`).
 * Consequência medida em 25/11/2026 pela frente de controles: `juntar('text-2',
 * 'text-contraste')` devolvia só `text-contraste`, o campo perdia os 16px e o iOS voltava
 * a dar zoom ao focar. Um bug silencioso de acessibilidade escondido numa biblioteca de
 * conveniência.
 *
 * A escala de texto da Francescato tem seis degraus e só seis, declarados em
 * `web/styles.css` e conferidos por `web/contrato-visual.test.ts`. */
const mesclar = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['1', '2', '3', '4', '5', '6'] }],
    },
  },
});

/** Junta classes condicionais resolvendo conflito entre utilitárias: a última vence.
 *  Sem isto, `juntar('p-4', props.className)` com `p-6` vindo de fora deixa as duas na
 *  folha e o resultado passa a depender da ordem do arquivo, não da intenção. */
export function juntar(...classes: ClassValue[]): string {
  return mesclar(clsx(classes));
}
