import type { operarTurnoNativo } from './turno-nativo.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';

type Transporte = Parameters<Parameters<typeof operarTurnoNativo>[2]['executar']>[1];
/** Cliente autenticado da mesma requisição; banco revalida atestado, vínculo e autoria. */
export async function executarTurnoNativo(
  cliente: ReturnType<typeof criarContextoAuthNativo>['cliente'],
  transporte: Transporte,
): Promise<unknown> {
  const resultado = await cliente.schema('api').rpc('turno_privado', transporte);
  if (resultado.error) throw new Error('Não foi possível executar o turno.');
  return resultado.data;
}
