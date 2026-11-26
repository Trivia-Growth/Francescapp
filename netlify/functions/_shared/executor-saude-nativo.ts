import type { operarSaudeNativa } from './saude-nativa.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';

type TransporteSaude = Parameters<Parameters<typeof operarSaudeNativa>[2]['executar']>[1];

/** Usa o cliente autenticado da mesma requisição; a autorização real está na RPC. */
export async function executarSaudeNativa(
  cliente: ReturnType<typeof criarContextoAuthNativo>['cliente'],
  transporte: TransporteSaude,
): Promise<unknown> {
  try {
    const resultado = await cliente.schema('api').rpc('saude_operacao_privada', transporte);
    if (resultado.error) throw new Error();
    return resultado.data;
  } catch {
    throw new Error('Não foi possível executar a operação de saúde.');
  }
}
