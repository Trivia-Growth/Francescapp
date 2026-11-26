import type { InputHTMLAttributes } from 'react';
import { juntar } from '../componentes/ui/juntar.js';

/** Caixa de marcação: controle à esquerda, rótulo clicável à direita, e a ajuda ligada
 *  por `aria-describedby`.
 *
 *  Não passa por `Campo`: lá o rótulo fica acima e o controle ocupa a linha inteira, o
 *  que é certo para texto e errado para uma marcação — a caixa ficaria sozinha numa
 *  faixa de 46px e o rótulo longe do alvo. O alvo de toque vem do `min-height` da linha
 *  inteira, não do quadradinho. */
export function CaixaDeMarcacao({
  id,
  rotulo,
  ajuda,
  className,
  ...resto
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> & {
  id: string;
  rotulo: string;
  ajuda?: string;
}) {
  return (
    <div className="grid gap-1">
      <div className="flex min-h-controle-md items-center gap-2">
        <input
          id={id}
          type="checkbox"
          aria-describedby={ajuda === undefined ? undefined : `${id}-ajuda`}
          className={juntar('h-5 w-5 flex-none accent-primaria', className)}
          {...resto}
        />
        <label htmlFor={id} className="m-0 cursor-pointer text-(length:--texto-2) leading-[1.4]">
          {rotulo}
        </label>
      </div>
      {ajuda === undefined ? null : (
        <p id={`${id}-ajuda`} className="m-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave">
          {ajuda}
        </p>
      )}
    </div>
  );
}
