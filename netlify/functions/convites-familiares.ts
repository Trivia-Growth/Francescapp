import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { criarConviteFamiliarSchema } from '../../packages/contracts/src/identidade.ts';
import { autorizarOperacaoNativa } from './_shared/auth-nativo/operacao-protegida.ts';
import { carregarCofreNativo } from './_shared/cofre-nativo.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { registrarConviteFamiliarNativo } from './_shared/registrar-convite-familiar-nativo.ts';

export const config = { path: '/api/admin/convites-familiares' };
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export default async function convitesFamiliares(request: Request): Promise<Response> {
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
  const integracaoComprovada = false;
  if (!integracaoComprovada || process.env.FFCM_CONVITE_FAMILIAR_ATIVO !== 'true')
    return erro('servico_indisponivel', 503);
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.pathname !== config.path || url.search || url.hash)
    return erro('entrada_invalida', 422);
  const autorizacao = await autorizarOperacaoNativa(request, process.env);
  if (autorizacao.estado !== 'autorizado')
    return erro(
      autorizacao.estado,
      autorizacao.estado === 'nao_autenticado'
        ? 401
        : autorizacao.estado === 'entrada_invalida'
          ? 422
          : 503,
    );
  if (autorizacao.sessao.usuario.perfil !== 'administrador') return erro('sem_permissao', 403);
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
  const dados = criarConviteFamiliarSchema.safeParse(entrada);
  if (!dados.success) return erro('entrada_invalida', 422);
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
    const cofre = await carregarCofreNativo(
      dependencias.pool,
      dependencias.referencias,
      dependencias.keyIdAtestado,
      request.signal,
    );
    const resultado = await registrarConviteFamiliarNativo(
      autorizacao.contexto.cliente,
      cofre,
      process.env,
      {
        usuarioId: autorizacao.sessao.usuario.id,
        sessaoId: autorizacao.sessao.session_id,
        keyId: dependencias.keyIdAtestado,
      },
      dados.data,
      request.signal,
    );
    const atual = await autorizarOperacaoNativa(request, process.env);
    if (
      atual.estado !== 'autorizado' ||
      atual.sessao.usuario.perfil !== 'administrador' ||
      atual.sessao.usuario.id !== autorizacao.sessao.usuario.id ||
      atual.sessao.session_id !== autorizacao.sessao.session_id
    )
      return erro('sem_permissao', 403);
    return Response.json({ dados: resultado, request_id: requestId }, { headers });
  } catch {
    return erro('servico_indisponivel', 503);
  }
}
