import { validarJwtDeSessao, type ConfiguracaoJwtSessao } from '../sessao/nucleo.ts';

const maximoResposta = 65_536;
async function comPrazo<T>(pendente: Promise<T>, sinal: AbortSignal): Promise<T> {
  if (sinal.aborted) {
    void pendente.catch(() => undefined);
    throw new Error();
  }
  let abortar: (() => void) | undefined;
  const expiracao = new Promise<never>((_, rejeitar) => {
    abortar = () => rejeitar(new Error());
    sinal.addEventListener('abort', abortar, { once: true });
  });
  try {
    return await Promise.race([pendente, expiracao]);
  } finally {
    if (abortar) sinal.removeEventListener('abort', abortar);
  }
}

export class ErroAutenticacaoNegada extends Error {
  constructor(contexto: 'auth' | 'entrada' = 'auth') {
    super(
      contexto === 'auth'
        ? 'Autenticação técnica indisponível ou inválida.'
        : 'Não foi possível concluir a entrada técnica.',
    );
  }
}

/** Apenas servidor: autenticar não concede acesso nem admite sessão. */
export function criarAutenticadorTecnico(
  opcoes: Readonly<{
    projeto: string;
    chavePublica: string;
    configuracaoJwt: ConfiguracaoJwtSessao;
    buscar?: typeof fetch;
  }>,
) {
  if (
    !/^[a-z0-9]{1,64}$/.test(opcoes.projeto) ||
    !/^[\x21-\x7e]{1,4096}$/.test(opcoes.chavePublica)
  ) {
    throw new TypeError('Configuração de autenticação inválida.');
  }
  const issuer = `https://${opcoes.projeto}.supabase.co/auth/v1`;
  if (opcoes.configuracaoJwt.issuer !== issuer)
    throw new TypeError('Configuração de autenticação inválida.');
  const chave = opcoes.configuracaoJwt.chaveDeVerificacao;
  const configuracaoJwt: ConfiguracaoJwtSessao = {
    issuer,
    audience: opcoes.configuracaoJwt.audience,
    algoritmosPermitidos: [...opcoes.configuracaoJwt.algoritmosPermitidos],
    chaveDeVerificacao:
      chave instanceof Uint8Array
        ? new Uint8Array(chave)
        : 'kty' in chave
          ? structuredClone(chave)
          : chave,
  };
  const chavePublica = opcoes.chavePublica;
  const buscar = opcoes.buscar ?? fetch;
  return async (entrada: Readonly<{ email: string; senha: string }>) => {
    try {
      if (
        typeof entrada.email !== 'string' ||
        entrada.email.length < 3 ||
        entrada.email.length > 320 ||
        typeof entrada.senha !== 'string' ||
        entrada.senha.length === 0 ||
        entrada.senha.length > 1024
      ) {
        throw new Error();
      }
      const sinal = AbortSignal.timeout(10_000);
      const requisicao = buscar(`${issuer}/token?grant_type=password`, {
        method: 'POST',
        redirect: 'error',
        signal: sinal,
        headers: { apikey: chavePublica, 'content-type': 'application/json' },
        body: JSON.stringify({ email: entrada.email, password: entrada.senha }),
      }).then((resposta) => {
        if (sinal.aborted && resposta.body) void resposta.body.cancel().catch(() => undefined);
        return resposta;
      });
      const resposta = await comPrazo(requisicao, sinal);
      if (
        !resposta.body ||
        (resposta.status !== 200 && ![400, 401, 403].includes(resposta.status))
      ) {
        if (resposta.body) void resposta.body.cancel().catch(() => undefined);
        throw new Error();
      }
      const leitor = resposta.body.getReader();
      const partes: Uint8Array[] = [];
      let tamanho = 0;
      try {
        while (true) {
          const { done, value } = await comPrazo(leitor.read(), sinal);
          if (done) break;
          tamanho += value.byteLength;
          if (tamanho > maximoResposta) throw new Error();
          partes.push(value);
        }
      } catch {
        void leitor.cancel().catch(() => undefined);
        throw new Error();
      } finally {
        leitor.releaseLock();
      }
      const bytes = new Uint8Array(tamanho);
      let posicao = 0;
      for (const parte of partes) {
        bytes.set(parte, posicao);
        posicao += parte.length;
      }
      const dados: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (sinal.aborted) throw new Error();
      if (!dados || typeof dados !== 'object') throw new Error();
      const respostaAuth = dados as Record<string, unknown>;
      if (resposta.status !== 200) {
        if (
          ['invalid_credentials', 'email_not_confirmed', 'user_banned'].includes(
            String(respostaAuth.error_code),
          )
        )
          throw new ErroAutenticacaoNegada();
        throw new Error();
      }
      if (
        typeof respostaAuth.access_token !== 'string' ||
        typeof respostaAuth.refresh_token !== 'string' ||
        respostaAuth.refresh_token.length === 0 ||
        respostaAuth.refresh_token.length > 4096 ||
        respostaAuth.token_type !== 'bearer'
      )
        throw new Error();
      const claims = await comPrazo(
        validarJwtDeSessao(respostaAuth.access_token, configuracaoJwt),
        sinal,
      );
      const usuario = respostaAuth.user;
      if (
        sinal.aborted ||
        !usuario ||
        typeof usuario !== 'object' ||
        (usuario as Record<string, unknown>).id !== claims.usuarioId
      )
        throw new Error();
      return {
        ...claims,
        accessToken: respostaAuth.access_token,
        refreshToken: respostaAuth.refresh_token,
      };
    } catch (erro) {
      if (erro instanceof ErroAutenticacaoNegada) throw erro;
      throw new Error('Autenticação técnica indisponível ou inválida.');
    }
  };
}
