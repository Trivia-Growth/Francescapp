import { causaDaFalha, registrarFalhaOperacional } from './falha-operacional.ts';

type Operacao = 'criarAcessoPaciente' | 'revogarAcessoPaciente';

export async function executarRpcAcessoPaciente<T>(
  cliente: {
    rpc(
      nome: string,
      parametros: { p_transporte: T },
    ): PromiseLike<{ data: unknown; error: unknown }>;
  },
  rota: Operacao,
  transporte: T,
) {
  const nome =
    rota === 'criarAcessoPaciente'
      ? 'conceder_acesso_paciente_privado'
      : 'revogar_acesso_paciente_privado';
  const resposta = await cliente.rpc(nome, { p_transporte: transporte });
  // O código do PostgREST/PostgreSQL é o que diagnostica: `22023` é entrada fora do contrato,
  // `42501` é recusa de autorização ou atestado. Sem ele a camada de cima só consegue dizer
  // `pendencia_externa`, que não distingue uma coisa da outra — foi o que travou a concessão
  // de acesso ao caso em 24/11/2026. Mensagem, `details` e `hint` NÃO entram: carregam nome
  // de tabela, de coluna e às vezes o valor que falhou.
  if (resposta.error) {
    registrarFalhaOperacional({
      rota: 'acesso-paciente',
      etapa: 'operacao',
      request_id: crypto.randomUUID(),
      causa: causaDaFalha(resposta.error),
    });
    throw new Error('Operação indisponível.');
  }
  return resposta.data;
}
