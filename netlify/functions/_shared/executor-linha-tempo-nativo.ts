import type { operarLinhaTempoNativa } from './linha-tempo-nativa.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';

type TransporteLinhaTempo = Parameters<Parameters<typeof operarLinhaTempoNativa>[2]['executar']>[1];

/** Usa o cliente autenticado da mesma requisição; a autorização real está na RPC. */
export async function executarLinhaTempoNativa(
  cliente: ReturnType<typeof criarContextoAuthNativo>['cliente'],
  transporte: TransporteLinhaTempo,
): Promise<unknown> {
  try {
    const resultado = await cliente.schema('api').rpc('linha_tempo_operacao_privada', transporte);
    if (resultado.error) throw new Error();
    return resultado.data;
  } catch {
    throw new Error('Não foi possível executar a operação de pendências.');
  }
}
