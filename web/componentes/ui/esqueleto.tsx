import { Children, type HTMLAttributes, type ReactNode } from 'react';
import { juntar } from './juntar.js';

/** Espera com forma. Envolve a região que está consultando e mantém `aria-busy` como o
 *  sinal — não troca a espera por um indicador novo (§13 de `componentes.md`).
 *
 *  Duas formas, e a escolha não é do chamador: é do conteúdo.
 *  - **vazio**: a região não tem nada a mostrar ainda. Fica vazia de propósito, e a regra
 *    global de `web/styles.css:3246-3277` desenha as três barras de `--soft` e a
 *    varredura, com o atraso de 300ms que impede o piscar de uma consulta rápida.
 *  - **recuo**: a região já mostra o resultado anterior. Ela **não** é desmontada; apenas
 *    recua para `opacity: .62` (`web/styles.css:3278-3281`). Atualizar uma lista não é
 *    motivo para esvaziá-la — esvaziar produz três estados em menos de um segundo, que é
 *    o defeito descrito em `web/styles.css:3234-3237`.
 *
 *  Por isso o componente não pinta barra nenhuma por conta própria: pintar significaria
 *  deixar a região de ser `:empty` e perder a forma e o atraso que a folha já governa —
 *  inclusive a parada da varredura em `prefers-reduced-motion`, que tem bloco único.
 *  `data-forma` existe para a tela e o teste poderem afirmar qual das duas está valendo. */

export type FormaEsqueleto = 'vazio' | 'recuo';

export type PropsEsqueleto = HTMLAttributes<HTMLDivElement> & {
  /** Há consulta em curso. */
  ocupado: boolean;
  children?: ReactNode;
};

export function Esqueleto({ ocupado, className, children, ...resto }: PropsEsqueleto) {
  const temConteudo = Children.toArray(children).length > 0;
  const forma: FormaEsqueleto | undefined = ocupado ? (temConteudo ? 'recuo' : 'vazio') : undefined;
  /* `min-w-0`: sem isto o envelope é item de grade ou flex com largura mínima automática e
     NÃO encolhe. Medido a 390px em 25/11/2026: a tela de Equipe ficou com `scrollWidth
     578`, rolagem horizontal de página que não existia antes. As células da lista já
     truncam; quem segurava a largura era este envelope. */
  return (
    <div
      aria-busy={ocupado}
      data-forma={forma}
      className={juntar('block min-w-0', className)}
      {...resto}
    >
      {children}
    </div>
  );
}
