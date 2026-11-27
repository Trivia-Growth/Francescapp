export const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

export type Partes = { ano: number; mes: number; dia: number };

export function doIso(iso: string): Partes | null {
  const partida = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!partida) return null;
  const ano = Number(partida[1]);
  const mes = Number(partida[2]);
  const dia = Number(partida[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > diasNoMes(ano, mes)) return null;
  return { ano, mes, dia };
}

export function paraIso({ ano, mes, dia }: Partes): string {
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

export function primeiroDiaDaSemana(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay();
}

/** dd/mm/aaaa a partir do ISO; string vazia quando não há data válida. */
export function paraVisivel(iso: string): string {
  const partes = doIso(iso);
  return partes
    ? `${String(partes.dia).padStart(2, '0')}/${String(partes.mes).padStart(2, '0')}/${partes.ano}`
    : '';
}

/** ISO a partir de dd/mm/aaaa; `null` quando o que foi digitado não é uma data real. */
export function doVisivel(visivel: string): string | null {
  const partida = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(visivel.trim());
  if (!partida) return null;
  const partes = { dia: Number(partida[1]), mes: Number(partida[2]), ano: Number(partida[3]) };
  if (partes.mes < 1 || partes.mes > 12) return null;
  if (partes.dia < 1 || partes.dia > diasNoMes(partes.ano, partes.mes)) return null;
  return paraIso(partes);
}

/** Vai pondo as barras enquanto se digita, sem recusar o que ainda está incompleto. */
export function mascarar(bruto: string): string {
  const numeros = bruto.replace(/\D/g, '').slice(0, 8);
  const dia = numeros.slice(0, 2);
  const mes = numeros.slice(2, 4);
  const ano = numeros.slice(4, 8);
  return [dia, mes, ano].filter((parte) => parte !== '').join('/');
}
