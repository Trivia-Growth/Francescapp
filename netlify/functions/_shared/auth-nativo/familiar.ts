import { criarErroPublicoSemCampos } from '../../../../packages/contracts/src/erros.ts';
import {
  entrarFamiliarSchema,
  sessaoNativaSchema,
} from '../../../../packages/contracts/src/identidade.ts';
import type { FonteDeConfiguracao } from '../../../../supabase/functions/_shared/configuracao.ts';
import { credencialAuthRejeitada, criarContextoAuthNativo, fluxoValido } from './cliente.ts';

/** Preparação privada: não registrar rota antes da integração e validação no banco. */
export async function entrarFamiliarNativa(request: Request, fonte: FonteDeConfiguracao) {
  const requestId = crypto.randomUUID();
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
  const erro = (
    codigo: 'entrada_invalida' | 'sem_permissao' | 'nao_autenticado' | 'servico_indisponivel',
    status: number,
  ) => Response.json(criarErroPublicoSemCampos(codigo, requestId), { status, headers });
  const url = new URL(request.url);
  if (
    request.method !== 'POST' ||
    url.pathname !== '/api/auth/familiar' ||
    url.search ||
    url.hash ||
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
  )
    return erro('entrada_invalida', 422);
  if (request.headers.get('origin') !== url.origin || !fluxoValido(request.headers.get('x-fluxo')))
    return erro('sem_permissao', 403);
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
      if (tamanho > 8192) throw new Error();
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
  const credenciais = entrarFamiliarSchema.safeParse(entrada);
  if (!credenciais.success) return erro('entrada_invalida', 422);
  try {
    const contexto = criarContextoAuthNativo(request, fonte);
    if (request.headers.get('origin') !== contexto.origem) return erro('sem_permissao', 403);
    const login = await contexto.cliente.auth.signInWithPassword({
      email: credenciais.data.email,
      password: credenciais.data.senha,
    });
    if (login.error)
      return credencialAuthRejeitada(login.error)
        ? erro('nao_autenticado', 401)
        : erro('servico_indisponivel', 503);
    if (!login.data.session || !login.data.user) return erro('servico_indisponivel', 503);
    const identidade = await contexto.cliente.auth.getUser();
    if (identidade.error || !identidade.data.user || identidade.data.user.id !== login.data.user.id)
      return erro('servico_indisponivel', 503);
    const admissao = await contexto.cliente
      .schema('api')
      .rpc('admitir_sessao_familiar_nativa', { p_request_id: requestId });
    if (admissao.error) return erro('servico_indisponivel', 503);
    const sessao = sessaoNativaSchema.safeParse(admissao.data);
    if (
      !sessao.success ||
      !sessao.data.usuario.ativo ||
      sessao.data.usuario.perfil !== 'familia' ||
      sessao.data.usuario.id !== identidade.data.user.id
    )
      return erro('nao_autenticado', 401);
    return contexto.responder(
      Response.json({ dados: sessao.data, request_id: requestId }, { headers }),
    );
  } catch {
    return erro('servico_indisponivel', 503);
  }
}
