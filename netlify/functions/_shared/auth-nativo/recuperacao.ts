import { solicitarRecuperacaoSchema } from '../../../../packages/contracts/src/identidade.ts';
import { criarErroPublicoSemCampos } from '../../../../packages/contracts/src/erros.ts';
import type { FonteDeConfiguracao } from '../../../../supabase/functions/_shared/configuracao.ts';
import { criarContextoAuthNativo, fluxoValido } from './cliente.ts';

/** Preparação sem rota: requer callback PKCE e definição de senha antes de ativar. */
export async function solicitarRecuperacaoNativa(request: Request, fonte: FonteDeConfiguracao) {
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
  const erro = (
    codigo: 'entrada_invalida' | 'sem_permissao' | 'servico_indisponivel',
    status: number,
  ) => Response.json(criarErroPublicoSemCampos(codigo, crypto.randomUUID()), { status, headers });
  const url = new URL(request.url);
  const fluxo = request.headers.get('x-fluxo');
  if (
    request.method !== 'POST' ||
    url.pathname !== '/api/auth/recuperacao' ||
    url.search ||
    url.hash ||
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
      'application/json' ||
    !fluxoValido(fluxo)
  )
    return erro('entrada_invalida', 422);
  if (request.headers.get('origin') !== url.origin) return erro('sem_permissao', 403);
  const leitor = request.body?.getReader();
  if (!leitor) return erro('entrada_invalida', 422);
  let entrada: unknown;
  try {
    const partes: Uint8Array[] = [];
    let tamanho = 0;
    while (true) {
      const parte = await leitor.read();
      if (parte.done) break;
      tamanho += parte.value.byteLength;
      if (tamanho > 1024) throw new Error();
      partes.push(parte.value);
    }
    const bytes = new Uint8Array(tamanho);
    let posicao = 0;
    for (const parte of partes) {
      bytes.set(parte, posicao);
      posicao += parte.length;
    }
    entrada = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    void leitor.cancel().catch(() => undefined);
    return erro('entrada_invalida', 422);
  } finally {
    leitor.releaseLock();
  }
  const dados = solicitarRecuperacaoSchema.safeParse(entrada);
  if (!dados.success) return erro('entrada_invalida', 422);
  try {
    const contexto = criarContextoAuthNativo(request, fonte);
    if (request.headers.get('origin') !== contexto.origem) return erro('sem_permissao', 403);
    const resultado = await contexto.cliente.auth.resetPasswordForEmail(dados.data.email, {
      redirectTo: `${contexto.origem}/api/auth/recuperacao/callback?fluxo=${fluxo}`,
    });
    if (resultado.error) return erro('servico_indisponivel', 503);
    // A mesma resposta cobre endereços existentes e inexistentes; não cria vínculo.
    return contexto.responder(new Response(null, { status: 204, headers }));
  } catch {
    return erro('servico_indisponivel', 503);
  }
}
