import type { operarTranscricaoNativa } from './transcricao-nativa.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';

type TransporteTranscricao = Parameters<
  Parameters<typeof operarTranscricaoNativa>[2]['executar']
>[1];

/** Usa o cliente autenticado da mesma requisição; a autorização real está na RPC. */
export async function executarTranscricaoNativa(
  cliente: ReturnType<typeof criarContextoAuthNativo>['cliente'],
  transporte: TransporteTranscricao,
): Promise<unknown> {
  try {
    const resultado = await cliente.schema('api').rpc('transcricao_operacao_privada', transporte);
    if (resultado.error) throw new Error();
    return resultado.data;
  } catch {
    throw new Error('Não foi possível executar a operação de transcrição.');
  }
}
