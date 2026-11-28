import { classesBotao, type PesoBotao } from '../componentes/ui/botao.js';

/* Cria um botão para os controles do HTML e aplica as classes de `componentes/ui/botao.tsx`.
 * O chamador guarda o nó e controla seu ciclo de vida. */

export type PedidoBotaoImperativo = {
  rotulo: string;
  peso?: PesoBotao;
  tipo?: 'button' | 'submit';
  id?: string;
  marca?: string;
  rotuloLeitura?: string;
  largo?: boolean;
  aoAtivar?: (evento: MouseEvent) => void;
};

export function botao(pedido: PedidoBotaoImperativo): HTMLButtonElement {
  const elemento = document.createElement('button');
  elemento.type = pedido.tipo ?? 'button';
  elemento.className = classesBotao({ peso: pedido.peso, largo: pedido.largo });
  elemento.dataset.peso = pedido.peso ?? 'secundario';
  if (pedido.id) elemento.id = pedido.id;
  if (pedido.marca) elemento.dataset.acao = pedido.marca;
  if (pedido.rotuloLeitura) elemento.setAttribute('aria-label', pedido.rotuloLeitura);
  elemento.textContent = pedido.rotulo;
  if (pedido.aoAtivar) elemento.addEventListener('click', pedido.aoAtivar);
  return elemento;
}
