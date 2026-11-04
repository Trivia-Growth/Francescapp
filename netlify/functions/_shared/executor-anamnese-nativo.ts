import type { operarAnamneseNativa } from './anamnese-nativa.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';

type TransporteAnamnese = Parameters<Parameters<typeof operarAnamneseNativa>[2]['executar']>[1];

/** Usa o cliente autenticado da mesma requisição. A RPC local ainda não tem
 * privilégio de execução concedido; não expor rota antes das provas de acesso. */
export async function executarAnamneseNativa(
  cliente: ReturnType<typeof criarContextoAuthNativo>['cliente'],
  transporte: TransporteAnamnese,
): Promise<unknown> {
  try {
    const resultado = await cliente.schema('api').rpc('anamnese_privada', transporte);
    if (resultado.error) throw new Error();
    return resultado.data;
  } catch {
    throw new Error('Não foi possível executar a anamnese.');
  }
}
