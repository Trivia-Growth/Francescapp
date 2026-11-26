/** Instante persistido lido por uma pessoa, no papel.
 *
 * `2026-11-19T12:00:00Z` sai como `19/11/2026, 12:00 UTC`. Sem `toLocaleString`: o documento
 * não pode depender do fuso nem do idioma do servidor que o emitiu, e o mesmo corte precisa
 * produzir sempre os mesmos bytes. O fuso fica escrito para que ninguém leia a hora como
 * local por engano.
 *
 * Valor que não é instante válido volta como veio: o documento não inventa data. */
export function instanteLegivel(valor: string): string {
  const data = new Date(valor);
  if (!Number.isFinite(data.getTime())) return valor;
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${dois(data.getUTCDate())}/${dois(data.getUTCMonth() + 1)}/${data.getUTCFullYear()}, ${dois(data.getUTCHours())}:${dois(data.getUTCMinutes())} UTC`;
}
