import { contratosRotas } from '../../../../packages/contracts/src/rotas.ts';
import {
  criarErroPublicoSemCampos,
  statusErroHttp,
} from '../../../../packages/contracts/src/erros.ts';
import { responderFalhaHttpSessao } from './http.ts';
import { ErroEntradaGoogleNegada } from '../../../../supabase/functions/_shared/identidade/entrada-google-admissao.ts';
import { ErroIdTokenGoogleInvalido } from '../../../../supabase/functions/_shared/identidade/google-id-token.ts';
import { ErroDesafioGoogleInvalido } from '../../../../supabase/functions/_shared/identidade/desafio-google.ts';
import {
  carregarConfiguracao,
  type FonteDeConfiguracao,
} from '../../../../supabase/functions/_shared/configuracao.ts';
import {
  criarCodecDeCookiesDesafioIsolado,
  verificarProtecaoDeEntrada,
} from '../../../../supabase/functions/_shared/sessao/nucleo.ts';

class ErroEntradaGoogle extends Error {
  constructor(
    readonly codigo: 'entrada_invalida' | 'sem_permissao' | 'nao_autenticado' = 'entrada_invalida',
  ) {
    super('Entrada Google recusada.');
  }
}

export function responderFalhaEntradaGoogle(erro: unknown): Response {
  const falha =
    erro instanceof ErroEntradaGoogleNegada ||
    erro instanceof ErroIdTokenGoogleInvalido ||
    erro instanceof ErroDesafioGoogleInvalido
      ? new ErroEntradaGoogle('nao_autenticado')
      : erro;
  if (!(falha instanceof ErroEntradaGoogle)) return responderFalhaHttpSessao(falha);
  return Response.json(criarErroPublicoSemCampos(falha.codigo, crypto.randomUUID()), {
    status: statusErroHttp[falha.codigo],
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

/** Somente leitor: nonce não é aberto aqui, nem há admissão ou rota pública. */
export function criarLeitorEntradaGoogle(fonte: FonteDeConfiguracao) {
  const config = carregarConfiguracao('sessao', fonte);
  return async (
    request: Request,
  ): Promise<Readonly<{ desafioId: string; idToken: string; nonceSelado: string }>> => {
    try {
      const url = new URL(request.url);
      if (
        request.method !== 'POST' ||
        url.pathname !== contratosRotas.entrarGoogle.caminho ||
        url.search !== ''
      )
        throw new ErroEntradaGoogle();
      const cookie = request.headers.get('cookie') ?? '';
      const seletor = request.headers.get('x-desafio') ?? '';
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(seletor))
        throw new ErroEntradaGoogle('sem_permissao');
      const codec = criarCodecDeCookiesDesafioIsolado(
        { chaveDeSelagem: config.chaveSelagemCookie, transporte: 'https' },
        seletor,
      );
      if (cookie.length > 8192) throw new ErroEntradaGoogle('sem_permissao');
      const partesCookie = cookie.split(';').map((parte) => parte.trim());
      const csrf = partesCookie.filter(
        (parte) => parte.split('=')[0] === `ffcm_csrf_desafio_${seletor}`,
      );
      const nomeNonce = `ffcm_nonce_${seletor}`;
      const nonce = partesCookie.filter((parte) => parte.split('=')[0] === nomeNonce);
      if (csrf.length !== 1 || nonce.length !== 1) throw new ErroEntradaGoogle('sem_permissao');
      const nonceSelado = nonce[0]?.slice(nomeNonce.length + 1) ?? '';
      if (!nonceSelado || nonceSelado.length > 2048 || !/^[A-Za-z0-9_.-]+$/.test(nonceSelado))
        throw new ErroEntradaGoogle('sem_permissao');
      if (
        !(await verificarProtecaoDeEntrada({
          origem: request.headers.get('origin'),
          csrfCabecalho: request.headers.get('x-csrf'),
          cookieCsrf: cookie,
          origensPermitidas: config.origensPermitidas,
          codec,
        }))
      )
        throw new ErroEntradaGoogle('sem_permissao');
      if (
        request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
          'application/json' ||
        !request.body
      )
        throw new ErroEntradaGoogle();
      const leitor = request.body.getReader();
      const partes: Uint8Array[] = [];
      let tamanho = 0;
      let temporizador: ReturnType<typeof setTimeout> | undefined;
      const prazo = new Promise<never>((_, rejeitar) => {
        temporizador = setTimeout(() => rejeitar(new ErroEntradaGoogle()), 5000);
      });
      try {
        while (true) {
          const parte = await Promise.race([leitor.read(), prazo]);
          if (parte.done) break;
          tamanho += parte.value.byteLength;
          if (tamanho > 100_000) throw new ErroEntradaGoogle();
          partes.push(parte.value);
        }
      } catch (erro) {
        void leitor.cancel().catch(() => undefined);
        throw erro;
      } finally {
        clearTimeout(temporizador);
        leitor.releaseLock();
      }
      const bytes = new Uint8Array(tamanho);
      let posicao = 0;
      for (const parte of partes) {
        bytes.set(parte, posicao);
        posicao += parte.length;
      }
      let corpo: unknown;
      try {
        corpo = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      } catch {
        throw new ErroEntradaGoogle();
      }
      const dados = contratosRotas.entrarGoogle.entrada.safeParse(corpo);
      if (!dados.success) throw new ErroEntradaGoogle();
      return Object.freeze(
        Object.defineProperties(
          {},
          {
            desafioId: { value: dados.data.desafio_id },
            idToken: { value: dados.data.credencial },
            nonceSelado: { value: nonceSelado },
          },
        ),
      ) as Readonly<{ desafioId: string; idToken: string; nonceSelado: string }>;
    } catch (erro) {
      if (erro instanceof ErroEntradaGoogle) throw erro;
      throw new Error('Serviço de entrada indisponível.');
    }
  };
}
