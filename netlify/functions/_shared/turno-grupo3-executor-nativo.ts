import type { operarTurnoGrupo3 } from './turno-grupo3-nativo.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';

type Transporte = Parameters<Parameters<typeof operarTurnoGrupo3>[2]['executar']>[1];
/** Cliente autenticado; somente RPC agregada executa as filhas na mesma transação. */
export async function executarTurnoGrupo3(
  cliente: ReturnType<typeof criarContextoAuthNativo>['cliente'],
  transporte: Transporte,
): Promise<unknown> {
  const resultado = await cliente.schema('api').rpc('turno_grupo3_privado', transporte);
  if (resultado.error) throw new Error('Não foi possível executar a operação.');
  return resultado.data;
}
