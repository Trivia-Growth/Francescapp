import type { ReactNode } from 'react';
import { juntar } from './juntar.js';

export type TomAviso = 'informacao' | 'atencao' | 'erro';

/** Aviso e erro: régua à esquerda e fundo lavado, nunca uma caixa colorida
 *  (`ui.css:` bloco `.ui-aviso`).
 *
 *  O tom muda a régua e o fundo, não a cor do texto — texto é sempre carvão, exceto o
 *  erro, que tem cor própria e contraste conferido. Cor nunca é o único sinal: o título
 *  diz o que houve em palavras, e `role="alert"` anuncia para quem ouve.
 *
 *  Erro sem recuperação é beco sem saída. Por isso `acao` existe e a tela que não a passa
 *  está declarando que não há o que tentar. */
export function EstadoErro({
  tom = 'erro',
  titulo,
  texto,
  acao,
}: {
  tom?: TomAviso;
  titulo: ReactNode;
  /** A causa em linguagem de quem usa, não o código do servidor. */
  texto?: ReactNode;
  /** A recuperação: tentar de novo, voltar, pedir acesso. */
  acao?: ReactNode;
}) {
  const porTom: Record<TomAviso, string> = {
    informacao: 'border-l-marca bg-superficie-2 text-texto',
    atencao: 'border-l-aviso-filete bg-aviso-superficie text-aviso-texto',
    erro: 'border-l-erro bg-erro-superficie text-erro',
  };
  return (
    <div
      role={tom === 'erro' ? 'alert' : 'status'}
      aria-live={tom === 'erro' ? 'assertive' : 'polite'}
      data-tom={tom}
      className={juntar(
        'grid justify-items-start gap-1 rounded-r-campo border-l-[3px] px-4 py-3 text-(length:--texto-2)',
        porTom[tom],
      )}
    >
      <p className="m-0 text-(length:--texto-2) font-semibold">{titulo}</p>
      {texto === undefined ? null : <p className="m-0 max-w-[68ch]">{texto}</p>}
      {acao}
    </div>
  );
}
