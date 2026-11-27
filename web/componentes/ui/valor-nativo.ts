export const EVENTO_VALOR_NATIVO = 'ffcm:valor-nativo-definido';

/** Atualiza um campo não controlado e o widget que o exibe, sem simular edição pelo usuário. */
export function definirValorNativo(
  controle: Element | RadioNodeList | null | undefined,
  valor: string,
): void {
  if (
    controle instanceof HTMLInputElement ||
    controle instanceof HTMLSelectElement ||
    controle instanceof HTMLTextAreaElement
  ) {
    controle.value = valor;
    controle.dispatchEvent(new Event(EVENTO_VALOR_NATIVO));
  }
}
