import {
  carregarConfiguracao,
  ErroConfiguracaoIndisponivel,
  type FonteDeConfiguracao,
} from '../../../../supabase/functions/_shared/configuracao.ts';
import { criarRespostaDeFalhaPublica } from '../../../../supabase/functions/_shared/falha-publica.ts';
import {
  criarCodecDeCookiesSessaoIsolada,
  compararCsrfEmTempoConstante,
  emitirProtecaoCsrf,
  ErroJwtDeSessaoInvalido,
  validarJwtDeSessao,
  verificarProtecaoDeComando,
  type ConfiguracaoJwtSessao,
} from '../../../../supabase/functions/_shared/sessao/nucleo.ts';
import { contratosRotas } from '../../../../packages/contracts/src/rotas.ts';
import { uuidSchema } from '../../../../packages/contracts/src/comum.ts';
import {
  entradaSessaoRespostaSchema,
  sessaoAtualSchema,
  saidaSessaoSchema,
} from '../../../../packages/contracts/src/identidade.ts';
import {
  criarErroPublicoSemCampos,
  statusErroHttp,
  type CodigoErro,
} from '../../../../packages/contracts/src/erros.ts';

class ErroTransporteSessao extends Error {
  constructor(readonly codigo: CodigoErro) {
    super('Transporte de sessão recusado.');
  }
}

function respostaJson(dados: unknown, status = 200): Response {
  return Response.json(dados, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

function conferirCookies(cabecalho: string, seletor: string): void {
  if (cabecalho.length > 8_192) throw new ErroTransporteSessao('nao_autenticado');
  const nomes = new Set<string>();
  for (const parte of cabecalho.split(';')) {
    const nome = parte.trim().split('=')[0];
    if (nome !== `ffcm_sessao_${seletor}` && nome !== `ffcm_csrf_${seletor}`) continue;
    if (nomes.has(nome)) throw new ErroTransporteSessao('nao_autenticado');
    nomes.add(nome);
  }
}

async function lerJsonLimitado(request: Request): Promise<unknown> {
  const tipo = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (tipo !== 'application/json') throw new ErroTransporteSessao('entrada_invalida');
  const leitor = request.body?.getReader();
  if (!leitor) throw new ErroTransporteSessao('entrada_invalida');
  const bytes = new Uint8Array(4_096);
  let tamanho = 0;
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const expiracao = new Promise<never>((_, rejeitar) => {
    temporizador = setTimeout(() => rejeitar(new ErroTransporteSessao('entrada_invalida')), 5000);
  });
  try {
    while (true) {
      const parte = await Promise.race([leitor.read(), expiracao]);
      if (parte.done) break;
      tamanho += parte.value.byteLength;
      if (tamanho > bytes.byteLength) {
        throw new ErroTransporteSessao('entrada_invalida');
      }
      bytes.set(parte.value, tamanho - parte.value.byteLength);
    }
    try {
      return JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, tamanho)),
      );
    } catch {
      throw new ErroTransporteSessao('entrada_invalida');
    }
  } catch (erro) {
    void leitor.cancel().catch(() => undefined);
    if (erro instanceof ErroTransporteSessao) throw erro;
    throw new Error('Serviço de sessão indisponível.');
  } finally {
    clearTimeout(temporizador);
    leitor.releaseLock();
  }
}

export function responderFalhaHttpSessao(erro: unknown): Response {
  const codigo =
    erro instanceof ErroJwtDeSessaoInvalido
      ? 'nao_autenticado'
      : erro instanceof ErroTransporteSessao
        ? erro.codigo
        : null;
  const corpo =
    codigo !== null
      ? criarErroPublicoSemCampos(codigo, crypto.randomUUID())
      : criarRespostaDeFalhaPublica(erro);
  return respostaJson(corpo, statusErroHttp[corpo.erro.codigo]);
}

/** Somente transporte. Nenhum método admite, renova ou revoga sessão local. */
export function criarTransporteHttpSessao(
  fonte: FonteDeConfiguracao,
  opcoes: Readonly<{ configuracaoJwt: ConfiguracaoJwtSessao }>,
) {
  const configuracao = carregarConfiguracao('sessao', fonte);
  if (opcoes.configuracaoJwt.issuer !== new URL('/auth/v1', configuracao.supabaseUrl).href) {
    throw new ErroConfiguracaoIndisponivel();
  }
  const contextos = new WeakMap<
    object,
    Readonly<{
      seletor: string;
      rota: 'renovarSessao' | 'sairSessao';
      usuarioId: string;
      sessionId: string;
      csrf: string;
    }>
  >();
  const criarCodec = (seletor: string) =>
    criarCodecDeCookiesSessaoIsolada(
      { chaveDeSelagem: configuracao.chaveSelagemCookie, transporte: 'https' },
      seletor,
    );

  async function lerComandoComCookie(
    request: Request,
    rota: 'renovarSessao' | 'sairSessao',
  ): Promise<Readonly<{ usuarioId: string; sessionId: string }>> {
    const contrato = contratosRotas[rota];
    const url = new URL(request.url);
    if (
      request.method !== contrato.metodo ||
      url.pathname !== contrato.caminho ||
      url.search !== ''
    ) {
      throw new ErroTransporteSessao('entrada_invalida');
    }
    const seletor = request.headers.get('x-sessao') ?? '';
    let codec: ReturnType<typeof criarCodec>;
    try {
      codec = criarCodec(seletor);
    } catch {
      throw new ErroTransporteSessao('nao_autenticado');
    }
    conferirCookies(request.headers.get('cookie') ?? '', seletor);
    if (
      !(await verificarProtecaoDeComando({
        origem: request.headers.get('origin'),
        csrfCabecalho: request.headers.get('x-csrf'),
        cookieCsrf: request.headers.get('cookie'),
        origensPermitidas: configuracao.origensPermitidas,
        codec,
      }))
    ) {
      throw new ErroTransporteSessao('sem_permissao');
    }
    const corpo = await lerJsonLimitado(request);
    if (!contrato.entrada.safeParse(corpo).success) {
      throw new ErroTransporteSessao('entrada_invalida');
    }
    const conteudo = await codec.abrirSessao(request.headers.get('cookie') ?? '');
    if (conteudo === null) throw new ErroTransporteSessao('nao_autenticado');
    let dados: unknown;
    try {
      dados = JSON.parse(conteudo);
    } catch {
      throw new ErroTransporteSessao('nao_autenticado');
    }
    if (typeof dados !== 'object' || dados === null || Array.isArray(dados)) {
      throw new ErroTransporteSessao('nao_autenticado');
    }
    const envelope = dados as Record<string, unknown>;
    const csrfRecebido = request.headers.get('x-csrf');
    if (
      Object.keys(envelope).length !== 4 ||
      envelope.versao !== 2 ||
      typeof envelope.csrf !== 'string' ||
      !uuidSchema.safeParse(envelope.usuarioId).success ||
      !uuidSchema.safeParse(envelope.sessionId).success ||
      csrfRecebido === null ||
      !compararCsrfEmTempoConstante(csrfRecebido, envelope.csrf)
    ) {
      throw new ErroTransporteSessao('nao_autenticado');
    }
    const contexto = Object.freeze({
      usuarioId: envelope.usuarioId as string,
      sessionId: envelope.sessionId as string,
    });
    contextos.set(contexto, {
      seletor,
      rota,
      usuarioId: contexto.usuarioId,
      sessionId: contexto.sessionId,
      csrf: envelope.csrf as string,
    });
    return contexto;
  }

  async function lerIdentidadeDaConsulta(request: Request) {
    const url = new URL(request.url);
    if (
      request.method !== 'GET' ||
      url.pathname !== contratosRotas.sessaoAtual.caminho ||
      url.search !== ''
    ) {
      throw new ErroTransporteSessao('entrada_invalida');
    }
    const bearer = /^Bearer ([A-Za-z0-9_.-]+)$/i.exec(request.headers.get('authorization') ?? '');
    if (!bearer?.[1]) throw new ErroTransporteSessao('nao_autenticado');
    const claims = await validarJwtDeSessao(bearer[1], opcoes.configuracaoJwt);
    return Object.freeze(
      Object.defineProperty({ ...claims }, 'jwt', { value: bearer[1], enumerable: false }),
    ) as typeof claims & { readonly jwt: string };
  }

  /** Chamar somente após admissão/rechecagem na autoridade local, nunca com corpo HTTP. */
  async function emitirEntrada(
    entrada: Readonly<{
      sessao: unknown;
      accessToken: string;
    }>,
    seletor: string,
    identidadeEsperada?: Readonly<{ usuarioId: string; sessionId: string }>,
  ): Promise<Response> {
    if (Object.keys(entrada).some((chave) => chave !== 'sessao' && chave !== 'accessToken')) {
      throw new TypeError('Resposta de sessão inválida.');
    }
    const accessToken = entrada.accessToken;
    const sessao = sessaoAtualSchema.parse(entrada.sessao);
    const claims = await validarJwtDeSessao(accessToken, opcoes.configuracaoJwt);
    if (
      identidadeEsperada &&
      (claims.usuarioId !== identidadeEsperada.usuarioId ||
        claims.sessionId !== identidadeEsperada.sessionId)
    ) {
      throw new ErroTransporteSessao('nao_autenticado');
    }
    const codec = criarCodec(seletor);
    const protecao = await emitirProtecaoCsrf(codec);
    const dados = entradaSessaoRespostaSchema.parse({
      sessao,
      access_token: accessToken,
      csrf: protecao.csrf,
      seletor_sessao: seletor,
    });
    if (dados.sessao.usuario.id !== claims.usuarioId || !dados.sessao.usuario.ativo) {
      throw new ErroTransporteSessao('nao_autenticado');
    }
    const resposta = respostaJson({ dados, request_id: crypto.randomUUID() });
    // Vincula a identidade selada ao CSRF emitido na mesma resposta.
    const sessaoSelada = await codec.selarSessao(
      JSON.stringify({
        versao: 2,
        csrf: protecao.csrf,
        usuarioId: claims.usuarioId,
        sessionId: claims.sessionId,
      }),
    );
    if (new TextEncoder().encode(sessaoSelada).byteLength > 4_096) {
      throw new TypeError('Resposta de sessão inválida.');
    }
    resposta.headers.append('Set-Cookie', sessaoSelada);
    resposta.headers.append('Set-Cookie', protecao.setCookie);
    return resposta;
  }

  function responderEntrada(entrada: Parameters<typeof emitirEntrada>[0]): Promise<Response> {
    return emitirEntrada(entrada, crypto.randomUUID());
  }

  async function responderRenovacao(
    entrada: Parameters<typeof emitirEntrada>[0],
    contexto: object,
  ): Promise<Response> {
    const verificado = contextos.get(contexto);
    if (!verificado || verificado.rota !== 'renovarSessao') {
      throw new ErroTransporteSessao('nao_autenticado');
    }
    contextos.delete(contexto);
    if (Object.keys(entrada).some((chave) => chave !== 'sessao' && chave !== 'accessToken')) {
      throw new TypeError('Resposta de sessão inválida.');
    }
    const accessToken = entrada.accessToken;
    const sessao = sessaoAtualSchema.parse(entrada.sessao);
    const claims = await validarJwtDeSessao(accessToken, opcoes.configuracaoJwt);
    if (claims.usuarioId !== verificado.usuarioId || claims.sessionId !== verificado.sessionId) {
      throw new ErroTransporteSessao('nao_autenticado');
    }
    const dados = entradaSessaoRespostaSchema.parse({
      sessao,
      access_token: accessToken,
      csrf: verificado.csrf,
      seletor_sessao: verificado.seletor,
    });
    if (dados.sessao.usuario.id !== claims.usuarioId || !dados.sessao.usuario.ativo) {
      throw new ErroTransporteSessao('nao_autenticado');
    }
    return respostaJson({ dados, request_id: crypto.randomUUID() });
  }

  /** O chamador precisa já ter persistido revogação local; isto apenas serializa o resultado. */
  function responderSaida(resultado: unknown, contexto: object): Response {
    const verificado = contextos.get(contexto);
    if (!verificado || verificado.rota !== 'sairSessao')
      throw new ErroTransporteSessao('nao_autenticado');
    contextos.delete(contexto);
    const dados = saidaSessaoSchema.parse(resultado);
    const codec = criarCodec(verificado.seletor);
    const resposta = respostaJson({ dados, request_id: crypto.randomUUID() });
    resposta.headers.append('Set-Cookie', codec.limparSessao());
    resposta.headers.append('Set-Cookie', codec.limparCsrf());
    return resposta;
  }

  return Object.freeze({
    lerComandoComCookie,
    lerIdentidadeDaConsulta,
    responderEntrada,
    responderRenovacao,
    responderSaida,
    responderFalha: responderFalhaHttpSessao,
  });
}
