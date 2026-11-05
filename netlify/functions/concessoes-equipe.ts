import {
  assinaturasRpc,
  contratosRotas,
  criarErroPublicoSemCampos,
  criarTransporteRpcAtestadaSchema,
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
  statusErroHttp,
} from '../../packages/contracts/src/index.ts';
import { sessaoNativaSchema } from '../../packages/contracts/src/identidade.ts';
import { credencialAuthRejeitada, criarContextoAuthNativo } from './_shared/auth-nativo/cliente.ts';
import { carregarCofreNativo } from './_shared/cofre-nativo.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { metadadosAtestadoNativo } from './_shared/compor-pacientes-nativo.ts';

export const config = { path: '/api/admin/concessoes-equipe' };
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export default async function concessoesEquipe(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
  const erro = (
    codigo: 'entrada_invalida' | 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel',
  ) =>
    Response.json(criarErroPublicoSemCampos(codigo, requestId), {
      status: statusErroHttp[codigo],
      headers,
    });
  if (process.env.FFCM_CONSULTA_EQUIPE_ATIVA !== 'true') return erro('servico_indisponivel');
  const controle = new AbortController();
  const cancelar = () => controle.abort();
  request.signal.addEventListener('abort', cancelar, { once: true });
  if (request.signal.aborted) cancelar();
  const prazo = setTimeout(cancelar, 10_000);
  try {
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.pathname !== config.path || url.hash)
      return erro('entrada_invalida');
    const consulta: Record<string, unknown> = {};
    for (const [chave, valor] of url.searchParams) {
      if (!['limite', 'cursor', 'estado'].includes(chave) || Object.hasOwn(consulta, chave))
        return erro('entrada_invalida');
      consulta[chave] = chave === 'limite' && /^\d{1,3}$/.test(valor) ? Number(valor) : valor;
    }
    const validada = contratosRotas.listarConcessoes.entrada.safeParse(consulta);
    if (!validada.success) return erro('entrada_invalida');
    dependencias ??= configurarDependenciasNativas(process.env);
    const pedido = new Request(request.url, {
      method: 'GET',
      headers: request.headers,
      signal: controle.signal,
    });
    const contexto = criarContextoAuthNativo(pedido, dependencias.fonte);
    const autorizar = async () => {
      if (controle.signal.aborted) throw new Error();
      const alvo = request.headers.get('x-sessao');
      if (!alvo) return { estado: 'nao_autenticado' as const };
      const usuario = await contexto.cliente.auth.getUser();
      if (contexto.cookiesAlterados) return { estado: 'nao_autenticado' as const };
      if (usuario.error)
        return {
          estado: credencialAuthRejeitada(usuario.error)
            ? ('nao_autenticado' as const)
            : ('servico_indisponivel' as const),
        };
      if (!usuario.data.user) return { estado: 'nao_autenticado' as const };
      const resultado = await contexto.cliente
        .schema('api')
        .rpc('consultar_sessao_nativa', { p_request_id: requestId });
      if (resultado.error || controle.signal.aborted)
        return { estado: 'servico_indisponivel' as const };
      const sessao = sessaoNativaSchema.safeParse(resultado.data);
      if (
        contexto.cookiesAlterados ||
        !sessao.success ||
        !sessao.data.usuario.ativo ||
        sessao.data.usuario.id !== usuario.data.user.id ||
        sessao.data.session_id.toLowerCase() !== alvo.toLowerCase()
      )
        return { estado: 'nao_autenticado' as const };
      if (sessao.data.usuario.perfil !== 'administrador')
        return { estado: 'sem_permissao' as const };
      return {
        estado: 'autorizado' as const,
        usuarioId: sessao.data.usuario.id.toLowerCase(),
        sessaoId: sessao.data.session_id.toLowerCase(),
      };
    };
    const inicial = await autorizar();
    if (inicial.estado !== 'autorizado') return erro(inicial.estado);
    const cofre = await carregarCofreNativo(
      dependencias.pool,
      dependencias.referencias,
      dependencias.keyIdAtestado,
      controle.signal,
    );
    const vinculo = { usuarioId: inicial.usuarioId, sessaoId: inicial.sessaoId };
    const cursor =
      validada.data.cursor === undefined
        ? undefined
        : await cofre.cursor.abrir(validada.data.cursor, vinculo);
    const entrada = {
      limite: validada.data.limite,
      ...(validada.data.estado === undefined ? {} : { estado: validada.data.estado }),
      ...(cursor === undefined ? {} : { cursor }),
      request_id: requestId,
    };
    const metadados = {
      ...metadadosAtestadoNativo(dependencias.keyIdAtestado, requestId, Date.now()),
      usuario_id: inicial.usuarioId,
      session_id: inicial.sessaoId,
      operacao: 'api.listar_concessoes_equipe',
    };
    const prova = resultadoAtestacaoSchema.parse(
      await cofre.atestador.atestarEntrada(metadados, entrada),
    );
    const dados = dadosAtestadoSchema.parse(JSON.parse(prova.dadosCanonicos));
    const assinada = assinaturasRpc.listarConcessoes.entrada
      .omit({ atestado: true })
      .parse(JSON.parse(prova.entradaCanonica));
    if (
      Object.entries(entrada).some(
        ([campo, valor]) => assinada[campo as keyof typeof assinada] !== valor,
      ) ||
      Object.entries(metadados).some(
        ([campo, valor]) => dados[campo as keyof typeof metadados] !== valor,
      )
    )
      throw new Error();
    const transporte = criarTransporteRpcAtestadaSchema('listarConcessoes').parse({
      p_entrada: {
        entrada: { ...assinada, atestado: { ...dados, mac: prova.atestado.mac } },
        entrada_canonica: prova.entradaCanonica,
        dados_canonicos: prova.dadosCanonicos,
      },
    });
    const resposta = await contexto.cliente
      .schema('api')
      .rpc('listar_concessoes_equipe_privado', { p_transporte: transporte.p_entrada });
    if (resposta.error || contexto.cookiesAlterados || controle.signal.aborted) throw new Error();
    const pagina = assinaturasRpc.listarConcessoes.saida.parse(resposta.data);
    if (
      pagina.request_id.toLowerCase() !== requestId ||
      !pagina.ok ||
      pagina.dados.itens.length > entrada.limite
    ) {
      if (
        !pagina.ok &&
        pagina.request_id.toLowerCase() === requestId &&
        pagina.erro.codigo === 'sem_permissao'
      )
        return erro('sem_permissao');
      throw new Error();
    }
    const itens = [];
    for (const item of pagina.dados.itens) {
      if (controle.signal.aborted) throw new Error();
      const email = await cofre.cifra.decifrar(item.email, {
        tabela: 'identidade.concessao_equipe',
        registro_id: item.concessao_id,
        campo: 'email',
        formato: 1,
      });
      itens.push({
        id: item.concessao_id,
        email,
        perfil: item.perfil,
        estado: item.estado,
        usuario_id: item.usuario_id,
        ativo: item.ativo,
        versao: item.versao,
      });
    }
    const proximo_cursor =
      pagina.dados.proximo_cursor === null
        ? null
        : await cofre.cursor.emitir(pagina.dados.proximo_cursor, vinculo);
    const saida = contratosRotas.listarConcessoes.saida.parse({ itens, proximo_cursor });
    const atual = await autorizar();
    if (atual.estado !== 'autorizado') return erro(atual.estado);
    if (
      controle.signal.aborted ||
      atual.usuarioId !== inicial.usuarioId ||
      atual.sessaoId !== inicial.sessaoId
    )
      return erro('nao_autenticado');
    return Response.json({ dados: saida, request_id: requestId }, { headers });
  } catch {
    return erro('servico_indisponivel');
  } finally {
    clearTimeout(prazo);
    request.signal.removeEventListener('abort', cancelar);
  }
}
