import type { ReactNode } from 'react';
import { Esqueleto } from '../componentes/ui/esqueleto.js';

/** A moldura de uma tela administrativa, e a resposta direta à queixa de 24/11/2026:
 *  *"clicando nas abas um loading para montar a página, horrível"*.
 *
 *  O defeito não era a demora, era o desenho da espera: a tela inteira sumia e no lugar
 *  ficava uma frase. Aqui o título, a explicação e a ação são montados UMA vez e não
 *  dependem da consulta — quem indica carga é só a região de conteúdo, por `aria-busy`
 *  no `Esqueleto`, que deixa a regra global de `web/styles.css` desenhar a forma do que
 *  vem (VIS-014).
 *
 *  Sem cartão em volta: a região já é a superfície do assunto, e moldura dentro de
 *  moldura é a "caixa solta" que a regra Superfície plana do `DESIGN.md` proíbe. */
export function MolduraTela({
  titulo,
  explicacao,
  acao,
  status,
  ocupado,
  antes,
  children,
}: {
  titulo: ReactNode;
  explicacao?: ReactNode;
  /** A ação do assunto, ao lado do título. Uma só por região. */
  acao?: ReactNode;
  /** Linha de estado da tela. Vazia significa sem recado: o nó continua montado. */
  status: string;
  /** Há consulta em curso na região de conteúdo. */
  ocupado: boolean;
  /** O que precisa ficar acima do conteúdo e fora da espera, como a recuperação de um
   *  envio sem confirmação — ele não pode recuar junto com a lista que está relendo. */
  antes?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="grid gap-4">
      <header className="grid gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 className="m-0 font-serifada text-(length:--texto-5) font-semibold leading-[1.2]">
            {titulo}
          </h2>
          {acao}
        </div>
        {explicacao === undefined ? null : (
          <p className="m-0 max-w-[68ch] text-texto-suave">{explicacao}</p>
        )}
      </header>
      <p
        // biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o que as telas e as provas já usam; `<output>` muda a semântica de formulário e o gancho que as provas procuram.
        role="status"
        aria-live="polite"
        className="m-0 text-(length:--texto-1) text-texto-suave empty:hidden"
      >
        {status}
      </p>
      {antes}
      <Esqueleto ocupado={ocupado} className="grid gap-4">
        {children}
      </Esqueleto>
    </section>
  );
}
