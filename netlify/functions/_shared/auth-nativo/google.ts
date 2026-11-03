import type { FonteDeConfiguracao } from '../../../../supabase/functions/_shared/configuracao.ts';
import { criarErroPublicoSemCampos } from '../../../../packages/contracts/src/erros.ts';
import { criarContextoAuthNativo, fluxoValido } from './cliente.ts';

/** Início OAuth real pelo SDK. Ainda sem entrypoint público: o callback e a
 * admissão/RLS precisam estar integrados antes de ativar a jornada. */
export async function iniciarGoogleNativo(request: Request, fonte: FonteDeConfiguracao) {
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
  if (request.method !== 'POST' || url.pathname !== '/api/auth/google' || url.search)
    return erro('entrada_invalida', 422);
  if (
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
    'application/x-www-form-urlencoded'
  )
    return erro('entrada_invalida', 422);
  let corpo = '';
  const leitor = request.body?.getReader();
  if (!leitor) return erro('entrada_invalida', 422);
  try {
    const partes: Uint8Array[] = [];
    let tamanho = 0;
    while (true) {
      const parte = await leitor.read();
      if (parte.done) break;
      tamanho += parte.value.byteLength;
      if (tamanho > 128) {
        void leitor.cancel().catch(() => {});
        return erro('entrada_invalida', 422);
      }
      partes.push(parte.value);
    }
    const bytes = new Uint8Array(tamanho);
    let posicao = 0;
    for (const parte of partes) {
      bytes.set(parte, posicao);
      posicao += parte.byteLength;
    }
    corpo = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return erro('entrada_invalida', 422);
  } finally {
    leitor.releaseLock();
  }
  const campos = new URLSearchParams(corpo);
  const fluxo = campos.get('fluxo');
  if (
    !fluxoValido(fluxo) ||
    campos.getAll('fluxo').length !== 1 ||
    Array.from(campos.keys()).some((nome) => nome !== 'fluxo')
  )
    return erro('entrada_invalida', 422);
  try {
    const contexto = criarContextoAuthNativo(request, fonte, fluxo);
    if (request.headers.get('origin') !== contexto.origem) return erro('sem_permissao', 403);
    const { data, error } = await contexto.cliente.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${contexto.origem}/api/auth/callback?fluxo=${fluxo}`,
        skipBrowserRedirect: true,
      },
    });
    if (error || !data.url) return erro('servico_indisponivel', 503);
    return contexto.responder(new Response(null, { status: 303, headers: { Location: data.url } }));
  } catch {
    return erro('servico_indisponivel', 503);
  }
}
