/* Foco preso, fora de `web/ui/`.
 *
 * Saiu de `web/ui/dialogo.ts` sem mudar uma linha de comportamento, para que
 * `web/painel-cadastro.ts` — carregado por `<script>` em `web/index.html`, dono de nenhum
 * nó — pare de importar o kit imperativo antigo sem virar React. Não há o que desenhar
 * ali: o `<dialog>` e o formulário são de `index.html` e são lidos por `main.ts` no
 * carregamento; trocá-los por um `Dialogo` Radix é a migração da casca, não desta ponte.
 *
 * `web/ui/dialogo.ts` importa daqui: uma implementação só, para as duas não divergirem
 * em silêncio enquanto a camada antiga existir. */

const SELETOR_FOCAVEL = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/** Controles que de fato recebem foco agora: fora os desligados, os ocultos e os que o
 *  aprimoramento de seleção/data tirou da vista (`aria-hidden`). */
export function focaveis(raiz: ParentNode): HTMLElement[] {
  return [...raiz.querySelectorAll<HTMLElement>(SELETOR_FOCAVEL)].filter((elemento) => {
    if (elemento.hasAttribute('disabled') || elemento.getAttribute('aria-hidden') === 'true')
      return false;
    return !elemento.closest('[hidden]');
  });
}

/** Prende o foco dentro do elemento: Tab e Shift+Tab circulam, nunca saem. */
export function prenderFoco(raiz: HTMLElement): () => void {
  const aoTeclar = (evento: KeyboardEvent) => {
    if (evento.key !== 'Tab') return;
    const alvos = focaveis(raiz);
    if (alvos.length === 0) return;
    const atual = alvos.indexOf(document.activeElement as HTMLElement);
    const passo = evento.shiftKey ? -1 : 1;
    const destino = (atual + passo + alvos.length) % alvos.length;
    evento.preventDefault();
    alvos[atual === -1 ? 0 : destino]?.focus();
  };
  raiz.addEventListener('keydown', aoTeclar);
  return () => raiz.removeEventListener('keydown', aoTeclar);
}
