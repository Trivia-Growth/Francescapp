export const codigosErro = [
  'entrada_invalida',
  'nao_autenticado',
  'sem_permissao',
  'nao_encontrado',
  'conflito_versao',
  'conflito_idempotencia',
  'limite_excedido',
  'configuracao_indisponivel',
  'servico_indisponivel',
  'pendencia_externa',
] as const;

export type CodigoErro = (typeof codigosErro)[number];

export const mensagensErro: Readonly<Record<CodigoErro, string>> = Object.freeze({
  entrada_invalida: 'Dados inválidos.',
  nao_autenticado: 'Sessão inválida.',
  sem_permissao: 'Operação não permitida.',
  nao_encontrado: 'Recurso não encontrado.',
  conflito_versao: 'O recurso foi alterado. Recarregue e tente novamente.',
  conflito_idempotencia: 'A identificação da operação já foi utilizada.',
  limite_excedido: 'Limite de solicitações excedido.',
  configuracao_indisponivel: 'Configuração necessária indisponível.',
  servico_indisponivel: 'Serviço temporariamente indisponível.',
  pendencia_externa: 'A operação externa permanece pendente.',
});

export const statusErroHttp: Readonly<Record<CodigoErro, number>> = Object.freeze({
  entrada_invalida: 422,
  nao_autenticado: 401,
  sem_permissao: 403,
  nao_encontrado: 404,
  conflito_versao: 409,
  conflito_idempotencia: 409,
  limite_excedido: 429,
  configuracao_indisponivel: 503,
  servico_indisponivel: 503,
  pendencia_externa: 503,
});

export type RespostaErroPublica = Readonly<{
  erro: Readonly<{
    codigo: CodigoErro;
    mensagem: string;
  }>;
  request_id: string;
}>;

/** Cria somente o envelope público estável; validação do UUID ocorre na borda. */
export function criarErroPublicoSemCampos(
  codigo: CodigoErro,
  requestId: string,
): RespostaErroPublica {
  return Object.freeze({
    erro: Object.freeze({ codigo, mensagem: mensagensErro[codigo] }),
    request_id: requestId,
  });
}
