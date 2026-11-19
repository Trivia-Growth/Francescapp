import type { operarAvisoNativo } from './aviso-nativo.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';

type TransporteAviso = Parameters<Parameters<typeof operarAvisoNativo>[2]['executar']>[1];

/** Usa o cliente autenticado da mesma requisição; a autorização real está na RPC. */
export async function executarAvisoNativo(
  cliente: ReturnType<typeof criarContextoAuthNativo>['cliente'],
  transporte: TransporteAviso,
): Promise<unknown> {
  try {
    const resultado = await cliente.schema('api').rpc('avisos_privado', transporte);
    if (resultado.error) throw new Error();
    return resultado.data;
  } catch {
    throw new Error('Não foi possível executar a operação de avisos.');
  }
}
