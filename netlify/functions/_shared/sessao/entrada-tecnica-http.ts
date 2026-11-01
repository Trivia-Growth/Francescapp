import { contratosRotas } from '../../../../packages/contracts/src/rotas.ts';
import {
  carregarConfiguracao,
  type FonteDeConfiguracao,
} from '../../../../supabase/functions/_shared/configuracao.ts';
import {
  criarCodecDeCookiesDesafioIsolado,
  verificarProtecaoDeEntrada,
} from '../../../../supabase/functions/_shared/sessao/nucleo.ts';
import {
  criarErroPublicoSemCampos,
  statusErroHttp,
} from '../../../../packages/contracts/src/erros.ts';
import { responderFalhaHttpSessao } from './http.ts';
import { ErroAutenticacaoNegada } from '../../../../supabase/functions/_shared/identidade/auth-tecnica.ts';

class ErroEntradaTecnica extends Error {
  constructor(readonly codigo: 'entrada_invalida' | 'sem_permissao' = 'entrada_invalida') {
    super('Entrada técnica recusada.');
  }
}

/** O gateway ainda deve limitar chunks e tempo antes de alocá-los em memória. */
export function responderFalhaEntradaTecnica(erro: unknown): Response {
  if (erro instanceof ErroAutenticacaoNegada) {
    return Response.json(criarErroPublicoSemCampos('nao_autenticado', crypto.randomUUID()), {
      status: 401,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }
  if (!(erro instanceof ErroEntradaTecnica)) return responderFalhaHttpSessao(erro);
  return Response.json(criarErroPublicoSemCampos(erro.codigo, crypto.randomUUID()), {
    status: statusErroHttp[erro.codigo],
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

/** Apenas valida e extrai credenciais transitórias; não cria endpoint nem admite sessão. */
export function criarLeitorEntradaTecnica(fonte: FonteDeConfiguracao) {
  const configuracao = carregarConfiguracao('sessao', fonte);
  return async (request: Request): Promise<Readonly<{ email: string; senha: string }>> => {
    try {
      const url = new URL(request.url);
      if (
        request.method !== 'POST' ||
        url.pathname !== contratosRotas.entrarTecnico.caminho ||
        url.search !== ''
      )
        throw new ErroEntradaTecnica();
      const cookie = request.headers.get('cookie') ?? '';
      const seletor = request.headers.get('x-desafio') ?? '';
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(seletor))
        throw new ErroEntradaTecnica('sem_permissao');
      const codec = criarCodecDeCookiesDesafioIsolado(
        { chaveDeSelagem: configuracao.chaveSelagemCookie, transporte: 'https' },
        seletor,
      );
      if (
        cookie.length > 8192 ||
        cookie
          .split(';')
          .filter((parte) => parte.trim().split('=')[0] === `ffcm_csrf_desafio_${seletor}`)
          .length !== 1
      )
        throw new ErroEntradaTecnica('sem_permissao');
      if (
        !(await verificarProtecaoDeEntrada({
          origem: request.headers.get('origin'),
          csrfCabecalho: request.headers.get('x-csrf'),
          cookieCsrf: cookie,
          origensPermitidas: configuracao.origensPermitidas,
          codec,
        }))
      )
        throw new ErroEntradaTecnica('sem_permissao');
      if (
        request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
          'application/json' ||
        !request.body
      )
        throw new ErroEntradaTecnica();
      const leitor = request.body.getReader();
      const partes: Uint8Array[] = [];
      let tamanho = 0;
      let temporizador: ReturnType<typeof setTimeout> | undefined;
      const expiracao = new Promise<never>((_, rejeitar) => {
        temporizador = setTimeout(() => rejeitar(new ErroEntradaTecnica()), 5000);
      });
      try {
        while (true) {
          const { done, value } = await Promise.race([leitor.read(), expiracao]);
          if (done) break;
          tamanho += value.byteLength;
          if (tamanho > 16_384) throw new ErroEntradaTecnica();
          partes.push(value);
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
        throw new ErroEntradaTecnica();
      }
      const resultado = contratosRotas.entrarTecnico.entrada.safeParse(corpo);
      if (!resultado.success) throw new ErroEntradaTecnica();
      const validado = resultado.data;
      return Object.freeze(
        Object.defineProperties(
          {},
          {
            email: { value: validado.email, enumerable: false },
            senha: { value: validado.senha, enumerable: false },
          },
        ),
      ) as Readonly<{ email: string; senha: string }>;
    } catch (erro) {
      if (erro instanceof ErroEntradaTecnica) throw erro;
      throw new Error('Serviço de entrada indisponível.');
    }
  };
}
