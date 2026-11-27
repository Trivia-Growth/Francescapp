/** Confirmação dentro da página, no lugar de `window.confirm`.
 *
 *  Achado em 25/11/2026 na aba Administração › Equipe: ao conferir convites pendentes a
 *  tela abria um `window.confirm`. O diálogo nativo fica ACIMA da página, fora do
 *  conteúdo: quem olhava a tela via apenas "Conferindo se há algum convite aguardando
 *  resposta…" parado para sempre, e o diagnóstico virou "estado perdido" quando o que
 *  havia era um diálogo esperando resposta que ninguém via.
 *
 *  O texto diz a consequência. "Continuar?" não informa o que se perde ao continuar.
 *  O botão seguro — cancelar — recebe o foco inicial e é o destaque visual, porque
 *  confirmar por engano é o erro caro; Esc equivale a cancelar.
 *
 *  Reconstruído em React sobre `Dialogo` (`componentes/ui/dialogo.tsx`, Radix) no lugar de
 *  `web/ui/dialogo.ts`: a mecânica de foco preso, Esc e devolução do foco passa a ser a do
 *  Radix, já provada em `componentes/ui/dialogo.test.tsx`, em vez de reimplementada à mão.
 *
 *  A assinatura de função livre NÃO muda — `confirmar`/`confirmarDescarte` continuam
 *  devolvendo `Promise<boolean>`, chamáveis de qualquer lugar, dentro ou fora de uma árvore
 *  React — porque é isto que mantém a propriedade que já tornava este arquivo seguro: o
 *  diálogo vive FORA de toda árvore React, num contêiner próprio criado e removido do
 *  `document.body`, nunca aninhado na árvore de quem chama. Trocar a função livre por um
 *  hook que renderiza `{dialogo}` dentro do chamador reabriria exatamente o risco que esta
 *  propriedade evita — por isso não existe aqui.
 *
 *  Achado medido nesta migração: fechar NÃO é desmontar a raiz no mesmo instante. O
 *  fechamento troca `aberto` para falso — a árvore continua viva — e só desmonta depois,
 *  num `setTimeout(0)`. Desmontar a raiz no mesmo instante em que `aberto` vira falso
 *  interrompe no meio o próprio ciclo de fechamento do Radix: `onCloseAutoFocus` (a
 *  devolução de foco a quem abriu) fica pendente e só dispara mais tarde, de forma
 *  assíncrona — e se um SEGUNDO `confirmar()` já tiver aberto e fechado enquanto isso,
 *  essa devolução atrasada do primeiro diálogo sobrescreve o foco que a tela já tinha
 *  posto correto depois do segundo. Reproduzido com dois `confirmar()` em sequência rápida
 *  (como o apoio de teste `confirmacao-prova.ts` produz): o foco final acabava voltando ao
 *  que abriu o PRIMEIRO diálogo, não ao que a tela escreveu depois do segundo. */
import { useCallback, useRef, useState } from 'react';
import { ilha } from './ponte/ilha.js';
import { Dialogo } from './componentes/ui/dialogo.js';

export type PedidoConfirmacao = {
  /** A consequência, em uma frase, como pergunta. Nunca "Continuar?". */
  titulo: string;
  /** O que mais quem decide precisa saber antes de responder. */
  detalhe?: string;
  /** Rótulo do botão que segue adiante, no mesmo verbo do título. */
  acao: string;
  /** Rótulo do botão seguro. O padrão volta ao que a pessoa estava fazendo. */
  cancelar?: string;
};

type PropsConfirmacaoAvulsa = {
  pedido: PedidoConfirmacao;
  aoResolver: (resposta: boolean) => void;
};

function ConfirmacaoAvulsa({ pedido, aoResolver }: PropsConfirmacaoAvulsa) {
  const [aberto, definirAberto] = useState(true);
  const resposta = useRef(false);
  const fechar = useCallback(() => {
    definirAberto(false);
    aoResolver(resposta.current);
  }, [aoResolver]);

  return (
    <Dialogo
      aberto={aberto}
      aoFechar={fechar}
      titulo={pedido.titulo}
      {...(pedido.detalhe ? { descricao: pedido.detalhe } : {})}
      medida="decisao"
      classe="dialogo-confirmacao"
      acoes={[
        // A ordem no DOM põe "seguir" antes do seguro: é a ordem de tabulação que as
        // provas guardam, e no celular o rodapé inverte visualmente para o seguro ficar
        // sob o polegar.
        {
          rotulo: pedido.acao,
          peso: 'secundario',
          marca: 'confirmar',
          aoAtivar: () => {
            resposta.current = true;
            return undefined;
          },
        },
        {
          rotulo: pedido.cancelar ?? 'Voltar',
          peso: 'principal',
          marca: 'cancelar',
          focoInicial: true,
        },
      ]}
    />
  );
}

/** Abre a confirmação e resolve com a resposta. Cancelar e Esc resolvem `false`. */
export function confirmar(pedido: PedidoConfirmacao): Promise<boolean> {
  return new Promise<boolean>((resolver) => {
    const container = document.createElement('div');
    document.body.append(container);
    let desmontar: (() => void) | null = null;
    desmontar = ilha(
      container,
      <ConfirmacaoAvulsa
        pedido={pedido}
        aoResolver={(resposta) => {
          resolver(resposta);
          setTimeout(() => {
            desmontar?.();
            container.remove();
          }, 0);
        }}
      />,
    );
  });
}

/** Caso dominante: sair de uma tela com texto digitado que ninguém guardou ainda. */
export function confirmarDescarte(oQue: string): Promise<boolean> {
  return confirmar({
    titulo: `Descartar ${oQue}?`,
    detalhe: 'O que foi digitado e ainda não foi enviado se perde, e não há como recuperar.',
    acao: 'Descartar',
    cancelar: 'Continuar editando',
  });
}
