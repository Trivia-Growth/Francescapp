import { criarErroPublicoSemCampos } from '../../../../packages/contracts/src/erros.ts';
import { sessaoNativaSchema } from '../../../../packages/contracts/src/identidade.ts';
import type { FonteDeConfiguracao } from '../../../../supabase/functions/_shared/configuracao.ts';
import { credencialAuthRejeitada, criarContextoAuthNativo } from './cliente.ts';

/** Preparação privada, sem rota pública. Identidade Auth não substitui concessão/perfil vigentes, consultados no banco.
 * Consulta nunca publica cookies: resposta antiga poderia sobrescrever novo login. */
export async function consultarSessaoFamiliarPrivada(request: Request, fonte: FonteDeConfiguracao) {
  const requestId = crypto.randomUUID();
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
  const erro = (
    codigo: 'entrada_invalida' | 'nao_autenticado' | 'servico_indisponivel',
    status: number,
  ) => Response.json(criarErroPublicoSemCampos(codigo, requestId), { status, headers });
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname !== '/api/familiar/sessao' || url.search || url.hash)
    return erro('entrada_invalida', 422);

  try {
    const contexto = criarContextoAuthNativo(request, fonte);
    const identidade = await contexto.cliente.auth.getUser();
    if (identidade.error)
      return credencialAuthRejeitada(identidade.error)
        ? erro('nao_autenticado', 401)
        : erro('servico_indisponivel', 503);
    if (contexto.cookiesAlterados) return erro('nao_autenticado', 401);
    if (!identidade.data.user) return erro('nao_autenticado', 401);
    const resultado = await contexto.cliente
      .schema('api')
      .rpc('consultar_sessao_familiar_privada', { p_request_id: requestId });
    if (contexto.cookiesAlterados) return erro('nao_autenticado', 401);
    if (resultado.error) return erro('servico_indisponivel', 503);
    if (resultado.data === null) return erro('nao_autenticado', 401);
    const sessao = sessaoNativaSchema.safeParse(resultado.data);
    if (
      !sessao.success ||
      !sessao.data.usuario.ativo ||
      sessao.data.usuario.perfil !== 'familia' ||
      sessao.data.usuario.id !== identidade.data.user.id ||
      (request.headers.has('x-sessao') &&
        request.headers.get('x-sessao') !== sessao.data.session_id)
    )
      return erro('nao_autenticado', 401);
    return Response.json({ dados: sessao.data, request_id: requestId }, { headers });
  } catch {
    return erro('servico_indisponivel', 503);
  }
}
