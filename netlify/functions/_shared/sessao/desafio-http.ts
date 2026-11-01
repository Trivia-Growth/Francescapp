import { contratosRotas } from '../../../../packages/contracts/src/rotas.ts';
import {
  criarErroPublicoSemCampos,
  statusErroHttp,
  type CodigoErro,
} from '../../../../packages/contracts/src/erros.ts';
import {
  carregarConfiguracao,
  type FonteDeConfiguracao,
} from '../../../../supabase/functions/_shared/configuracao.ts';
import type { criarDesafiosGoogle } from '../../../../supabase/functions/_shared/identidade/desafio-google.ts';
import {
  criarCodecDeCookiesDesafioIsolado,
  emitirProtecaoCsrfDesafio,
} from '../../../../supabase/functions/_shared/sessao/nucleo.ts';
import { responderFalhaHttpSessao } from './http.ts';

class ErroDesafioHttp extends Error {
  constructor(readonly codigo: CodigoErro) {
    super('Desafio recusado.');
  }
}

// Apenas proteção contra acúmulo observado no navegador; não é quota nem rate limit.
// Requisições simultâneas podem observar o mesmo cabeçalho e exceder este limite.
function limitarDesafiosObservados(request: Request): void {
  const cookie = request.headers.get('cookie') ?? '';
  if (cookie.length > 4096) throw new ErroDesafioHttp('limite_excedido');
  const seletores = new Set<string>();
  for (const parte of cookie.split(';')) {
    const nome = parte.trim().split('=', 1)[0] ?? '';
    const encontrado =
      /^(?:ffcm_csrf_desafio_|ffcm_nonce_)([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.exec(
        nome,
      );
    if (encontrado?.[1]) seletores.add(encontrado[1]);
  }
  if (seletores.size >= 3) throw new ErroDesafioHttp('limite_excedido');
}

/** Não exposto: emissão CSRF técnica sem criar desafio ou nonce Google. */
export function criarHandlerDesafioTecnico(dependencias: Readonly<{ fonte: FonteDeConfiguracao }>) {
  const config = carregarConfiguracao('sessao', dependencias.fonte);
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      if (
        request.method !== 'POST' ||
        url.pathname !== contratosRotas.desafioTecnico.caminho ||
        url.search !== ''
      )
        throw new ErroDesafioHttp('entrada_invalida');
      const origem = request.headers.get('origin');
      if (!origem || !config.origensPermitidas.includes(origem))
        throw new ErroDesafioHttp('sem_permissao');
      if (
        request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
          'application/json' ||
        !request.body
      )
        throw new ErroDesafioHttp('entrada_invalida');
      const leitor = request.body.getReader();
      const bytes = new Uint8Array(4096);
      let tamanho = 0;
      let temporizador: ReturnType<typeof setTimeout> | undefined;
      const expiracao = new Promise<never>((_, rejeitar) => {
        temporizador = setTimeout(() => rejeitar(new ErroDesafioHttp('entrada_invalida')), 5000);
      });
      try {
        while (true) {
          const parte = await Promise.race([leitor.read(), expiracao]);
          if (parte.done) break;
          tamanho += parte.value.byteLength;
          if (tamanho > bytes.length) throw new ErroDesafioHttp('entrada_invalida');
          bytes.set(parte.value, tamanho - parte.value.byteLength);
        }
      } catch (erro) {
        void leitor.cancel().catch(() => undefined);
        throw erro;
      } finally {
        clearTimeout(temporizador);
        leitor.releaseLock();
      }
      let corpo: unknown;
      try {
        corpo = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, tamanho)),
        );
      } catch {
        throw new ErroDesafioHttp('entrada_invalida');
      }
      if (!contratosRotas.desafioTecnico.entrada.safeParse(corpo).success)
        throw new ErroDesafioHttp('entrada_invalida');
      limitarDesafiosObservados(request);
      let limite: ReturnType<typeof setTimeout> | undefined;
      const prazo = new Promise<never>((_, rejeitar) => {
        limite = setTimeout(() => rejeitar(new Error()), 5000);
      });
      const seletor = crypto.randomUUID();
      const codec = criarCodecDeCookiesDesafioIsolado(
        { chaveDeSelagem: config.chaveSelagemCookie, transporte: 'https' },
        seletor,
      );
      let protecao: Awaited<ReturnType<typeof emitirProtecaoCsrfDesafio>>;
      try {
        protecao = await Promise.race([emitirProtecaoCsrfDesafio(codec), prazo]);
      } finally {
        clearTimeout(limite);
      }
      const dados = contratosRotas.desafioTecnico.saida.parse({
        csrf: protecao.csrf,
        seletor_desafio: seletor,
      });
      const resposta = Response.json(
        { dados, request_id: crypto.randomUUID() },
        { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } },
      );
      resposta.headers.append('Set-Cookie', protecao.setCookie);
      return resposta;
    } catch (erro) {
      if (!(erro instanceof ErroDesafioHttp)) return responderFalhaHttpSessao(erro);
      return Response.json(criarErroPublicoSemCampos(erro.codigo, crypto.randomUUID()), {
        status: statusErroHttp[erro.codigo],
        headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
      });
    }
  };
}

/** Handler ainda não exposto; requer quota/limpeza de desafios no servidor,
 * repositório real e revisão antes de integrar. Origem não é rate limiting.
 * Um registro tardio após timeout pode precisar de limpeza operacional. */
export function criarHandlerDesafio(
  dependencias: Readonly<{
    fonte: FonteDeConfiguracao;
    desafios: ReturnType<typeof criarDesafiosGoogle>;
  }>,
) {
  const config = carregarConfiguracao('sessao', dependencias.fonte);
  const emitir = dependencias.desafios.emitir.bind(dependencias.desafios);
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      if (
        request.method !== 'POST' ||
        url.pathname !== contratosRotas.desafioGoogle.caminho ||
        url.search !== ''
      )
        throw new ErroDesafioHttp('entrada_invalida');
      const origem = request.headers.get('origin');
      if (!origem || !config.origensPermitidas.includes(origem))
        throw new ErroDesafioHttp('sem_permissao');
      if (
        request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
          'application/json' ||
        !request.body
      )
        throw new ErroDesafioHttp('entrada_invalida');
      const leitor = request.body.getReader();
      const bytes = new Uint8Array(4096);
      let tamanho = 0;
      let temporizador: ReturnType<typeof setTimeout> | undefined;
      const expiracao = new Promise<never>((_, rejeitar) => {
        temporizador = setTimeout(() => rejeitar(new ErroDesafioHttp('entrada_invalida')), 5000);
      });
      try {
        while (true) {
          const parte = await Promise.race([leitor.read(), expiracao]);
          if (parte.done) break;
          tamanho += parte.value.byteLength;
          if (tamanho > bytes.length) throw new ErroDesafioHttp('entrada_invalida');
          bytes.set(parte.value, tamanho - parte.value.byteLength);
        }
      } catch (erro) {
        void leitor.cancel().catch(() => undefined);
        throw erro;
      } finally {
        clearTimeout(temporizador);
        leitor.releaseLock();
      }
      let corpo: unknown;
      try {
        corpo = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, tamanho)),
        );
      } catch {
        throw new ErroDesafioHttp('entrada_invalida');
      }
      if (!contratosRotas.desafioGoogle.entrada.safeParse(corpo).success)
        throw new ErroDesafioHttp('entrada_invalida');
      limitarDesafiosObservados(request);
      let limiteEmissao: ReturnType<typeof setTimeout> | undefined;
      const expiracaoEmissao = new Promise<never>((_, rejeitar) => {
        limiteEmissao = setTimeout(() => rejeitar(new Error()), 5000);
      });
      const seletor = crypto.randomUUID();
      const codec = criarCodecDeCookiesDesafioIsolado(
        { chaveDeSelagem: config.chaveSelagemCookie, transporte: 'https' },
        seletor,
      );
      let desafio: Awaited<ReturnType<typeof emitir>>;
      let protecao: Awaited<ReturnType<typeof emitirProtecaoCsrfDesafio>>;
      try {
        [desafio, protecao] = await Promise.race([
          Promise.all([emitir(), emitirProtecaoCsrfDesafio(codec)]),
          expiracaoEmissao,
        ]);
      } finally {
        clearTimeout(limiteEmissao);
      }
      if (
        typeof desafio.nonceSelado !== 'string' ||
        desafio.nonceSelado.length > 2048 ||
        !/^[A-Za-z0-9_.-]+$/.test(desafio.nonceSelado)
      )
        throw new Error();
      const dados = contratosRotas.desafioGoogle.saida.parse({
        ...desafio.publico,
        csrf: protecao.csrf,
        seletor_desafio: seletor,
      });
      if (Date.parse(dados.expira_em) <= Date.now()) throw new Error();
      const resposta = Response.json(
        { dados, request_id: crypto.randomUUID() },
        { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } },
      );
      resposta.headers.append('Set-Cookie', protecao.setCookie);
      resposta.headers.append(
        'Set-Cookie',
        `ffcm_nonce_${seletor}=${desafio.nonceSelado}; Path=/api/sessao; HttpOnly; Secure; SameSite=Lax; Max-Age=300`,
      );
      return resposta;
    } catch (erro) {
      if (!(erro instanceof ErroDesafioHttp)) return responderFalhaHttpSessao(erro);
      return Response.json(criarErroPublicoSemCampos(erro.codigo, crypto.randomUUID()), {
        status: statusErroHttp[erro.codigo],
        headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
      });
    }
  };
}
