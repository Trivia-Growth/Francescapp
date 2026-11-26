import type { operarRealizacaoCompromissoNativo } from './realizacao-compromisso-nativo.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';

type Transporte = Parameters<
  Parameters<typeof operarRealizacaoCompromissoNativo>[2]['executar']
>[1];

/** Usa o cliente autenticado da mesma requisição; a autorização real está na RPC. */
export async function executarRealizacaoCompromissoNativo(
  cliente: ReturnType<typeof criarContextoAuthNativo>['cliente'],
  transporte: Transporte,
): Promise<unknown> {
  try {
    const resultado = await cliente.schema('api').rpc('realizacao_compromisso_privado', transporte);
    if (resultado.error) throw new Error();
    return resultado.data;
  } catch {
    throw new Error('Não foi possível executar o registro de realização do compromisso.');
  }
}
