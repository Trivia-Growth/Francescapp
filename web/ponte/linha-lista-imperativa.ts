export type PedidoLinha = {
  /** O que a linha é. Fica em primeiro, na mesma coluna em todas as linhas. */
  principal: Node | string;
  /** O que ajuda a reconhecer. Cinza, menor, logo ao lado. */
  secundario?: Node | string;
  /** O estado, à direita. É o que se compara entre linhas. */
  fim?: Node | readonly Node[];
  antes?: Node;
  rotuloLeitura: string;
  aoAbrir?: () => void;
};

function comoNo(valor: Node | string, classe: string): Node {
  if (typeof valor !== 'string') return valor;
  const span = document.createElement('span');
  span.className = classe;
  span.textContent = valor;
  return span;
}

/** Linha de lista: um botão que ocupa a linha inteira, com alvo de toque suficiente e a
 *  mesma ordem de campos em todas. Lista é para comparar; por isso nada de cartão. */
export function linhaLista(pedido: PedidoLinha): HTMLLIElement {
  const item = document.createElement('li');
  const abrir = document.createElement('button');
  abrir.type = 'button';
  abrir.className = 'ui-linha';
  abrir.setAttribute('aria-label', pedido.rotuloLeitura);
  if (pedido.antes) abrir.append(pedido.antes);
  const texto = document.createElement('span');
  texto.className = 'ui-linha__texto';
  texto.append(comoNo(pedido.principal, 'ui-linha__principal'));
  if (pedido.secundario) texto.append(comoNo(pedido.secundario, 'ui-linha__secundario'));
  if (pedido.fim) texto.append(...(Array.isArray(pedido.fim) ? pedido.fim : [pedido.fim]));
  abrir.append(texto);
  const seta = document.createElement('span');
  seta.className = 'ui-linha__seta';
  seta.setAttribute('aria-hidden', 'true');
  abrir.append(seta);
  if (pedido.aoAbrir) abrir.addEventListener('click', pedido.aoAbrir);
  item.append(abrir);
  return item;
}
