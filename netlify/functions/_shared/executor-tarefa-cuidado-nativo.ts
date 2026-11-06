import type { operarTarefaCuidadoNativo } from './tarefa-cuidado-nativo.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';

type TransporteTarefa = Parameters<Parameters<typeof operarTarefaCuidadoNativo>[2]['executar']>[1];

/** Usa o cliente autenticado da mesma requisição. A RPC local ainda não tem
 * privilégio de execução concedido; não expor rota antes das provas de acesso. */
export async function executarTarefaCuidadoNativo(
  cliente: ReturnType<typeof criarContextoAuthNativo>['cliente'],
  transporte: TransporteTarefa,
): Promise<unknown> {
  try {
    const resultado = await cliente.schema('api').rpc('tarefa_cuidado_privado', transporte);
    if (resultado.error) throw new Error();
    return resultado.data;
  } catch {
    throw new Error('Não foi possível executar o tarefas de cuidado.');
  }
}
