import type { operarOrientacaoNativa } from './orientacao-nativa.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';

type TransporteOrientacao = Parameters<Parameters<typeof operarOrientacaoNativa>[2]['executar']>[1];

/** Usa o cliente autenticado da mesma requisição; autorização e auditoria ficam no banco. */
export async function executarOrientacaoNativa(
  cliente: ReturnType<typeof criarContextoAuthNativo>['cliente'],
  transporte: TransporteOrientacao,
): Promise<unknown> {
  try {
    const resultado = await cliente.schema('api').rpc('orientacao_privada', transporte);
    if (resultado.error) throw new Error();
    return resultado.data;
  } catch {
    throw new Error('Não foi possível executar a orientação.');
  }
}
