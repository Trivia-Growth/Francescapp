import type { operarSegredosIntegracoesNativo } from './segredos-integracoes-nativo.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';
import { causaDaFalha, registrarFalhaOperacional } from './falha-operacional.ts';

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
    // O código do PostgREST/PostgreSQL é o que diagnostica: `22023` é entrada fora do
    // contrato, `42501` é recusa de autorização ou atestado. Sem ele, a camada de cima só
    // conseguia registrar `excecao_Error`, que não diz nada — foi o que aconteceu em
    // 24/11/2026 ao cadastrar a credencial da OpenRouter. Mensagem, `details` e `hint` NÃO
    // entram: carregam nome de tabela, de coluna e às vezes o valor que falhou.
    if (resultado.error) {
      registrarFalhaOperacional({
        rota: 'segredos-integracoes',
        etapa: 'operacao',
        request_id: crypto.randomUUID(),
        causa: causaDaFalha(resultado.error),
      });
      throw new Error();
    }
    return resultado.data;
  } catch {
    throw new Error('Não foi possível executar a configuração do sistema.');
  }
}
