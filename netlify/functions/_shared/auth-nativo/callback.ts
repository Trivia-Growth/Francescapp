import { criarErroPublicoSemCampos } from '../../../../packages/contracts/src/erros.ts';
import { sessaoNativaSchema } from '../../../../packages/contracts/src/identidade.ts';
import type { FonteDeConfiguracao } from '../../../../supabase/functions/_shared/configuracao.ts';
import { criarContextoAuthNativo } from './cliente.ts';

/** Cookies ficam retidos no contexto até a autorização no banco. Erros não
 * sobrescrevem nem encerram uma sessão anterior do navegador. */
export async function concluirGoogleNativo(request: Request, fonte: FonteDeConfiguracao) {
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
  const erro = (
    codigo: 'entrada_invalida' | 'sem_permissao' | 'servico_indisponivel',
    status: number,
  ) => Response.json(criarErroPublicoSemCampos(codigo, crypto.randomUUID()), { status, headers });
  const falha = () =>
    new Response(null, { status: 303, headers: { ...headers, Location: '/?acesso=indisponivel' } });
  const url = new URL(request.url);
  const parametrosErro = ['error', 'error_code', 'error_description'];
  if (
    request.method === 'GET' &&
    url.pathname === '/api/auth/callback' &&
    !url.hash &&
    url.searchParams.getAll('error').length === 1 &&
    /^[a-z_]{1,64}$/.test(url.searchParams.get('error') ?? '') &&
    Array.from(url.searchParams.keys()).every((nome) => parametrosErro.includes(nome)) &&
    parametrosErro.every((nome) => url.searchParams.getAll(nome).length <= 1) &&
    (url.searchParams.get('error_code')?.length ?? 0) <= 128 &&
    (url.searchParams.get('error_description')?.length ?? 0) <= 2048
  )
    return falha();
  const code = url.searchParams.get('code');
  const flowId = url.searchParams.get('sb_flow_id');
  if (
    request.method !== 'GET' ||
    url.pathname !== '/api/auth/callback' ||
    url.hash ||
    url.searchParams.getAll('code').length !== 1 ||
    !code ||
    code.length > 2048 ||
    !/^[!-~]+$/.test(code) ||
    Array.from(url.searchParams.keys()).some((nome) => nome !== 'code' && nome !== 'sb_flow_id') ||
    url.searchParams.getAll('sb_flow_id').length > 1 ||
    (flowId !== null && !/^[A-Za-z0-9_-]{8,64}$/.test(flowId))
  )
    return erro('entrada_invalida', 422);

  try {
    const contexto = criarContextoAuthNativo(request, fonte);
    const troca = await contexto.cliente.auth.exchangeCodeForSession(
      code,
      flowId === null ? undefined : { flowId },
    );
    if (troca.error || !troca.data.session) return falha();
    const { session } = troca.data;
    const identidade = await contexto.cliente.auth.getUser();
    if (identidade.error || !identidade.data.user) return falha();
    const admissao = await contexto.cliente
      .schema('api')
      .rpc('admitir_sessao_nativa', { p_request_id: crypto.randomUUID() });
    if (admissao.error || admissao.data === null) return falha();
    const autorizada = sessaoNativaSchema.safeParse(admissao.data);
    if (
      !autorizada.success ||
      !autorizada.data.usuario.ativo ||
      autorizada.data.usuario.id !== identidade.data.user.id
    )
      return falha();

    // O SDK salva tokens Google no exchange. Regravar somente a sessão Auth
    // pelo SDK impede transportá-los ao navegador. Integrações Google terão
    // armazenamento server-only próprio; ainda não são ativadas por este login.
    if (!session.expires_at || session.expires_at <= Date.now() / 1000 + 30) return falha();
    const normalizada = await contexto.cliente.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    if (
      normalizada.error ||
      !normalizada.data.session ||
      normalizada.data.user?.id !== identidade.data.user.id ||
      normalizada.data.session.access_token !== session.access_token ||
      normalizada.data.session.refresh_token !== session.refresh_token ||
      normalizada.data.session.provider_token ||
      normalizada.data.session.provider_refresh_token
    )
      return falha();
    return contexto.responder(new Response(null, { status: 303, headers: { Location: '/' } }));
  } catch {
    return falha();
  }
}
