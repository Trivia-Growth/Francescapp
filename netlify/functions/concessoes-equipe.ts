import { criarConcessaoEquipeReservadaSchema } from '../../packages/contracts/src/identidade.ts';
import { prepararConcessaoEquipe } from '../../packages/cadastro/src/preparar-concessao-equipe.ts';
import { calcularCandidatosConcessao } from './_shared/idempotencia-concessao-equipe.ts';
import { configurarIdempotenciaConcessao } from './_shared/configurar-idempotencia-concessao.ts';
import {
  cabecalhosMutacaoSchema,
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
import { servicoAtivo } from './_shared/configuracao-servidor.ts';
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
  const criando = request.method === 'POST';
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
  } catch {
    return erro('servico_indisponivel');
  }
  // Interruptores administrados pela tela, com as variáveis de ambiente como padrão quando o
  // banco não responde. Não são autorização: a rota segue exigindo sessão de administrador e
  // atestado. Criar depende também da conferência prévia, que faz parte do mesmo fluxo.
  if (
    !(await servicoAtivo(
      dependencias.pool,
      criando ? 'ffcm.equipe.criacao_ativa' : 'ffcm.equipe.consulta_ativa',
      process.env[criando ? 'FFCM_CRIACAO_EQUIPE_ATIVA' : 'FFCM_CONSULTA_EQUIPE_ATIVA'] === 'true',
    ))
  )
    return erro('servico_indisponivel');
  if (
    criando &&
    !(await servicoAtivo(
      dependencias.pool,
      'ffcm.equipe.barreira_ativa',
      process.env.FFCM_BARREIRA_EQUIPE_ATIVADA === 'true',
    ))
  )
    return erro('servico_indisponivel');
  const controle = new AbortController();
  const cancelar = () => controle.abort();
  request.signal.addEventListener('abort', cancelar, { once: true });
  if (request.signal.aborted) cancelar();
  const prazo = setTimeout(cancelar, 10_000);
  try {
    const url = new URL(request.url);
    if (
      !['GET', 'POST'].includes(request.method) ||
      url.pathname !== config.path ||
      url.hash ||
      (criando && url.search)
    )
      return erro('entrada_invalida');
    if (criando) return await criarConcessao(request, requestId, headers, controle.signal);
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

async function criarConcessao(
  request: Request,
  requestId: string,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<Response> {
  const erro = (
    codigo:
      | 'entrada_invalida'
      | 'nao_autenticado'
      | 'sem_permissao'
      | 'servico_indisponivel'
      | 'pendencia_externa'
      | 'conflito_idempotencia'
      | 'conflito',
  ) =>
    Response.json(criarErroPublicoSemCampos(codigo, requestId), {
      status: statusErroHttp[codigo],
      headers,
    });
  let iniciada = false;
  try {
    const cabecalhos = cabecalhosMutacaoSchema.safeParse({
      'x-chave-idempotencia': request.headers.get('x-chave-idempotencia'),
    });
    if (
      !cabecalhos.success ||
      !request.body ||
      request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
        'application/json'
    )
      return erro('entrada_invalida');
    const leitor = request.body.getReader();
    signal.addEventListener(
      'abort',
      () => {
        void leitor.cancel().catch(() => {});
      },
      { once: true },
    );
    const partes: Uint8Array[] = [];
    let tamanho = 0;
    while (true) {
      if (signal.aborted) throw new Error();
      const parte = await leitor.read();
      if (signal.aborted) throw new Error();
      if (parte.done) break;
      tamanho += parte.value.length;
      if (tamanho > 16384) {
        void leitor.cancel();
        return erro('entrada_invalida');
      }
      partes.push(parte.value);
    }
    const bytes = new Uint8Array(tamanho);
    let pos = 0;
    for (const parte of partes) {
      bytes.set(parte, pos);
      pos += parte.length;
    }
    let corpo: unknown;
    try {
      corpo = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      return erro('entrada_invalida');
    }
    const validada = criarConcessaoEquipeReservadaSchema.safeParse(corpo);
    if (!validada.success) return erro('entrada_invalida');
    dependencias ??= configurarDependenciasNativas(process.env);
    const pedido = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      signal,
    });
    const contexto = criarContextoAuthNativo(pedido, dependencias.fonte);
    if (request.headers.get('origin') !== contexto.origem) return erro('entrada_invalida');
    const autorizar = async () => {
      const alvo = request.headers.get('x-sessao');
      if (!alvo) return { estado: 'nao_autenticado' as const };
      if (signal.aborted) return { estado: 'servico_indisponivel' as const };
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
      if (resultado.error || signal.aborted) return { estado: 'servico_indisponivel' as const };
      const sessao = sessaoNativaSchema.safeParse(resultado.data);
      if (
        contexto.cookiesAlterados ||
        !sessao.success ||
        !sessao.data.usuario.ativo ||
        sessao.data.usuario.id !== usuario.data.user.id ||
        sessao.data.session_id.toLowerCase() !== alvo.toLowerCase()
      )
        return { estado: 'nao_autenticado' as const };
      return {
        estado: 'autorizado' as const,
        usuarioId: sessao.data.usuario.id.toLowerCase(),
        sessaoId: sessao.data.session_id.toLowerCase(),
      };
    };
    const inicial = await autorizar();
    if (inicial.estado !== 'autorizado') return erro(inicial.estado);
    const idempotencia = configurarIdempotenciaConcessao(process.env);
    const cofre = await carregarCofreNativo(
      dependencias.pool,
      dependencias.referencias,
      dependencias.keyIdAtestado,
      signal,
      idempotencia.referencias,
    );
    const chave = cabecalhos.data['x-chave-idempotencia'];
    const logico = cofre.atestador.canonicalizar({
      operacao: 'api.criar_concessao_equipe',
      usuario_id: inicial.usuarioId,
      corpo: validada.data.entrada,
    });
    const candidatos = await calcularCandidatosConcessao(
      cofre.chavesIdempotencia,
      inicial.usuarioId,
      chave,
      logico,
    );
    const ativo = candidatos[idempotencia.ativa];
    if (!ativo) throw new Error();
    const concessaoId = ativo.concessao_id;
    const digest = ativo.digest_idempotencia;
    const campos = await prepararConcessaoEquipe(
      { concessaoId, corpo: validada.data.entrada },
      cofre.cifra,
    );
    const entrada = {
      ...campos,
      reserva_id: validada.data.reserva_id,
      geracao_reserva: validada.data.geracao_reserva,
      request_id: requestId,
      auditoria_id: crypto.randomUUID(),
      chave_idempotencia: chave,
      digest_idempotencia: digest,
      versao_idempotencia: idempotencia.ativa,
      candidatos_idempotencia: candidatos,
    };
    const metadados = {
      ...metadadosAtestadoNativo(dependencias.keyIdAtestado, requestId, Date.now()),
      usuario_id: inicial.usuarioId,
      session_id: inicial.sessaoId,
      operacao: 'api.criar_concessao_equipe',
    };
    const prova = resultadoAtestacaoSchema.parse(
      await cofre.atestador.atestarEntrada(metadados, entrada),
    );
    const dados = dadosAtestadoSchema.parse(JSON.parse(prova.dadosCanonicos));
    const assinada = assinaturasRpc.criarConcessao.entrada
      .omit({ atestado: true })
      .parse(JSON.parse(prova.entradaCanonica));
    if (
      cofre.atestador.canonicalizar(assinada) !== cofre.atestador.canonicalizar(entrada) ||
      Object.entries(metadados).some(
        ([campo, valor]) => dados[campo as keyof typeof metadados] !== valor,
      )
    )
      throw new Error();
    const transporte = criarTransporteRpcAtestadaSchema('criarConcessao').parse({
      p_entrada: {
        entrada: { ...assinada, atestado: { ...dados, mac: prova.atestado.mac } },
        entrada_canonica: prova.entradaCanonica,
        dados_canonicos: prova.dadosCanonicos,
      },
    });
    if (signal.aborted) throw new Error();
    iniciada = true;
    const resposta = await contexto.cliente
      .schema('api')
      .rpc('criar_concessao_equipe_privado', { p_transporte: transporte.p_entrada });
    if (resposta.error || contexto.cookiesAlterados || signal.aborted) throw new Error();
    const resultado = assinaturasRpc.criarConcessao.saida.parse(resposta.data);
    if (resultado.request_id.toLowerCase() !== requestId) throw new Error();
    if (!resultado.ok) {
      if (
        resultado.erro.codigo === 'sem_permissao' ||
        resultado.erro.codigo === 'conflito' ||
        resultado.erro.codigo === 'conflito_idempotencia'
      )
        return erro(resultado.erro.codigo);
      throw new Error();
    }
    const atual = await autorizar();
    if (
      atual.estado !== 'autorizado' ||
      atual.usuarioId !== inicial.usuarioId ||
      atual.sessaoId !== inicial.sessaoId
    )
      return erro('pendencia_externa');
    const saida = contratosRotas.criarConcessao.saida.parse({
      id: resultado.dados.concessao_id,
      perfil: resultado.dados.perfil,
      metodo: 'google_workspace',
      estado: resultado.dados.estado,
      usuario_id: resultado.dados.usuario_id,
      versao: resultado.dados.versao,
    });
    return Response.json({ dados: saida, request_id: requestId }, { headers });
  } catch {
    return erro(iniciada ? 'pendencia_externa' : 'servico_indisponivel');
  }
}
