import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';
import type { prepararBarreiraNativa } from './barreira-nativa.ts';

/**
 * Contrato futuro: api.cadastro_composicao(p_transporte jsonb) deve delegar a
 * operacao.cadastro_composicao_privada e preservar identidade JWT, autorização,
 * assinatura e auditoria transacionais. Esse wrapper ainda não existe nem tem
 * grant. Não conectar antes de resolver S-02 e concorrência Auth, comprovar RLS
 * e revogação e revisar contrato e privilégios no banco. Usar o cliente do mesmo
 * contexto autenticado da requisição, nunca service_role.
 */
export async function executarBarreiraNativa(
  cliente: ReturnType<typeof criarContextoAuthNativo>['cliente'],
  transporte: Awaited<ReturnType<typeof prepararBarreiraNativa>>,
): Promise<unknown> {
  try {
    const resultado = await cliente.schema('api').rpc('cadastro_composicao', transporte);
    if (resultado.error) throw new Error();
    return resultado.data;
  } catch {
    throw new Error('Não foi possível executar a barreira.');
  }
}
