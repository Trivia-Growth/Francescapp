import type { operarEncaminhamentoNativo } from './encaminhamento-nativo.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';

type TransporteEncaminhamento = Parameters<
  Parameters<typeof operarEncaminhamentoNativo>[2]['executar']
>[1];

/** Usa o cliente autenticado da mesma requisição; autorização e auditoria ficam no banco. */
export async function executarEncaminhamentoNativo(
  cliente: ReturnType<typeof criarContextoAuthNativo>['cliente'],
  transporte: TransporteEncaminhamento,
): Promise<unknown> {
  try {
    const resultado = await cliente.schema('api').rpc('encaminhamento_privado', transporte);
    if (resultado.error) throw new Error();
    return resultado.data;
  } catch {
    throw new Error('Não foi possível executar o encaminhamento.');
  }
}
