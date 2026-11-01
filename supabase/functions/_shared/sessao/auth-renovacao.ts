import { validarJwtDeSessao, type ConfiguracaoJwtSessao } from './nucleo.ts';

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

/**
 * Somente Auth: não coordena renovação, persistência nem autorização local.
 * O chamador restrito deve adquirir fencing persistente antes da troca, cifrar e
 * confirmar o refresh novo antes de liberar accessToken, revalidando autoridade.
 * Qualquer resultado incerto invalida a geração; nunca repetir a credencial.
 */
export function criarRenovadorAuth(
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
  )
    throw new TypeError('Configuração de autenticação inválida.');
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
  return async (
    refresh: string,
    identidade: Readonly<{ usuarioId: string; sessionId: string }>,
  ) => {
    try {
      if (
        typeof refresh !== 'string' ||
        refresh.length === 0 ||
        refresh.length > 4096 ||
        !identidade ||
        typeof identidade.usuarioId !== 'string' ||
        typeof identidade.sessionId !== 'string'
      )
        throw new Error();
      const usuarioId = identidade.usuarioId;
      const sessionId = identidade.sessionId;
      const sinal = AbortSignal.timeout(10_000);
      const requisicao = buscar(`${issuer}/token?grant_type=refresh_token`, {
        method: 'POST',
        redirect: 'error',
        signal: sinal,
        headers: { apikey: chavePublica, 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      }).then((resposta) => {
        if (sinal.aborted && resposta.body) void resposta.body.cancel().catch(() => undefined);
        return resposta;
      });
      const resposta = await comPrazo(requisicao, sinal);
      if (resposta.status !== 200 || !resposta.body) {
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
          if (tamanho > 65_536) throw new Error();
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
      if (!dados || typeof dados !== 'object') throw new Error();
      const corpo = dados as Record<string, unknown>;
      if (
        typeof corpo.access_token !== 'string' ||
        typeof corpo.refresh_token !== 'string' ||
        corpo.refresh_token.length === 0 ||
        corpo.refresh_token.length > 4096 ||
        corpo.token_type !== 'bearer'
      )
        throw new Error();
      const claims = await comPrazo(validarJwtDeSessao(corpo.access_token, configuracaoJwt), sinal);
      if (sinal.aborted || claims.usuarioId !== usuarioId || claims.sessionId !== sessionId)
        throw new Error();
      return { accessToken: corpo.access_token, refreshToken: corpo.refresh_token };
    } catch {
      throw new Error('Não foi possível renovar a sessão.');
    }
  };
}
