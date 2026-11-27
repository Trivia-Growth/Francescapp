import type { ReactNode } from 'react';
import { juntar } from './juntar.js';

/** Uma superfície por assunto (`web/ui/ui.css:21-24`).
 *
 *  Fundo branco sobre o lavado da página e filete de 1px no lugar de sombra: o degrau de
 *  fundo já separa, e a sombra fica reservada ao que flutua de verdade — diálogo e menu.
 *  É a regra "superfície plana" do `DESIGN.md`, e o antídoto direto da queixa de
 *  24/11/2026 sobre "uma caixa solta": caixa dentro de caixa é uma decisão a mais pedida
 *  ao olho, sem nada em troca. */
export function Superficie({
  titulo,
  descricao,
  acao,
  plana = false,
  className,
  children,
}: {
  /** Título do assunto. Sem ele o cabeçalho inteiro não é montado. */
  titulo?: ReactNode;
  descricao?: ReactNode;
  /** Ação do assunto, alinhada ao título. Uma só domina cada região. */
  acao?: ReactNode;
  /** Sem moldura: quando a superfície já está dentro de outra, o filete seria duplicado. */
  plana?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={juntar(
        // `min-w-0`: item de grade ou flex tem largura mínima automática e NÃO encolhe
        // abaixo do conteúdo. Medido a 390px em 25/11/2026: a página passava a rolar na
        // horizontal porque a superfície segurava a largura do que havia dentro dela.
        'min-w-0',
        plana ? '' : 'rounded-cartao border border-borda bg-superficie',
        className,
      )}
    >
      {titulo === undefined ? null : (
        <header className="flex flex-wrap items-baseline justify-between gap-3 gap-x-4 border-b border-borda px-5 py-4">
          <div className="min-w-0">
            <h2 className="m-0 font-serifada text-(length:--texto-4) font-semibold leading-[1.2]">
              {titulo}
            </h2>
            {descricao === undefined ? null : (
              <p className="mt-1 mb-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave">
                {descricao}
              </p>
            )}
          </div>
          {acao}
        </header>
      )}
      <div className={plana ? '' : 'p-5'}>{children}</div>
    </section>
  );
}
