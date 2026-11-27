/** Sobreposição da aplicação — um componente, dois comportamentos.
 *
 *  Este arquivo guarda a PARTE QUE NÃO É RADIX: a forma, a grade de três faixas e as
 *  classes. `dialogo.tsx` liga isto ao Radix Dialog; `popover.tsx` e `selecao-busca.tsx`
 *  reaproveitam o sinal de rolagem.
 *
 *  Por que existe separado: `web/estilos/ui.css:400-554` resolve diálogo e folha no MESMO
 *  elemento, por consulta de mídia. O Radix renderiza um `div` em portal e decide forma em
 *  JavaScript (`design.md:120`: `Dialog` acima de 768px, `Sheet` abaixo). Então o ponto de
 *  corte passa a ser observável em JavaScript — `useFormaSobreposicao` — em vez de viver só
 *  na folha de estilo. A consequência boa é que a prova de celular é real, e não uma
 *  afirmação sobre uma consulta de mídia que o jsdom nunca avalia.
 *
 *  Os quatro pontos reclamados em 25/11/2026 ("modal centralizar e ficar com botões
 *  visíveis caso tenha scroll que funcione"), e onde cada um está escrito aqui:
 *
 *  1. CENTRALIZAÇÃO — `FUNDO.dialogo` tem `grid place-items-center`. Não vem de graça:
 *     o `margin: auto` que o navegador aplica a `dialog:modal` não vale para um `div` em
 *     portal (`componentes.md`, risco 3).
 *  2. TETO DE ALTURA — `TETO.dialogo` repete `min(640px, calc(100dvh - var(--espaco-6) *
 *     2))` de `ui.css:415`, em `dvh` e nunca em `vh` (riscos 1 e 2).
 *  3. AÇÕES VISÍVEIS — a grade é `flex column` com cabeçalho e rodapé em `flex-none` e o
 *     corpo em `flex-1 min-h-0 overflow-y-auto`. O `min-h-0` é a peça que faz o corpo
 *     encolher em vez de empurrar o rodapé para fora da tela.
 *  4. FOLHA NO CELULAR — `forma === 'folha'`: largura inteira, colada embaixo
 *     (`mt-auto`), raio só em cima, rodapé em `flex-col-reverse` com `env(safe-area-inset-
 *     bottom)` e botões largos.
 *
 *  Regra de cor: nenhum literal. Onde `ui.css` escreveu `rgb(31 31 29 / 0.18)`, aqui vai
 *  `color-mix(in srgb, var(--ink) 18%, transparent)` — mesma intenção, token no lugar do
 *  valor.
 */
import type { ComponentPropsWithRef, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { juntar } from './juntar';

/** `formulario` 560px, `conteudo` 720px, `decisao` 420px — os três nomes de `ui.css:408`,
 *  `ui.css:424-429`. No celular todas viram folha. */
export type MedidaSobreposicao = 'formulario' | 'conteudo' | 'decisao';

export type FormaSobreposicao = 'dialogo' | 'folha';

/** O mesmo 768px de `ui.css:526`. Abaixo disso, folha. */
export const CONSULTA_FOLHA = '(max-width: 767px)';

/** Sinal de que há mais conteúdo abaixo ou acima: quatro camadas de pintura. As duas
 *  `local` acompanham o conteúdo e encobrem as duas `scroll` ao chegar na ponta. Nada
 *  anima — é pintura, não movimento — e por isso continua valendo sob
 *  `prefers-reduced-motion` (`ui.css:471-492`, risco 4). */
export const SINAL_ROLAGEM_VERTICAL =
  '[background:linear-gradient(to_bottom,var(--white)_40%,transparent)_top/100%_24px_no-repeat_local,linear-gradient(to_top,var(--white)_40%,transparent)_bottom/100%_24px_no-repeat_local,linear-gradient(to_bottom,color-mix(in_srgb,var(--ink)_18%,transparent),transparent)_top/100%_18px_no-repeat_scroll,linear-gradient(to_top,color-mix(in_srgb,var(--ink)_18%,transparent),transparent)_bottom/100%_18px_no-repeat_scroll_var(--white)]';

const TETO = {
  // `ui.css:415`. Ver o comentário de medição lá: sem o teto de 640px o cadastro em
  // 1440x900 ficava com 852px de altura e 24px de folga, lendo como lâmina colada à tela.
  dialogo: 'max-h-[min(640px,calc(100dvh-var(--espaco-6)*2))]',
  // `ui.css:532`.
  folha: 'max-h-[calc(100dvh-var(--espaco-6))]',
} as const;

const LARGURA: Record<MedidaSobreposicao, string> = {
  formulario: 'w-[min(560px,calc(100vw-var(--espaco-6)))]',
  conteudo: 'w-[min(720px,calc(100vw-var(--espaco-6)))]',
  decisao: 'w-[min(420px,calc(100vw-var(--espaco-6)))]',
};

const FUNDO = {
  dialogo: 'fixed inset-0 z-50 grid place-items-center overflow-hidden bg-sobreposicao',
  folha: 'fixed inset-0 z-50 grid items-end justify-items-stretch overflow-hidden bg-sobreposicao',
} as const;

export type ClassesSobreposicao = {
  fundo: string;
  conteudo: string;
  cabecalho: string;
  titulo: string;
  descricao: string;
  fechar: string;
  corpo: string;
  rodape: string;
  acao: string;
};

/** Todas as classes da sobreposição em um lugar só, para a forma e a medida serem a única
 *  coisa que o chamador escolhe. */
export function classesSobreposicao(
  forma: FormaSobreposicao,
  medida: MedidaSobreposicao,
): ClassesSobreposicao {
  const folha = forma === 'folha';
  const decisao = medida === 'decisao';
  return {
    fundo: FUNDO[forma],
    conteudo: juntar(
      // As três faixas. `flex-col` + `min-h-0` no corpo é o que mantém o rodapé na tela.
      'flex flex-col overflow-hidden border-borda bg-superficie text-texto shadow-modal',
      folha
        ? juntar('mx-0 mt-auto mb-0 w-full max-w-full border-t rounded-t-painel', TETO.folha)
        : juntar('border rounded-painel', LARGURA[medida], TETO.dialogo),
    ),
    cabecalho: juntar(
      'flex flex-none items-start justify-between gap-4 border-b border-borda pt-5 pb-4',
      folha ? 'px-4' : 'px-5',
      // Decisão não rola e não tem corpo: o filete do cabeçalho sobraria (`ui.css:514-517`).
      decisao && 'border-b-0 pb-0',
    ),
    titulo: 'm-0 font-serifada text-4 leading-[1.2] font-semibold',
    descricao: 'mt-2 max-w-[68ch] text-1 text-texto-suave',
    // 44px é o alvo de toque de `ui.css:456-470`, não um número novo.
    fechar: juntar(
      'flex-none min-h-[44px] min-w-[44px] cursor-pointer rounded-campo',
      'border border-transparent bg-transparent p-0 text-3 leading-none text-primaria',
      'hover:bg-superficie-3',
    ),
    corpo: juntar(
      'flex-1 min-h-0 overflow-y-auto overscroll-contain',
      SINAL_ROLAGEM_VERTICAL,
      folha ? 'p-4' : 'p-5',
      decisao && 'pt-3',
    ),
    rodape: juntar(
      'flex flex-none gap-3 border-t border-borda bg-superficie',
      folha
        ? // A ação segura cai sob o polegar; a ordem no DOM não muda (`ui.css:546-553`).
          'flex-col-reverse items-stretch px-4 pt-4 pb-[calc(var(--espaco-4)+env(safe-area-inset-bottom,0px))]'
        : 'flex-wrap items-center justify-end px-5 py-4',
      decisao && 'border-t-0',
    ),
    acao: folha ? 'w-full' : '',
  };
}

/** Lê o ponto de corte de 768px e continua ouvindo: girar o aparelho com a sobreposição
 *  aberta troca a forma, como a consulta de mídia fazia. Sem `matchMedia` — jsdom sem
 *  recorte declarado — assume diálogo. */
export function useFormaSobreposicao(): FormaSobreposicao {
  const [forma, definir] = useState<FormaSobreposicao>(() => formaAgora());
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const consulta = window.matchMedia(CONSULTA_FOLHA);
    const responder = () => definir(consulta.matches ? 'folha' : 'dialogo');
    responder();
    consulta.addEventListener?.('change', responder);
    return () => consulta.removeEventListener?.('change', responder);
  }, []);
  return forma;
}

function formaAgora(): FormaSobreposicao {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dialogo';
  return window.matchMedia(CONSULTA_FOLHA).matches ? 'folha' : 'dialogo';
}

export type PedidoFolha = {
  forma: FormaSobreposicao;
  medida: MedidaSobreposicao;
  cabecalho: ReactNode;
  corpo?: ReactNode;
  rodape?: ReactNode;
  classe?: string;
} & Omit<ComponentPropsWithRef<'div'>, 'className' | 'children'>;

/** A grade de três faixas, sem nenhuma dependência de Radix: cabeçalho fixo, corpo
 *  rolante, rodapé fixo. Quem renderiza isto decide o que é cada faixa.
 *
 *  Aceita e repassa `ref` e o resto das propriedades de `div` porque `dialogo.tsx` a monta
 *  com `asChild` do Radix: é o MESMO elemento que recebe `role="dialog"`, `aria-modal` e os
 *  tratadores da camada de dispensa. Sem o repasse, a grade e o diálogo seriam dois
 *  elementos e o teto de altura ficaria no errado.
 *
 *  Corpo e rodapé vazios não são montados. É o equivalente React de
 *  `.ui-dialogo__corpo:empty { display: none }` (`ui.css:505-513`, risco 5): sem isso, a
 *  decisão volta a mostrar a faixa cinza dos dois sinais de rolagem sobrepostos. */
export function Folha({ forma, medida, cabecalho, corpo, rodape, classe, ...resto }: PedidoFolha) {
  const classes = classesSobreposicao(forma, medida);
  return (
    <div
      {...resto}
      className={juntar(classes.conteudo, classe)}
      data-forma={forma}
      data-medida={medida}
    >
      <div className={classes.cabecalho} data-faixa="cabecalho">
        {cabecalho}
      </div>
      {corpo ? (
        <div className={classes.corpo} data-faixa="corpo">
          {corpo}
        </div>
      ) : null}
      {rodape ? (
        <div className={classes.rodape} data-faixa="rodape">
          {rodape}
        </div>
      ) : null}
    </div>
  );
}
