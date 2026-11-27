import { classesBotao, type PesoBotao } from '../componentes/ui/botao.js';

/* A ponte que deixa um módulo ainda imperativo parar de importar `web/ui/basicos.ts` sem
 * precisar virar React. `ficha-paciente.ts` e `financeiro.ts` hospedam seções React de
 * outros módulos via um contrato `montar(raiz): desmontar` — ver `ponte/ilha.ts` — e
 * fazem isso com disciplina de desmontagem já corrigida em 26/11/2026 (`NotFoundError`
 * em `web/main.ts`/`web/avisos.tsx`). Reescrever a própria casca em React para trocar só
 * a classe de um botão reabriria exatamente aquele risco, sem necessidade: o ganho aqui
 * é um botão com a classe de `componentes/ui/botao.tsx`, não uma segunda raiz React.
 *
 * Mesma assinatura de `web/ui/basicos.ts:botao` de propósito — troca de importação, sem
 * tocar no resto do módulo que chama. */

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
