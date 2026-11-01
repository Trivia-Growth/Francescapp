import type { FonteDeConfiguracao } from '../../../../supabase/functions/_shared/configuracao.ts';
import { criarErroPublicoSemCampos } from '../../../../packages/contracts/src/erros.ts';
import { criarContextoAuthNativo } from './cliente.ts';

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
  try {
    const contexto = criarContextoAuthNativo(request, fonte);
    if (request.headers.get('origin') !== contexto.origem) return erro('sem_permissao', 403);
    const { data, error } = await contexto.cliente.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${contexto.origem}/api/auth/callback`,
        skipBrowserRedirect: true,
      },
    });
    if (error || !data.url) return erro('servico_indisponivel', 503);
    return contexto.responder(new Response(null, { status: 303, headers: { Location: data.url } }));
  } catch {
    return erro('servico_indisponivel', 503);
  }
}
