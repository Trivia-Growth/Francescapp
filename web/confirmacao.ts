/** Confirmação dentro da página, no lugar de `window.confirm`.
 *
 *  Achado em 25/11/2026 na aba Administração › Equipe: ao conferir convites pendentes a
 *  tela abria um `window.confirm`. O diálogo nativo fica ACIMA da página, fora do
 *  conteúdo: quem olhava a tela via apenas "Conferindo se há algum convite aguardando
 *  resposta…" parado para sempre, e o diagnóstico virou "estado perdido" quando o que
 *  havia era um diálogo esperando resposta que ninguém via. Um `<dialog>` da própria
 *  aplicação aparece no conteúdo, é fotografável, é testável e segue a mesma linguagem
 *  visual do diálogo de cadastro.
 *
 *  O texto diz a consequência. "Continuar?" não informa o que se perde ao continuar.
 *  O botão seguro — cancelar — recebe o foco inicial e é o destaque visual, porque
 *  confirmar por engano é o erro caro; Esc equivale a cancelar.
 */

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

let sequencia = 0;

function focaveis(dialogo: HTMLElement): HTMLElement[] {
  return [...dialogo.querySelectorAll<HTMLButtonElement>('button')].filter(
    (botao) => !botao.disabled,
  );
}

/** Abre a confirmação e resolve com a resposta. Cancelar e Esc resolvem `false`. */
export function confirmar(pedido: PedidoConfirmacao): Promise<boolean> {
  sequencia += 1;
  const marca = `confirmacao-${sequencia}`;
  const dialogo = document.createElement('dialog');
  dialogo.className = 'dialogo dialogo-confirmacao';
  dialogo.dataset.confirmacao = '';

  const titulo = document.createElement('h2');
  titulo.id = `${marca}-titulo`;
  titulo.className = 'dialogo-confirmacao__titulo';
  titulo.textContent = pedido.titulo;
  dialogo.setAttribute('aria-labelledby', titulo.id);
  dialogo.append(titulo);

  if (pedido.detalhe) {
    const detalhe = document.createElement('p');
    detalhe.id = `${marca}-detalhe`;
    detalhe.className = 'dialogo-confirmacao__detalhe';
    detalhe.textContent = pedido.detalhe;
    dialogo.setAttribute('aria-describedby', detalhe.id);
    dialogo.append(detalhe);
  }

  const acoes = document.createElement('div');
  acoes.className = 'dialogo-confirmacao__acoes';
  const cancelar = document.createElement('button');
  cancelar.type = 'button';
  cancelar.className = 'button-primary';
  cancelar.dataset.acao = 'cancelar';
  cancelar.textContent = pedido.cancelar ?? 'Voltar';
  const seguir = document.createElement('button');
  seguir.type = 'button';
  seguir.className = 'button-secondary';
  seguir.dataset.acao = 'confirmar';
  seguir.textContent = pedido.acao;
  acoes.append(seguir, cancelar);
  dialogo.append(acoes);

  const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  return new Promise<boolean>((resolver) => {
    let respondido = false;
    const responder = (resposta: boolean) => {
      if (respondido) return;
      respondido = true;
      if (dialogo.open && typeof dialogo.close === 'function') dialogo.close();
      dialogo.remove();
      // Quem pediu a confirmação continua de onde estava; sem isto o foco cai no body.
      if (anterior?.isConnected) anterior.focus();
      resolver(resposta);
    };

    cancelar.addEventListener('click', () => responder(false));
    seguir.addEventListener('click', () => responder(true));
    // `cancel` é o Esc do próprio `<dialog>`; fechar sem responder é cancelar.
    dialogo.addEventListener('cancel', (evento) => {
      evento.preventDefault();
      responder(false);
    });
    dialogo.addEventListener('keydown', (evento) => {
      if (evento.key === 'Escape') {
        evento.preventDefault();
        responder(false);
        return;
      }
      if (evento.key !== 'Tab') return;
      // Enquanto a decisão está aberta o foco não sai dela, nem por Tab nem por Shift+Tab.
      const botoes = focaveis(dialogo);
      if (botoes.length === 0) return;
      const atual = botoes.indexOf(document.activeElement as HTMLElement);
      const passo = evento.shiftKey ? -1 : 1;
      const destino = (atual + passo + botoes.length) % botoes.length;
      evento.preventDefault();
      botoes[atual === -1 ? 0 : destino].focus();
    });

    document.body.append(dialogo);
    // `showModal` não existe no jsdom das provas; o atributo mantém o diálogo visível e
    // respondível lá, e o navegador real continua recebendo o modal com fundo e foco presos.
    if (typeof dialogo.showModal === 'function') dialogo.showModal();
    else dialogo.setAttribute('open', '');
    cancelar.focus();
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
