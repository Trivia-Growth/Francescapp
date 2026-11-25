/** Apoio de teste: responde às confirmações da própria tela.
 *
 *  As provas antigas trocavam `window.confirm` por um espião e liam o retorno. Agora a
 *  confirmação é um `<dialog>` no documento e a resposta é um clique — este auxiliar
 *  clica por elas e guarda o texto de cada decisão oferecida, para que a prova continue
 *  afirmando o que afirmava: que a tela perguntou, e o quê. Não é usado em produção.
 */

export type RespostaDeProva = {
  /** Resposta dada às próximas confirmações; pode mudar no meio do teste. */
  resposta: boolean;
  /** Texto de cada confirmação que apareceu, na ordem. */
  chamadas: string[];
  encerrar: () => void;
};

export function responderConfirmacoes(resposta = true): RespostaDeProva {
  const controle: RespostaDeProva = {
    resposta,
    chamadas: [],
    encerrar: () => observador.disconnect(),
  };
  const atender = () => {
    for (const dialogo of document.querySelectorAll<HTMLDialogElement>(
      'dialog[data-confirmacao]',
    )) {
      controle.chamadas.push(dialogo.textContent ?? '');
      const alvo = controle.resposta ? 'confirmar' : 'cancelar';
      dialogo.querySelector<HTMLButtonElement>(`[data-acao="${alvo}"]`)?.click();
    }
  };
  const observador = new MutationObserver(atender);
  observador.observe(document.body, { childList: true, subtree: true });
  atender();
  return controle;
}

/** Espera as microtarefas da confirmação: clicar passou a ter resposta assíncrona. */
export function aguardarConfirmacao(): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, 0));
}
