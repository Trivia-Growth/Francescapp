const formatadorData = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

/** Data (dd/mm/aaaa, fuso de São Paulo) de um instante ISO; nulo se ausente ou inválido. */
export function dataDeInstante(iso: string | undefined): string | null {
  if (!iso) return null;
  const instante = new Date(iso);
  return Number.isNaN(instante.getTime()) ? null : formatadorData.format(instante);
}
