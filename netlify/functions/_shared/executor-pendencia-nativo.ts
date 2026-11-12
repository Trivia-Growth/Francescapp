import type { operarPendenciaNativa } from './pendencia-nativa.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';

type TransportePendencia = Parameters<Parameters<typeof operarPendenciaNativa>[2]['executar']>[1];

/** Usa o cliente autenticado da mesma requisição; a autorização real está na RPC. */
export async function executarPendenciaNativa(
  cliente: ReturnType<typeof criarContextoAuthNativo>['cliente'],
  transporte: TransportePendencia,
): Promise<unknown> {
  try {
    const resultado = await cliente.schema('api').rpc('pendencia_operacao_privada', transporte);
    if (resultado.error) throw new Error();
    return resultado.data;
  } catch {
    throw new Error('Não foi possível executar a operação de pendências.');
  }
}
