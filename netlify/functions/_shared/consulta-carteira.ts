import { contratosRotas } from '../../../packages/contracts/src/index.ts';

/** FR-026: leitura dos filtros da carteira a partir da query, em um lugar só.
 *
 * A preparação do atestado e o handler HTTP liam os parâmetros separadamente, cada um com
 * a sua cópia da regra. Com filtro isso deixaria de ser duplicação inofensiva: bastaria uma
 * divergência para a página devolvida não ser a que foi assinada.
 *
 * Nenhum parâmetro repetido é aceito e nenhum nome fora da lista passa — filtro
 * desconhecido é entrada inválida, nunca filtro silenciosamente ignorado. */
const FILTROS = {
  filtro_responsavel: 'responsavel',
  filtro_situacao: 'situacao',
  filtro_revisao: 'revisao',
  filtro_pendencia: 'pendencia',
} as const;

export type ConsultaCarteira = ReturnType<typeof lerConsultaCarteira>;

export function lerConsultaCarteira(url: URL): {
  limite: number;
  cursor?: string;
  filtros?: Record<string, string>;
} | null {
  const bruto: Record<string, unknown> = {};
  const filtros: Record<string, string> = {};
  const vistos = new Set<string>();
  for (const [chave, valor] of url.searchParams) {
    if (vistos.has(chave)) return null;
    vistos.add(chave);
    if (chave === 'cursor') bruto.cursor = valor;
    else if (chave === 'limite') bruto.limite = /^\d{1,3}$/.test(valor) ? Number(valor) : valor;
    else if (chave in FILTROS) filtros[FILTROS[chave as keyof typeof FILTROS]] = valor;
    else return null;
  }
  if (Object.keys(filtros).length > 0) bruto.filtros = filtros;
  const validada = contratosRotas.listarPacientes.entrada.safeParse(bruto);
  if (!validada.success) return null;
  return validada.data;
}
