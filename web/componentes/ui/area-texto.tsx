import type { ComponentPropsWithRef } from 'react';
import { EnvelopeCampo, classeControle, descritores } from './campo.js';
import { juntar } from './juntar.js';

/** Área de texto com as mesmas medidas do campo de texto (§3 de `componentes.md`).
 *
 *  Hoje o `textarea` é atendido só pelo reset global (`web/styles.css:470-484`) e cada
 *  tela ajusta a altura por conta própria em seis lugares diferentes
 *  (`web/styles.css:1157, 1392, 1582, 1616, 2800, 2868`). A altura passa a ser prop:
 *  `linhas`. O tamanho de fonte continua `--texto-2` pela mesma razão do iOS. */

/* `ComponentPropsWithRef` e não `TextareaHTMLAttributes`: o segundo não inclui `ref`. Mesma
   armadilha de `campo.tsx` e `botao.tsx` — sem referência a tela não move o foco nem
   limpa o controle por código, e acaba presa ao marcador cru do kit antigo. No React 19
   `ref` é propriedade comum e segue no espalhamento, sem `forwardRef`. */
export type PropsAreaTexto = Omit<ComponentPropsWithRef<'textarea'>, 'id' | 'rows'> & {
  id: string;
  rotulo: string;
  marcaRotulo?: string;
  dica?: string;
  erro?: string;
  /** Altura em linhas. Padrão 4; é o que substitui o ajuste por tela. */
  linhas?: number;
  classeEnvelope?: string;
};

export function AreaTexto({
  id,
  rotulo,
  marcaRotulo,
  dica,
  erro,
  linhas = 4,
  classeEnvelope,
  className,
  ...resto
}: PropsAreaTexto) {
  return (
    <EnvelopeCampo
      id={id}
      rotulo={rotulo}
      marcaRotulo={marcaRotulo}
      dica={dica}
      erro={erro}
      className={classeEnvelope}
    >
      <textarea
        id={id}
        rows={linhas}
        aria-describedby={descritores(id, dica)}
        aria-invalid={erro ? true : undefined}
        className={juntar(classeControle, 'resize-y', className)}
        {...resto}
      />
    </EnvelopeCampo>
  );
}
