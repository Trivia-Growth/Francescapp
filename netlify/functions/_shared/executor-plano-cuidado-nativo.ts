import type { operarPlanoCuidadoNativo } from './plano-cuidado-nativo.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';

type TransportePlano = Parameters<Parameters<typeof operarPlanoCuidadoNativo>[2]['executar']>[1];

/** Usa o cliente autenticado da mesma requisição. A RPC local ainda não tem
 * privilégio de execução concedido; não expor rota antes das provas de acesso. */
export async function executarPlanoCuidadoNativo(
  cliente: ReturnType<typeof criarContextoAuthNativo>['cliente'],
  transporte: TransportePlano,
): Promise<unknown> {
  try {
    const resultado = await cliente.schema('api').rpc('plano_cuidado_privado', transporte);
    if (resultado.error) throw new Error();
    return resultado.data;
  } catch {
    throw new Error('Não foi possível executar o plano de cuidado.');
  }
}
