import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';

type ClienteNativo = ReturnType<typeof criarContextoAuthNativo>['cliente'];

/** Usa o cliente autenticado da mesma requisição; a autorização real está na RPC. */
export async function executarListagemConcessoesEquipe(
  cliente: ClienteNativo,
  transporte: unknown,
): Promise<unknown> {
  const resposta = await cliente
    .schema('api')
    .rpc('listar_concessoes_equipe_privado', { p_transporte: transporte });
  if (resposta.error) throw new Error();
  return resposta.data;
}

/** Usa o cliente autenticado da mesma requisição; a autorização real está na RPC. */
export async function executarCriacaoConcessaoEquipe(
  cliente: ClienteNativo,
  transporte: unknown,
): Promise<unknown> {
  const resposta = await cliente
    .schema('api')
    .rpc('criar_concessao_equipe_privado', { p_transporte: transporte });
  if (resposta.error) throw new Error();
  return resposta.data;
}
