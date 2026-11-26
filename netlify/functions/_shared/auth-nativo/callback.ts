import { criarErroPublicoSemCampos } from '../../../../packages/contracts/src/erros.ts';
import { sessaoNativaSchema } from '../../../../packages/contracts/src/identidade.ts';
import type { FonteDeConfiguracao } from '../../../../supabase/functions/_shared/configuracao.ts';
import { cookiesDeLimpezaDaTentativa, criarContextoAuthNativo, fluxoValido } from './cliente.ts';
import { registrarFalhaOperacional } from '../falha-operacional.ts';

/** Cookies ficam retidos no contexto até a autorização no banco. Erros não
 * sobrescrevem nem encerram uma sessão anterior do navegador. */
export async function concluirGoogleNativo(request: Request, fonte: FonteDeConfiguracao) {
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    // `Response.json` não declara charset, e o Safari então decodifica a resposta com a
    // codificação padrão do documento. Em 24/11/2026 "Dados inválidos." chegou a um iPhone
    // como "Dados invÃ¡lidos.".
    'Content-Type': 'application/json; charset=utf-8',
  };
  const erro = (
    codigo: 'entrada_invalida' | 'sem_permissao' | 'servico_indisponivel',
    status: number,
  ) => Response.json(criarErroPublicoSemCampos(codigo, crypto.randomUUID()), { status, headers });
  // A tentativa encerrada limpa apenas os próprios cookies do SDK; sessão
  // anterior e outras tentativas em curso continuam intactas.
  const encerrarTentativa = (resposta: Response, fluxoEncerrado?: string) => {
    if (fluxoEncerrado !== undefined) {
      for (const cookie of cookiesDeLimpezaDaTentativa(request, fonte, fluxoEncerrado)) {
        resposta.headers.append('Set-Cookie', cookie);
      }
    }
    return resposta;
  };
  const falha = (fluxoEncerrado?: string) =>
    encerrarTentativa(
      new Response(null, {
        status: 303,
        headers: { ...headers, Location: '/?acesso=indisponivel#' },
      }),
      fluxoEncerrado,
    );
  /**
   * A pessoa provou no Google que é dona daquela conta, e o banco recusou a admissão: a
   * conta não tem acesso liberado aqui.
   *
   * Até 24/11/2026 esse caso caía em `falha()`, e a tela dizia "Tente novamente" — um convite
   * a repetir uma coisa que nunca vai dar certo. Em 24/11/2026 sete tentativas seguidas
   * foram registradas como `admitir_sessao_nativa` negado, porque o seletor do Google
   * escolhia uma conta pessoal em vez da conta da organização.
   *
   * Dizer isso não vaza nada: a pessoa acabou de autenticar essa conta, e a resposta é sobre
   * a conta que ela já tem em mãos. Não afirma se existe cadastro de alguém, nem qual.
   */
  const semAutorizacao = (fluxoEncerrado?: string) =>
    encerrarTentativa(
      new Response(null, {
        status: 303,
        headers: { ...headers, Location: '/?acesso=sem_autorizacao#' },
      }),
      fluxoEncerrado,
    );
  const url = new URL(request.url);
  // O fragmento não chega ao servidor; um fragmento vazio impede sua herança no redirect.
  if (
    request.method === 'GET' &&
    url.pathname === '/api/auth/callback' &&
    !url.search &&
    !url.hash &&
    !url.href.includes('?')
  )
    return new Response(null, {
      status: 303,
      headers: { ...headers, Location: '/?acesso=indisponivel#' },
    });
  const fluxo = url.searchParams.get('fluxo');
  const parametrosErro = ['error', 'error_code', 'error_description', 'fluxo'];
  if (
    request.method === 'GET' &&
    url.pathname === '/api/auth/callback' &&
    !url.hash &&
    url.searchParams.getAll('fluxo').length === 1 &&
    fluxoValido(fluxo) &&
    url.searchParams.getAll('error').length === 1 &&
    /^[a-z_]{1,64}$/.test(url.searchParams.get('error') ?? '') &&
    Array.from(url.searchParams.keys()).every((nome) => parametrosErro.includes(nome)) &&
    parametrosErro.every((nome) => url.searchParams.getAll(nome).length <= 1) &&
    (url.searchParams.get('error_code')?.length ?? 0) <= 128 &&
    (url.searchParams.get('error_description')?.length ?? 0) <= 2048
  )
    return falha(fluxo);
  const code = url.searchParams.get('code');
  const flowId = url.searchParams.get('sb_flow_id');
  if (
    request.method !== 'GET' ||
    url.searchParams.getAll('fluxo').length !== 1 ||
    !fluxoValido(fluxo) ||
    url.pathname !== '/api/auth/callback' ||
    url.hash ||
    url.searchParams.getAll('code').length !== 1 ||
    !code ||
    code.length > 2048 ||
    !/^[!-~]+$/.test(code) ||
    Array.from(url.searchParams.keys()).some(
      (nome) => nome !== 'code' && nome !== 'sb_flow_id' && nome !== 'fluxo',
    ) ||
    url.searchParams.getAll('sb_flow_id').length > 1 ||
    (flowId !== null && !/^[A-Za-z0-9_-]{8,64}$/.test(flowId))
  ) {
    // Uma navegação de volta do Google que cai aqui é uma PESSOA olhando a tela, não um
    // cliente de API. Até 24/11/2026 ela recebia o JSON de erro cru — chaves, código e
    // `request_id` — como página. Quem tentou entrar viu isso, e o servidor não registrou
    // nada: não havia como descobrir qual parâmetro o retorno trouxe de diferente.
    //
    // Agora a navegação volta para a tela de acesso, como já faziam os outros caminhos de
    // falha deste arquivo, e o servidor anota os NOMES dos parâmetros recebidos. Nomes, não
    // valores: `code` é credencial de uso único e `error_description` é texto do provedor.
    if (request.method === 'GET' && url.pathname === '/api/auth/callback') {
      registrarFalhaOperacional({
        rota: 'auth-callback',
        etapa: 'resposta',
        request_id: crypto.randomUUID(),
        causa: `parametros_${[...new Set(url.searchParams.keys())].sort().join('-') || 'nenhum'}`,
      });
      return falha();
    }
    return erro('entrada_invalida', 422);
  }

  try {
    const contexto = criarContextoAuthNativo(request, fonte, fluxo);
    const troca = await contexto.cliente.auth.exchangeCodeForSession(
      code,
      flowId === null ? undefined : { flowId },
    );
    if (troca.error || !troca.data.session) return falha(fluxo);
    const { session } = troca.data;
    const identidade = await contexto.cliente.auth.getUser();
    if (identidade.error || !identidade.data.user) return falha(fluxo);
    const admissao = await contexto.cliente
      .schema('api')
      .rpc('admitir_sessao_nativa', { p_request_id: crypto.randomUUID() });
    // `error` é falha de infraestrutura; `data === null` é a recusa do banco, que é a
    // resposta normal para quem entrou com uma conta sem acesso.
    if (admissao.error) return falha(fluxo);
    if (admissao.data === null) return semAutorizacao(fluxo);
    const autorizada = sessaoNativaSchema.safeParse(admissao.data);
    if (!autorizada.success || autorizada.data.usuario.id !== identidade.data.user.id)
      return falha(fluxo);
    if (!autorizada.data.usuario.ativo) return semAutorizacao(fluxo);

    // O SDK salva tokens Google no exchange. Regravar somente a sessão Auth
    // pelo SDK impede transportá-los ao navegador. Integrações Google terão
    // armazenamento server-only próprio; ainda não são ativadas por este login.
    if (!session.expires_at || session.expires_at <= Date.now() / 1000 + 30) return falha(fluxo);
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
      return falha(fluxo);
    return contexto.responderSessaoNova(
      new Response(null, { status: 303, headers: { Location: `/?fluxo=${fluxo}#` } }),
    );
  } catch {
    return falha(fluxo);
  }
}
