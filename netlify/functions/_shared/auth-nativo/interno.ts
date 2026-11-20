import { entrarInternoSchema } from '../../../../packages/contracts/src/acessos.ts';
import { criarErroPublicoSemCampos } from '../../../../packages/contracts/src/erros.ts';
import { sessaoNativaSchema } from '../../../../packages/contracts/src/identidade.ts';
import type { FonteDeConfiguracao } from '../../../../supabase/functions/_shared/configuracao.ts';
import { credencialAuthRejeitada, criarContextoAuthNativo } from './cliente.ts';
import { cabecalhosAuthInterno, lerEntradaInterna } from './entrada-interna.ts';

/** Password é método próprio; admissão SQL não usa exceção técnica ou identidade Google. */
export async function entrarInternoNativo(request: Request, fonte: FonteDeConfiguracao) {
  const requestId = crypto.randomUUID();
  const erro = (
    codigo: 'entrada_invalida' | 'nao_autenticado' | 'servico_indisponivel',
    status: number,
  ) =>
    Response.json(criarErroPublicoSemCampos(codigo, requestId), {
      status,
      headers: cabecalhosAuthInterno,
    });
  let entrada: unknown;
  try {
    entrada = await lerEntradaInterna(request, '/api/auth/interno');
  } catch {
    return erro('entrada_invalida', 422);
  }
  const credenciais = entrarInternoSchema.safeParse(entrada);
  if (!credenciais.success) return erro('entrada_invalida', 422);
  try {
    const contexto = criarContextoAuthNativo(request, fonte);
    if (request.headers.get('origin') !== contexto.origem) return erro('entrada_invalida', 422);
    const login = await contexto.cliente.auth.signInWithPassword({
      email: credenciais.data.email.toLowerCase(),
      password: credenciais.data.senha,
    });
    if (login.error)
      return credencialAuthRejeitada(login.error)
        ? erro('nao_autenticado', 401)
        : erro('servico_indisponivel', 503);
    if (!login.data.session || !login.data.user) return erro('servico_indisponivel', 503);
    const identidade = await contexto.cliente.auth.getUser();
    if (
      identidade.error ||
      !identidade.data.user ||
      identidade.data.user.id !== login.data.user.id ||
      !identidade.data.user.email_confirmed_at
    )
      return erro('nao_autenticado', 401);
    const admissao = await contexto.cliente
      .schema('api')
      .rpc('admitir_sessao_interna_nativa', { p_request_id: requestId });
    if (admissao.error) return erro('servico_indisponivel', 503);
    const sessao = sessaoNativaSchema.safeParse(admissao.data);
    if (
      !sessao.success ||
      !sessao.data.usuario.ativo ||
      sessao.data.usuario.id !== identidade.data.user.id ||
      request.signal.aborted
    )
      return erro('nao_autenticado', 401);
    return contexto.responder(
      Response.json(
        { dados: sessao.data, request_id: requestId },
        { headers: cabecalhosAuthInterno },
      ),
    );
  } catch {
    return erro('servico_indisponivel', 503);
  }
}
