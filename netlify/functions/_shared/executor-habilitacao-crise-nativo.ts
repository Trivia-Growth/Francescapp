import type { operarHabilitacaoCriseNativa } from './habilitacao-crise-nativa.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';

type TransporteHabilitacao = Parameters<
  Parameters<typeof operarHabilitacaoCriseNativa>[2]['executar']
>[1];

/** Usa o cliente autenticado da mesma requisição; a autorização real está na RPC. */
export async function executarHabilitacaoCriseNativa(
  cliente: ReturnType<typeof criarContextoAuthNativo>['cliente'],
  transporte: TransporteHabilitacao,
): Promise<unknown> {
  try {
    const resultado = await cliente
      .schema('api')
      .rpc('habilitacao_plano_crise_privado', transporte);
    if (resultado.error) throw new Error();
    return resultado.data;
  } catch {
    throw new Error('Não foi possível executar a operação de habilitação.');
  }
}
