/** Diálogo da aplicação sobre Radix Dialog.
 *
 *  Porta `web/ui/dialogo.ts` para React sem perder nada do que foi resolvido em 24–25/11/
 *  2026. O Radix dá portal, camada de dispensa, `aria-modal`, foco preso e inertização do
 *  resto da página. NÃO dá: centralização, teto de altura, corpo rolante com rodapé fixo,
 *  recusa de fechamento e devolução de foco sem gatilho. Tudo isso está escrito aqui.
 *
 *  Decisões que este arquivo mantém de propósito (`componentes.md` §7 e §17):
 *
 *  - CLIQUE FORA NÃO FECHA (`onInteractOutside` com `preventDefault`). Hoje não existe
 *    ouvinte de fundo em `dialogo.ts`; o Radix fecha por padrão, e isso seria mudança de
 *    comportamento no meio de um formulário preenchido.
 *  - `aoAtivar()` devolvendo `false` MANTÉM O DIÁLOGO ABERTO (risco 8). É como a validação
 *    mostra o erro no campo sem a tela sumir. O Radix fecha no clique por padrão; por isso
 *    nenhuma ação é `Dialog.Close`.
 *  - O FOCO VOLTA A QUEM ABRIU (risco 9). O Radix devolve ao `Trigger`; aqui o diálogo
 *    costuma ser aberto por código, sem gatilho, então `onCloseAutoFocus` devolve ao
 *    elemento que estava focado quando `aberto` virou verdadeiro.
 *  - `medida` continua com os três nomes em português (risco 26) e chega ao DOM como
 *    `data-medida`, que é o que as provas de tela procuram.
 *
 *  Botão: as ações do rodapé são `Botao` (`./botao.tsx`). Ele emite os mesmos ganchos de
 *  `dialogo.ts:92-95` — `data-peso` e `data-acao` — e aceita `ref`, que é o que o foco
 *  inicial do risco 8 precisa. Até 26/11/2026 eram `<button className="ui-botao">`, cru,
 *  porque este arquivo nasceu numa frente paralela antes de `botao.tsx` existir.
 */
import * as Radix from '@radix-ui/react-dialog';
import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { classesSobreposicao, Folha, type MedidaSobreposicao, useFormaSobreposicao } from './folha';
import { Botao } from './botao.js';
import { useTravaRolagem } from './trava-rolagem';

export type { MedidaSobreposicao };
/** Nome histórico, preservado para quem veio de `web/ui/dialogo.ts`. */
export type MedidaDialogo = MedidaSobreposicao;

export type AcaoDialogo = {
  /** Rótulo no mesmo verbo do título. "Continuar?" não informa o que se perde. */
  rotulo: string;
  peso?: 'principal' | 'secundario' | 'discreto';
  /** Marca de leitura para provas e para quem procura a ação no DOM (`data-acao`). */
  marca?: string;
  /** Ação própria. Devolver `false` mantém o diálogo aberto (validação recusou). */
  aoAtivar?: () => boolean | undefined;
  /** Fecha o diálogo depois de `aoAtivar`. Padrão: fecha. */
  fecha?: boolean;
  /** Recebe o foco ao abrir. Em decisão, é o botão seguro. */
  focoInicial?: boolean;
  desligada?: boolean;
};

export type PedidoDialogo = {
  aberto: boolean;
  /** Chamado quando o diálogo fecha, por qualquer caminho, inclusive `Esc`. */
  aoFechar: () => void;
  titulo: string;
  /** O que mais quem decide precisa saber antes de responder. */
  descricao?: string;
  /** `formulario` 560px, `conteudo` 720px, `decisao` 420px. No celular todas viram folha. */
  medida?: MedidaSobreposicao;
  acoes?: readonly AcaoDialogo[];
  /** Botão de fechar no cabeçalho. Decisão nunca tem: a resposta é uma das ações. */
  comFechar?: boolean;
  classe?: string;
  children?: ReactNode;
};

export function Dialogo({
  aberto,
  aoFechar,
  titulo,
  descricao,
  medida = 'formulario',
  acoes = [],
  comFechar,
  classe,
  children,
}: PedidoDialogo) {
  const forma = useFormaSobreposicao();
  const classes = classesSobreposicao(forma, medida);
  const quemAbriu = useRef<HTMLElement | null>(null);
  const focoInicial = useRef<HTMLButtonElement | null>(null);

  // A trava do Radix é bloqueada pela CSP; esta funciona. Ver `trava-rolagem.ts`.
  useTravaRolagem(aberto);

  // Quem abriu é lido na transição para aberto, antes de o Radix mover o foco.
  useEffect(() => {
    if (!aberto) return;
    const ativo = document.activeElement;
    quemAbriu.current = ativo instanceof HTMLElement ? ativo : null;
  }, [aberto]);

  const fechar = useCallback(() => aoFechar(), [aoFechar]);

  const mostrarFechar = comFechar !== false && medida !== 'decisao';
  const indiceFoco = acoes.findIndex((acao) => acao.focoInicial);

  const cabecalho = (
    <>
      <div className="min-w-0">
        <Radix.Title className={classes.titulo}>{titulo}</Radix.Title>
        {descricao ? (
          <Radix.Description className={classes.descricao}>{descricao}</Radix.Description>
        ) : null}
      </div>
      {mostrarFechar ? (
        <button
          type="button"
          className={classes.fechar}
          data-acao="fechar"
          aria-label="Fechar"
          onClick={fechar}
        >
          ×
        </button>
      ) : null}
    </>
  );

  const rodape = acoes.length ? (
    <>
      {acoes.map((acao, posicao) => (
        /* Até 26/11/2026 este rodapé montava `<button className="ui-botao">`, do kit
           imperativo: foi escrito quando `botao.tsx` ainda não existia, numa frente
           paralela. Era a última classe do sistema antigo saindo no marcador de um
           componente que já vive em `componentes/ui`. */
        <Botao
          key={acao.marca ?? acao.rotulo}
          ref={posicao === indiceFoco ? focoInicial : undefined}
          className={classes.acao}
          peso={acao.peso ?? 'secundario'}
          {...(acao.marca ? { marca: acao.marca } : {})}
          disabled={acao.desligada}
          aoAtivar={() => {
            // Risco 8: a recusa da validação mantém o diálogo aberto.
            if (acao.aoAtivar?.() === false) return;
            if (acao.fecha !== false) fechar();
          }}
        >
          {acao.rotulo}
        </Botao>
      ))}
    </>
  ) : null;

  return (
    <Radix.Root
      open={aberto}
      onOpenChange={(proximo) => {
        if (!proximo) fechar();
      }}
    >
      <Radix.Portal>
        {/* O fundo é também a grade que centraliza. Não vem de graça: o Radix renderiza um
            `div` em portal, e o `margin: auto` que o navegador aplica a `dialog:modal` não
            vale aqui (risco 3). O conteúdo é filho do fundo justamente para a grade
            alcançá-lo. */}
        <Radix.Overlay className={classes.fundo} data-forma={forma}>
          <Radix.Content
            asChild
            // Sem descrição, o Radix avisaria no console e apontaria para um id que não
            // existe; com descrição, quem manda é o `Radix.Description` acima.
            {...(descricao ? {} : { 'aria-describedby': undefined })}
            // Clique fora não fecha: era assim na camada anterior, e um formulário
            // preenchido não pode sumir por um clique de passagem.
            onInteractOutside={(evento) => evento.preventDefault()}
            onOpenAutoFocus={(evento) => {
              if (indiceFoco < 0) return;
              evento.preventDefault();
              focoInicial.current?.focus();
            }}
            // Risco 9: sem gatilho, o Radix devolveria o foco a lugar nenhum.
            onCloseAutoFocus={(evento) => {
              evento.preventDefault();
              const origem = quemAbriu.current;
              if (origem?.isConnected) origem.focus();
            }}
          >
            <Folha
              forma={forma}
              medida={medida}
              classe={classe}
              cabecalho={cabecalho}
              corpo={children}
              rodape={rodape}
            />
          </Radix.Content>
        </Radix.Overlay>
      </Radix.Portal>
    </Radix.Root>
  );
}
