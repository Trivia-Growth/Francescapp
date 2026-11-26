import type { operarDocumentoCasoNativo } from './documento-caso-nativo.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';

type TransporteDocumento = Parameters<
  Parameters<typeof operarDocumentoCasoNativo>[2]['executar']
>[1];

/** Usa o cliente autenticado da mesma requisição; a autorização real está na RPC. */
export async function executarDocumentoCasoNativo(
  cliente: ReturnType<typeof criarContextoAuthNativo>['cliente'],
  transporte: TransporteDocumento,
): Promise<unknown> {
  try {
    const resultado = await cliente.schema('api').rpc('documento_operacao_privada', transporte);
    if (resultado.error) throw new Error();
    return resultado.data;
  } catch {
    throw new Error('Não foi possível executar a operação de documentos.');
  }
}
