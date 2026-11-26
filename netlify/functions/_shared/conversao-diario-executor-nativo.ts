import type { operarConversaoDiarioNativa } from './conversao-diario-nativa.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';
type Transporte = Parameters<Parameters<typeof operarConversaoDiarioNativa>[2]['executar']>[1];
/** Uma única RPC agregada; nunca chama gravações filhas isoladamente. */
export async function executarConversaoDiarioNativa(
  cliente: ReturnType<typeof criarContextoAuthNativo>['cliente'],
  transporte: Transporte,
): Promise<unknown> {
  const resposta = await cliente.schema('api').rpc('conversao_diario_tarefa_privada', transporte);
  if (resposta.error) throw new Error('Conversão não confirmada.');
  return resposta.data;
}
