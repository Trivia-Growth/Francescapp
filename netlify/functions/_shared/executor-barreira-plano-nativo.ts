import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';
import type { prepararBarreiraPlanoNativa } from './barreira-plano-nativa.ts';

/** Sem grant para aplicação; uso restrito a testes locais até ativação aprovada. */
export async function executarBarreiraPlanoNativa(
  cliente: ReturnType<typeof criarContextoAuthNativo>['cliente'],
  transporte: Awaited<ReturnType<typeof prepararBarreiraPlanoNativa>>,
): Promise<unknown> {
  try {
    const resultado = await cliente.schema('api').rpc('plano_composicao_privada', transporte);
    if (resultado.error) throw new Error();
    return resultado.data;
  } catch {
    throw new Error('Não foi possível executar a barreira.');
  }
}
