import { z } from 'zod';
import { paginaVinculosProfissionaisSchema as pagina } from '../../packages/contracts/src/vinculos-profissionais.ts';
import { uuidSchema } from '../../packages/contracts/src/comum.ts';
import {
  criarErroPublicoSemCampos,
  statusErroHttp,
  type CodigoErro,
} from '../../packages/contracts/src/erros.ts';
import { sessaoNativaSchema } from '../../packages/contracts/src/identidade.ts';
import { criarContextoAuthNativo } from './_shared/auth-nativo/cliente.ts';
import { servicoAtivo } from './_shared/configuracao-servidor.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';

export const config = { path: '/api/pacientes/:paciente_id/vinculos-profissionais' };
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;
const resposta = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), dados: pagina, request_id: uuidSchema }).strict(),
  z
    .object({
      ok: z.literal(false),
      erro: z.object({ codigo: z.literal('sem_permissao') }).strict(),
      request_id: uuidSchema,
    })
    .strict(),
]);
export default async function vinculosProfissionais(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
  const erro = (codigo: CodigoErro) =>
    Response.json(criarErroPublicoSemCampos(codigo, requestId), {
      status: statusErroHttp[codigo],
      headers,
    });
  // Interruptor administrado pela tela (`ffcm.equipe.vinculos_ativa`), com a variável de
  // ambiente como padrão de última instância quando o banco não responde ou não tem a chave.
  //
  // Até 20/11/2026 esta rota lia SOMENTE `process.env.FFCM_CONSULTA_VINCULOS_ATIVA`, enquanto
  // a chave existia no catálogo desde `20261121100000_configuracao_servicos.sql:224` e
  // aparecia na tela de Administração. Alternar na tela não fazia nada, em silêncio — o
  // interruptor mentia. É o mesmo defeito corrigido em `acessos.ts`, e a correção é a mesma.
  //
  // Não é autorização: mesmo ligada, a rota segue exigindo sessão, atestado e perfil
  // administrador no banco, logo abaixo.
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
  } catch {
    // Sem acesso ao banco não há configuração a ler: falha fechada, independentemente do
    // que o ambiente diga.
    return erro('servico_indisponivel');
  }
  if (
    !(await servicoAtivo(
      dependencias.pool,
      'ffcm.equipe.vinculos_ativa',
      process.env.FFCM_CONSULTA_VINCULOS_ATIVA === 'true',
    ))
  )
    return erro('servico_indisponivel');
  const url = new URL(request.url);
  const item = /^\/api\/pacientes\/([^/]+)\/vinculos-profissionais$/.exec(url.pathname);
  const cursor = url.searchParams.get('cursor');
  if (
    request.method !== 'GET' ||
    !item ||
    !uuidSchema.safeParse(item[1]).success ||
    url.hash ||
    [...url.searchParams.keys()].some((k) => k !== 'cursor') ||
    url.searchParams.getAll('cursor').length > 1 ||
    (cursor !== null && !uuidSchema.safeParse(cursor).success)
  )
    return erro('entrada_invalida');
  try {
    const contexto = criarContextoAuthNativo(request, process.env);
    const alvo = request.headers.get('x-sessao');
    const autorizar = async () => {
      if (!uuidSchema.safeParse(alvo).success) return false;
      const usuario = await contexto.cliente.auth.getUser();
      if (usuario.error || !usuario.data.user || contexto.cookiesAlterados) return false;
      const atual = await contexto.cliente
        .schema('api')
        .rpc('consultar_sessao_nativa', { p_request_id: crypto.randomUUID() });
      const sessao = sessaoNativaSchema.safeParse(atual.data);
      return (
        !atual.error &&
        !contexto.cookiesAlterados &&
        sessao.success &&
        sessao.data.usuario.ativo &&
        sessao.data.usuario.perfil === 'administrador' &&
        sessao.data.usuario.id === usuario.data.user.id &&
        sessao.data.session_id.toLowerCase() === alvo?.toLowerCase()
      );
    };
    if (!(await autorizar())) return erro('nao_autenticado');
    const resultado = await contexto.cliente
      .schema('api')
      .rpc('listar_vinculos_profissionais_privado', {
        p_request_id: requestId,
        p_paciente_id: item[1],
        p_cursor: cursor,
      });
    if (resultado.error) return erro('servico_indisponivel');
    const validada = resposta.parse(resultado.data);
    if (validada.request_id !== requestId || !(await autorizar())) return erro('nao_autenticado');
    if (!validada.ok) return erro('sem_permissao');
    return Response.json({ dados: validada.dados, request_id: requestId }, { headers });
  } catch {
    return erro('servico_indisponivel');
  }
}
