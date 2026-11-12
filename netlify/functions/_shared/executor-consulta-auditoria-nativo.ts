import type { consultarAuditoriaNativa } from './consulta-auditoria-nativa.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';

type Transporte = Parameters<Parameters<typeof consultarAuditoriaNativa>[2]['executar']>[1];

/** Usa o cliente autenticado da mesma requisição. A RPC só é alcançável depois do grant de
 * ativação (`20261119310000_grant_consulta_auditoria_teste.sql`). */
export async function executarConsultaAuditoriaNativa(
  cliente: ReturnType<typeof criarContextoAuthNativo>['cliente'],
  transporte: Transporte,
): Promise<unknown> {
  try {
    const resultado = await cliente.schema('api').rpc('consultar_auditoria', transporte);
    if (resultado.error) throw new Error();
    return resultado.data;
  } catch {
    throw new Error('Não foi possível consultar a auditoria.');
  }
}
