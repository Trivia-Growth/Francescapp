import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/* Os tamanhos personalizados de tema.css precisam entrar no grupo de fontes.
 * Sem isso, o tailwind-merge os trata como cores e pode descartá-los.
 * Em 25/11/2026, juntar('text-2', 'text-contraste') devolvia só 'text-contraste':
 * o campo perdia o tamanho de 16px e o iOS voltava a dar zoom ao receber foco. */
const mesclar = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        '1',
        '2',
        '3',
        '4',
        '5',
        '6',
        'pagina-barra',
        'pagina',
        'pagina-desktop',
        'secao',
        'item',
        'corpo',
        'controle',
        'meta',
      ],
    },
  },
});

/** Junta classes condicionais resolvendo conflito entre utilitárias: a última vence.
 *  Sem isto, `juntar('p-4', props.className)` com `p-6` vindo de fora deixa as duas na
 *  folha e o resultado passa a depender da ordem do arquivo, não da intenção. */
export function juntar(...classes: ClassValue[]): string {
  return mesclar(clsx(classes));
}
