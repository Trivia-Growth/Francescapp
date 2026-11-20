import type { operarSegredosIntegracoesNativo } from './segredos-integracoes-nativo.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';

type Transporte = Parameters<Parameters<typeof operarSegredosIntegracoesNativo>[2]['executar']>[1];

/** Usa cliente autenticado da requisição; SQL exige sessão, Administrador e atestado. */
export async function executarSegredosIntegracoesNativo(
  cliente: ReturnType<typeof criarContextoAuthNativo>['cliente'],
  transporte: Transporte,
): Promise<unknown> {
  try {
    const resultado = await cliente
      .schema('api')
      .rpc(
        transporte.p_transporte.entrada.atestado &&
          (transporte.p_transporte.entrada.atestado as { operacao?: string }).operacao ===
            'api.consultar_expurgo_audio'
          ? 'consultar_expurgo_audio'
          : 'segredos_integracoes_privado',
        transporte,
      );
    if (resultado.error) throw new Error();
    return resultado.data;
  } catch {
    throw new Error('Não foi possível executar a configuração do sistema.');
  }
}
