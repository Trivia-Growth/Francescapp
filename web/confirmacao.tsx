/** Confirmações em portal da raiz React, com foco inicial no botão seguro. */
import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
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

type ConfirmacaoPendente = {
  id: number;
  pedido: PedidoConfirmacao;
  resolver(resposta: boolean): void;
};

const ouvintes = new Set<() => void>();
let pendentes: ConfirmacaoPendente[] = [];
let proximoId = 0;

function inscrever(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
    if (ouvintes.size) return;
    const abandonadas = pendentes;
    pendentes = [];
    for (const pendente of abandonadas) pendente.resolver(false);
  };
}

function mudarPendentes(proximas: ConfirmacaoPendente[]) {
  pendentes = proximas;
  for (const ouvir of ouvintes) ouvir();
}

function lerPendentes() {
  return pendentes;
}

/** O hospedeiro pertence à raiz da página e acompanha as chamadas de dentro e fora dela. */
export function Confirmacoes() {
  const confirmacoes = useSyncExternalStore(inscrever, lerPendentes);
  return confirmacoes.map(({ id, pedido, resolver }) => (
    <ConfirmacaoAvulsa
      key={id}
      pedido={pedido}
      aoResolver={(resposta) => {
        resolver(resposta);
        // O Radix precisa concluir o fechamento e devolver o foco antes de desmontar.
        setTimeout(() => mudarPendentes(pendentes.filter((pendente) => pendente.id !== id)), 0);
      }}
    />
  ));
}

/** Abre a confirmação e resolve com a resposta. Cancelar e Esc resolvem `false`. */
export function confirmar(pedido: PedidoConfirmacao): Promise<boolean> {
  if (!ouvintes.size) {
    console.error('Confirmação chamada sem hospedeiro React.');
    return Promise.resolve(false);
  }
  return new Promise<boolean>((resolver) => {
    const id = ++proximoId;
    flushSync(() => mudarPendentes([...pendentes, { id, pedido, resolver }]));
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
