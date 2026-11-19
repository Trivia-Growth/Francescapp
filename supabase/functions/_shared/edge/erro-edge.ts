import {
  criarErroPublicoSemCampos,
  statusErroHttp,
  type CodigoErro,
} from '../../../../packages/contracts/src/erros.ts';

/** Tradução de erro na borda das Edge Functions.
 *
 * Não existe código novo: o catálogo fechado continua sendo `codigosErro` de
 * `packages/contracts/src/erros.ts`, incluindo `sem_permissao`, `conflito` e
 * `conflito_idempotencia`. O envelope público continua sendo o de
 * `criarErroPublicoSemCampos` — `{ erro: { codigo, mensagem }, request_id }`, sem campos,
 * sem causa, sem nome de variável, sem stack.
 *
 * Este módulo existe só para que a borda nova não reescreva o par status/cabeçalho em 39
 * lugares. Qualquer divergência aqui é defeito de migração, não requisito novo. */

/** Mesmo trio das rotas Netlify atuais (ex.: `cabecalhosAcessoPaciente`). Não confundir com
 * os cabeçalhos de `/api/*` do `netlify.toml`, que o proxy continua aplicando. */
export const cabecalhosErroEdge: Readonly<Record<string, string>> = Object.freeze({
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
});

export function respostaDeErroEdge(
  codigo: CodigoErro,
  requestId: string = crypto.randomUUID(),
): Response {
  return Response.json(criarErroPublicoSemCampos(codigo, requestId), {
    status: statusErroHttp[codigo],
    headers: cabecalhosErroEdge,
  });
}
