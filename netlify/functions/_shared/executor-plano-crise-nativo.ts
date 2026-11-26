import type { operarPlanoCriseNativo } from './plano-crise-nativo.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';

type TransportePlanoCrise = Parameters<Parameters<typeof operarPlanoCriseNativo>[2]['executar']>[1];

/** Usa o cliente autenticado da mesma requisição; a autorização real está na RPC. */
export async function executarPlanoCriseNativo(
  cliente: ReturnType<typeof criarContextoAuthNativo>['cliente'],
  transporte: TransportePlanoCrise,
): Promise<unknown> {
  try {
    const resultado = await cliente.schema('api').rpc('plano_crise_operacao_privada', transporte);
    if (resultado.error) throw new Error();
    return resultado.data;
  } catch {
    throw new Error('Não foi possível executar a operação do plano de crise.');
  }
}
