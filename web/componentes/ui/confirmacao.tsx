/** Confirmação dentro da página, no lugar de `window.confirm`.
 *
 *  Porte React de `web/confirmacao.ts`. O achado que criou aquele arquivo continua valendo:
 *  o diálogo nativo fica ACIMA da página, fora do conteúdo, fora da captura de tela e fora
 *  do teste — e já produziu um diagnóstico errado de "estado perdido" quando o que havia
 *  era um `confirm` esperando resposta que ninguém via.
 *
 *  O que NÃO pode ser "consertado" aqui (`componentes.md` §8, riscos 6 e 7):
 *
 *  - A ORDEM NO DOM é seguir-adiante primeiro, seguro depois. É a ordem de tabulação que as
 *    provas guardam; no celular o `flex-col-reverse` do rodapé inverte só o VISUAL, para a
 *    ação segura cair sob o polegar. Inverter o DOM "para ficar igual ao desenho" quebra as
 *    duas coisas.
 *  - OS PESOS SÃO INVERTIDOS DE PROPÓSITO: quem segue adiante é `secundario`, o botão
 *    seguro é `principal` e leva o foco inicial, porque confirmar por engano é o erro caro.
 *  - A PROMESSA RESOLVE NO FECHAMENTO, não no clique. Se resolvesse no `onClick` do
 *    cancelar, `Esc` deixaria a promessa pendente para sempre e a tela ficaria travada
 *    esperando uma resposta que nunca chega.
 *
 *  O texto diz a consequência. "Continuar?" não informa o que se perde ao continuar.
 */
import { type ReactNode, useCallback, useRef, useState } from 'react';
import { Dialogo } from './dialogo';

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

/** Caso dominante: sair de uma tela com texto digitado que ninguém guardou ainda. */
export function pedidoDescarte(oQue: string): PedidoConfirmacao {
  return {
    titulo: `Descartar ${oQue}?`,
    detalhe: 'O que foi digitado e ainda não foi enviado se perde, e não há como recuperar.',
    acao: 'Descartar',
    cancelar: 'Continuar editando',
  };
}

export type Confirmacao = {
  /** Abre a confirmação e resolve com a resposta. Cancelar e `Esc` resolvem `false`. */
  confirmar(pedido: PedidoConfirmacao): Promise<boolean>;
  confirmarDescarte(oQue: string): Promise<boolean>;
  /** O que a tela precisa renderizar uma vez, em qualquer lugar da árvore. */
  dialogo: ReactNode;
};

export function useConfirmacao(): Confirmacao {
  const [pedido, definirPedido] = useState<PedidoConfirmacao | null>(null);
  const resolver = useRef<((resposta: boolean) => void) | null>(null);
  const resposta = useRef(false);

  const confirmar = useCallback((proximo: PedidoConfirmacao) => {
    // Uma confirmação em cima de outra seria resposta sem pergunta visível: a anterior
    // responde `false` antes de a nova aparecer.
    resolver.current?.(false);
    resposta.current = false;
    definirPedido(proximo);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const confirmarDescarte = useCallback(
    (oQue: string) => confirmar(pedidoDescarte(oQue)),
    [confirmar],
  );

  const fechar = useCallback(() => {
    definirPedido(null);
    const pendente = resolver.current;
    resolver.current = null;
    pendente?.(resposta.current);
  }, []);

  const dialogo = (
    <Dialogo
      aberto={pedido !== null}
      aoFechar={fechar}
      titulo={pedido?.titulo ?? ''}
      {...(pedido?.detalhe ? { descricao: pedido.detalhe } : {})}
      medida="decisao"
      classe="dialogo-confirmacao"
      acoes={[
        {
          rotulo: pedido?.acao ?? '',
          peso: 'secundario',
          marca: 'confirmar',
          aoAtivar: () => {
            resposta.current = true;
            return undefined;
          },
        },
        {
          rotulo: pedido?.cancelar ?? 'Voltar',
          peso: 'principal',
          marca: 'cancelar',
          focoInicial: true,
        },
      ]}
    />
  );

  return { confirmar, confirmarDescarte, dialogo };
}
