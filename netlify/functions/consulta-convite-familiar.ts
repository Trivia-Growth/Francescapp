import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { uuidSchema } from '../../packages/contracts/src/comum.ts';
import { dadosAtestadoSchema, resultadoAtestacaoSchema } from '../../packages/contracts/src/rpc.ts';
import { autorizarOperacaoNativa } from './_shared/auth-nativo/operacao-protegida.ts';
import { carregarCofreNativo } from './_shared/cofre-nativo.ts';
import { metadadosAtestadoNativo } from './_shared/compor-pacientes-nativo.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';

export const config = { path: '/api/admin/convites-familiares/consulta' };
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export default async function consultaConvite(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
  const erro = (
    codigo: 'entrada_invalida' | 'sem_permissao' | 'servico_indisponivel',
    status: number,
  ) => Response.json(criarErroPublicoSemCampos(codigo, requestId), { status, headers });
  const integracaoComprovada = false;
  if (!integracaoComprovada || process.env.FFCM_CONVITE_FAMILIAR_ATIVO !== 'true')
    return erro('servico_indisponivel', 503);
  const url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    url.pathname !== config.path ||
    url.hash ||
    Array.from(url.searchParams.keys()).some(
      (chave) => chave !== 'convite' && chave !== 'tentativa',
    ) ||
    url.searchParams.getAll('convite').length !== 1 ||
    url.searchParams.getAll('tentativa').length !== 1
  )
    return erro('entrada_invalida', 422);
  const convite = uuidSchema.safeParse(url.searchParams.get('convite'));
  const tentativa = uuidSchema.safeParse(url.searchParams.get('tentativa'));
  if (!convite.success || !tentativa.success) return erro('entrada_invalida', 422);
  const autorizacao = await autorizarOperacaoNativa(request, process.env);
  if (autorizacao.estado !== 'autorizado' || autorizacao.sessao.usuario.perfil !== 'administrador')
    return erro('sem_permissao', 403);
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
    const cofre = await carregarCofreNativo(
      dependencias.pool,
      dependencias.referencias,
      dependencias.keyIdAtestado,
      request.signal,
    );
    const entrada = {
      request_id: requestId,
      convite_id: convite.data.toLowerCase(),
      tentativa_id: tentativa.data.toLowerCase(),
      acao: 'consultar',
    };
    const metadados = {
      ...metadadosAtestadoNativo(dependencias.keyIdAtestado, requestId, Date.now()),
      usuario_id: autorizacao.sessao.usuario.id.toLowerCase(),
      session_id: autorizacao.sessao.session_id.toLowerCase(),
      operacao: 'api.reenvio_familiar',
    };
    const prova = resultadoAtestacaoSchema.parse(
      await cofre.atestador.atestarEntrada(metadados, entrada),
    );
    const dados = dadosAtestadoSchema.parse(JSON.parse(prova.dadosCanonicos));
    const assinada = JSON.parse(prova.entradaCanonica) as Record<string, unknown>;
    if (
      Object.keys(assinada).length !== Object.keys(entrada).length ||
      Object.entries(entrada).some(([k, v]) => assinada[k] !== v) ||
      Object.entries(metadados).some(([k, v]) => dados[k as keyof typeof metadados] !== v)
    )
      throw new Error();
    const resposta = await autorizacao.contexto.cliente
      .schema('api')
      .rpc('reenvio_familiar_privado', {
        p_transporte: {
          entrada: { ...assinada, atestado: { ...dados, mac: prova.atestado.mac } },
          entrada_canonica: prova.entradaCanonica,
          dados_canonicos: prova.dadosCanonicos,
        },
      });
    if (
      resposta.error ||
      resposta.data?.ok !== true ||
      !['resultado_incerto', 'ativado', 'enviado', 'falha', 'tentativa_indisponivel'].includes(
        resposta.data?.estado,
      )
    )
      throw new Error();
    const atual = await autorizarOperacaoNativa(request, process.env);
    if (
      atual.estado !== 'autorizado' ||
      atual.sessao.usuario.perfil !== 'administrador' ||
      atual.sessao.usuario.id !== autorizacao.sessao.usuario.id ||
      atual.sessao.session_id !== autorizacao.sessao.session_id
    )
      return erro('sem_permissao', 403);
    return Response.json(
      { dados: { estado: resposta.data.estado }, request_id: requestId },
      { headers },
    );
  } catch {
    return erro('servico_indisponivel', 503);
  }
}
