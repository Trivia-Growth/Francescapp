import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';
import type { prepararCarteiraNativa } from './carteira-nativa.ts';

/**
 * Contrato futuro: api.listar_pacientes(p_entrada jsonb), com identidade do
 * JWT autenticado, autorização e auditoria transacionais e resposta conforme
 * processarCarteiraExperimental. A RPC ainda não existe nem possui grant.
 * Não conectar antes de resolver S-02 e concorrência Auth, comprovar RLS e
 * revogação e revisar o contrato e os privilégios do wrapper no banco.
 * O cliente deve ser o mesmo contexto autenticado da requisição; nunca service_role.
 */
export async function executarCarteiraNativa(
  cliente: ReturnType<typeof criarContextoAuthNativo>['cliente'],
  entrada: Awaited<ReturnType<typeof prepararCarteiraNativa>>,
): Promise<unknown> {
  try {
    const resultado = await cliente.schema('api').rpc('listar_pacientes', entrada);
    if (resultado.error) throw new Error();
    return resultado.data;
  } catch {
    throw new Error('Não foi possível consultar a carteira.');
  }
}
