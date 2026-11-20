import type { operarSubstituicaoCmNativa } from './substituicao-cm-nativa.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';

type TransporteSubstituicao = Parameters<
  Parameters<typeof operarSubstituicaoCmNativa>[2]['executar']
>[1];

/** Usa o cliente autenticado da mesma requisição; a autorização real está na RPC. */
export async function executarSubstituicaoCmNativa(
  cliente: ReturnType<typeof criarContextoAuthNativo>['cliente'],
  transporte: TransporteSubstituicao,
): Promise<unknown> {
  try {
    const resultado = await cliente
      .schema('api')
      .rpc('substituicao_case_manager_privado', transporte);
    if (resultado.error) throw new Error();
    return resultado.data;
  } catch {
    throw new Error('Não foi possível executar a operação de substituição.');
  }
}
