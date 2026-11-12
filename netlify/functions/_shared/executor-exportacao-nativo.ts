import type { operarExportacaoNativa } from './exportacao-nativa.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';

type TransporteExportacao = Parameters<Parameters<typeof operarExportacaoNativa>[2]['executar']>[1];

/** Usa o cliente autenticado da mesma requisição; a autorização real está na RPC. */
export async function executarExportacaoNativa(
  cliente: ReturnType<typeof criarContextoAuthNativo>['cliente'],
  transporte: TransporteExportacao,
): Promise<unknown> {
  try {
    const resultado = await cliente.schema('api').rpc('exportacao_operacao_privada', transporte);
    if (resultado.error) throw new Error();
    return resultado.data;
  } catch {
    throw new Error('Não foi possível executar a operação de pendências.');
  }
}
