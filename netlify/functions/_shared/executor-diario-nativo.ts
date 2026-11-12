import type { operarDiarioNativo } from './diario-nativo.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';

type TransporteDiario = Parameters<Parameters<typeof operarDiarioNativo>[2]['executar']>[1];

/** Usa o cliente autenticado da mesma requisição; autorização, audiência e auditoria ficam
 * no banco. */
export async function executarDiarioNativo(
  cliente: ReturnType<typeof criarContextoAuthNativo>['cliente'],
  transporte: TransporteDiario,
): Promise<unknown> {
  try {
    const resultado = await cliente.schema('api').rpc('diario_privado', transporte);
    if (resultado.error) throw new Error();
    return resultado.data;
  } catch {
    throw new Error('Não foi possível executar a operação do diário.');
  }
}
