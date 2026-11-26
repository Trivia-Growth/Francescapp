import type { operarConfiguracaoSistemaNativo } from './configuracao-sistema-nativo.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';

type Transporte = Parameters<Parameters<typeof operarConfiguracaoSistemaNativo>[2]['executar']>[1];

/** Usa o cliente autenticado da mesma requisição. A RPC só é alcançável depois do grant de
 * ativação (`20261117430000_grant_configuracao_sistema_teste.sql`). */
export async function executarConfiguracaoSistemaNativo(
  cliente: ReturnType<typeof criarContextoAuthNativo>['cliente'],
  transporte: Transporte,
): Promise<unknown> {
  try {
    const resultado = await cliente.schema('api').rpc('configuracao_sistema_privado', transporte);
    if (resultado.error) throw new Error();
    return resultado.data;
  } catch {
    throw new Error('Não foi possível executar a configuração do sistema.');
  }
}
