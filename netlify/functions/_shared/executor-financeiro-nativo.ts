import { wrapperFinanceiro } from '../../../packages/contracts/src/rpc.ts';
import type { PortasFinanceiras } from './financeiro-nativo.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';

type Wrapper = (typeof wrapperFinanceiro)[keyof typeof wrapperFinanceiro];
type Transporte = Parameters<PortasFinanceiras['executar']>[1];

/** Falha fechado: só estes quatro wrappers existem, e um nome fora da lista não vira chamada.
 * O conjunto é derivado de `wrapperFinanceiro`, de modo que uma ação nova sem wrapper
 * declarado não passa a ser despachada por engano. */
const WRAPPERS = new Set<string>(Object.values(wrapperFinanceiro));

/** Usa o cliente autenticado da mesma requisição; a autorização real está na RPC, que confere
 * atestado, sessão viva e concessão financeira dentro da transação. */
export async function executarFinanceiroNativo(
  cliente: ReturnType<typeof criarContextoAuthNativo>['cliente'],
  wrapper: Wrapper,
  transporte: Transporte,
): Promise<unknown> {
  if (!WRAPPERS.has(wrapper)) throw new Error('Operação financeira desconhecida.');
  try {
    const resultado = await cliente.schema('api').rpc(wrapper, transporte);
    if (resultado.error) throw new Error();
    return resultado.data;
  } catch {
    throw new Error('Não foi possível executar a operação financeira.');
  }
}
