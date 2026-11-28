/** Apoio de teste para responder aos diálogos renderizados pelo React. */
import { render } from '@testing-library/react';
import { createElement } from 'react';
import { Confirmacoes } from './confirmacao.js';

export type RespostaDeProva = {
  /** Resposta dada às próximas confirmações; pode mudar no meio do teste. */
  resposta: boolean;
  /** Texto de cada confirmação que apareceu, na ordem. */
  chamadas: string[];
  encerrar: () => void;
};

export function responderConfirmacoes(
  resposta = true,
  hospedeiro: 'teste' | 'existente' = 'teste',
): RespostaDeProva {
  const corpo = document.body;
  const painel = hospedeiro === 'teste' ? render(createElement(Confirmacoes)) : null;
  const controle: RespostaDeProva = {
    resposta,
    chamadas: [],
    encerrar: () => {
      observador.disconnect();
      painel?.unmount();
    },
  };
  const atender = () => {
    for (const dialogo of corpo.querySelectorAll<HTMLElement>('.dialogo-confirmacao')) {
      controle.chamadas.push(dialogo.textContent ?? '');
      const alvo = controle.resposta ? 'confirmar' : 'cancelar';
      dialogo.querySelector<HTMLButtonElement>(`[data-acao="${alvo}"]`)?.click();
    }
  };
  const observador = new MutationObserver(atender);
  observador.observe(corpo, { childList: true, subtree: true });
  atender();
  return controle;
}

/** Espera as microtarefas da confirmação: clicar passou a ter resposta assíncrona. */
export function aguardarConfirmacao(): Promise<void> {
  return new Promise((resolver) => requestAnimationFrame(() => setTimeout(resolver, 0)));
}
