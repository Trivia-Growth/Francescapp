/** Dados fictícios para conferência visual das telas. NÃO é código de produção e nunca é
 * importado por `web/main.ts`: serve ao roteiro de interceptação de `**\/api\/**` usado na
 * conferência em navegador e às provas que precisam de uma tela com conteúdo de verdade.
 *
 * Regra inegociável: nada aqui pode ser dado real. Nomes são inventados, textos clínicos
 * são genéricos e nenhum valor de integração é credencial — a tela de integrações só
 * recebe metadados (`cadastrado`, `versao`, data), nunca o segredo em si. */

/** Identificador estável e legível: `grupo` separa as famílias de dados e `n` a linha. */
export function id(grupo: number, n: number): string {
  const g = String(grupo).padStart(8, '0');
  const s = String(n).padStart(12, '0');
  return `${g}-0000-4000-8000-${s}`;
}

export const USUARIO_ID = id(10, 1);
export const SESSAO_ID = id(20, 1);

/** Envelope de sucesso do servidor (`sucessoRespostaSchema`). */
export function envelope(dados: unknown): { dados: unknown; request_id: string } {
  return { dados, request_id: id(99, 1) };
}

/** Instante com deslocamento explícito, como exigem os contratos. */
export function instante(dia: number, hora = 12, minuto = 0): string {
  const d = String(dia).padStart(2, '0');
  const h = String(hora).padStart(2, '0');
  const m = String(minuto).padStart(2, '0');
  return `2026-11-${d}T${h}:${m}:00.000Z`;
}
