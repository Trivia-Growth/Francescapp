import type { SelectHTMLAttributes } from 'react';
import { EnvelopeCampo, classeControle, descritores } from './campo.js';
import { juntar } from './juntar.js';

/** O `<select>` nativo vestido com as medidas do campo (§2 e §4 de `componentes.md`).
 *
 *  Não é a seleção aprimorada de `web/ui/selecao.ts` — essa, com lista própria, teclado
 *  de combobox e busca por letra, é `selecao-busca.tsx`. Aqui o controle do navegador
 *  continua inteiro: ele é dono do valor, está na ordem de tabulação, abre com o teclado
 *  do sistema e funciona sem script nenhum. Para a maioria das telas é o que basta, e é
 *  o que não tem como regredir.
 *
 *  A seta continua sendo a do navegador: desenhá-la exigiria pintar um filete, e o
 *  oliva — o único tom de marca que serve para isso — não pode virar cor de texto
 *  (`design.md:78-80`). Sem `appearance-none`, não há seta a repor. */

export type PropsSelecaoSimples = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  id: string;
  rotulo: string;
  marcaRotulo?: string;
  dica?: string;
  erro?: string;
  classeEnvelope?: string;
};

export function SelecaoSimples({
  id,
  rotulo,
  marcaRotulo,
  dica,
  erro,
  classeEnvelope,
  className,
  children,
  ...resto
}: PropsSelecaoSimples) {
  return (
    <EnvelopeCampo
      id={id}
      rotulo={rotulo}
      marcaRotulo={marcaRotulo}
      dica={dica}
      erro={erro}
      className={classeEnvelope}
    >
      <select
        id={id}
        aria-describedby={descritores(id, dica)}
        aria-invalid={erro ? true : undefined}
        className={juntar(classeControle, 'cursor-pointer', className)}
        {...resto}
      >
        {children}
      </select>
    </EnvelopeCampo>
  );
}
