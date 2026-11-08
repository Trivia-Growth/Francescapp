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
  if (resposta.error) throw new Error('Operação indisponível.');
  return resposta.data;
}
