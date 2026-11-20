import type { operarPapelDeclaradoNativo } from './papel-declarado-nativo.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';

type Transporte = Parameters<Parameters<typeof operarPapelDeclaradoNativo>[2]['executar']>[1];

/** Usa o cliente autenticado da mesma requisição. A RPC ainda não tem privilégio de
 * execução concedido em produção; não expor rota antes das provas de acesso. */
export async function executarPapelDeclaradoNativo(
  cliente: ReturnType<typeof criarContextoAuthNativo>['cliente'],
  transporte: Transporte,
): Promise<unknown> {
  try {
    const resultado = await cliente.schema('api').rpc('papel_declarado_privado', transporte);
    if (resultado.error) throw new Error();
    return resultado.data;
  } catch {
    throw new Error('Não foi possível executar o catálogo de papéis declarados.');
  }
}
