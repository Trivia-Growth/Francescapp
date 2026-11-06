import { uuidSchema } from '../../packages/contracts/src/comum.ts';
import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { dadosAtestadoSchema, resultadoAtestacaoSchema } from '../../packages/contracts/src/rpc.ts';
import { autorizarOperacaoNativa } from './_shared/auth-nativo/operacao-protegida.ts';
import { carregarCofreNativo } from './_shared/cofre-nativo.ts';
import { metadadosAtestadoNativo } from './_shared/compor-pacientes-nativo.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';

export const config = { path: '/api/admin/convites-familiares/cancelamento' };
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export default async function cancelarConvite(request: Request): Promise<Response> {
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
  if (request.method !== 'POST' || url.pathname !== config.path || url.search || url.hash)
    return erro('entrada_invalida', 422);
  const autorizacao = await autorizarOperacaoNativa(request, process.env);
  if (autorizacao.estado !== 'autorizado' || autorizacao.sessao.usuario.perfil !== 'administrador')
    return erro('sem_permissao', 403);
  const leitor = request.body?.getReader();
  if (!leitor) return erro('entrada_invalida', 422);
  let corpo: unknown;
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
    corpo = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    void leitor.cancel().catch(() => undefined);
    return erro('entrada_invalida', 422);
  } finally {
    leitor.releaseLock();
  }
  if (
    typeof corpo !== 'object' ||
    corpo === null ||
    Array.isArray(corpo) ||
    Object.keys(corpo).some((chave) => chave !== 'convite_id' && chave !== 'tentativa_id')
  )
    return erro('entrada_invalida', 422);
  const campos = corpo as Record<string, unknown>;
  const convite = uuidSchema.safeParse(campos.convite_id);
  const tentativa = uuidSchema.safeParse(campos.tentativa_id);
  if (!convite.success || !tentativa.success) return erro('entrada_invalida', 422);
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
      acao: 'cancelar_autorizacao',
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
      resposta.data?.convite_id !== convite.data.toLowerCase()
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
    return Response.json({ dados: { cancelada: true }, request_id: requestId }, { headers });
  } catch {
    return erro('servico_indisponivel', 503);
  }
}
