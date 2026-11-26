import type { operarCampoExtraPlanoNativo } from './campo-extra-plano-nativo.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';

type Transporte = Parameters<Parameters<typeof operarCampoExtraPlanoNativo>[2]['executar']>[1];

/** Usa o cliente autenticado da mesma requisição. A RPC ainda não tem privilégio de
 * execução concedido em produção; não expor rota antes das provas de acesso. */
export async function executarCampoExtraPlanoNativo(
  cliente: ReturnType<typeof criarContextoAuthNativo>['cliente'],
  transporte: Transporte,
): Promise<unknown> {
  try {
    const resultado = await cliente.schema('api').rpc('campo_extra_plano_privado', transporte);
    if (resultado.error) throw new Error();
    return resultado.data;
  } catch {
    throw new Error('Não foi possível executar o catálogo de campos extras.');
  }
}
