import { validarJwtDeSessao, type ConfiguracaoJwtSessao } from '../sessao/nucleo.ts';
import {
  validarIdTokenGoogle,
  ErroIdTokenGoogleInvalido,
  type ConfiguracaoValidacaoIdTokenGoogle,
} from './google-id-token.ts';
import type { criarValidadorGoogleComJwks } from './google-jwks.ts';

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

/** Troca server-only, não consome desafio nem concede perfil/sessão local.
 * O Auth atual serializa ProviderID em identities[].id; o formato e a versão
 * do ambiente real ainda não foram comprovados. O endpoint pode provisionar
 * conta e o resultado pode ser incerto: não ligar antes de revisar política de
 * pré-concessão, configuração do provedor e S-02. */
export function criarTrocaGoogle(
  opcoes: Readonly<{
    projeto: string;
    chavePublica: string;
    google: Omit<ConfiguracaoValidacaoIdTokenGoogle, 'nonceEsperado' | 'chaveDeVerificacao'> &
      (
        | { chaveDeVerificacao: ConfiguracaoValidacaoIdTokenGoogle['chaveDeVerificacao'] }
        | { validar: ReturnType<typeof criarValidadorGoogleComJwks> }
      );
    configuracaoJwt: ConfiguracaoJwtSessao;
    buscar?: typeof fetch;
  }>,
) {
  if (
    !/^[a-z0-9]{1,64}$/.test(opcoes.projeto) ||
    !/^[\x21-\x7e]{1,4096}$/.test(opcoes.chavePublica)
  )
    throw new TypeError('Configuração Google indisponível.');
  const issuer = `https://${opcoes.projeto}.supabase.co/auth/v1`;
  if (opcoes.configuracaoJwt.issuer !== issuer)
    throw new TypeError('Configuração Google indisponível.');
  const copiarChave = <T>(chave: T): T =>
    chave instanceof Uint8Array
      ? (new Uint8Array(chave) as T)
      : typeof chave === 'object' && chave !== null && 'kty' in chave
        ? structuredClone(chave)
        : chave;
  const jwtConfig: ConfiguracaoJwtSessao = {
    issuer,
    audience: opcoes.configuracaoJwt.audience,
    algoritmosPermitidos: [...opcoes.configuracaoJwt.algoritmosPermitidos],
    chaveDeVerificacao: copiarChave(opcoes.configuracaoJwt.chaveDeVerificacao),
  };
  const google = {
    audienciaEsperada: opcoes.google.audienciaEsperada,
    dominioWorkspace: opcoes.google.dominioWorkspace,
  };
  const validarGoogle = (() => {
    if ('validar' in opcoes.google) return opcoes.google.validar;
    const chaveGoogle = copiarChave(opcoes.google.chaveDeVerificacao);
    return (token: string, config: typeof google & { nonceEsperado: string }) =>
      validarIdTokenGoogle(token, { ...config, chaveDeVerificacao: chaveGoogle });
  })();
  const chavePublica = opcoes.chavePublica;
  const buscar = opcoes.buscar ?? fetch;
  return async (
    entrada: Readonly<{ idToken: string; nonce: string }>,
    sinalExterno?: AbortSignal,
  ) => {
    try {
      const { idToken, nonce } = entrada;
      if (typeof nonce !== 'string' || !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(nonce))
        throw new Error();
      const prazo = AbortSignal.timeout(10_000);
      const sinal = sinalExterno ? AbortSignal.any([prazo, sinalExterno]) : prazo;
      if (sinal.aborted) throw new Error();
      const bytesHash = new Uint8Array(
        await comPrazo(crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce)), sinal),
      );
      const nonceHash = Array.from(bytesHash, (byte) => byte.toString(16).padStart(2, '0')).join(
        '',
      );
      const identidadeGoogle = await comPrazo(
        validarGoogle(idToken, { ...google, nonceEsperado: nonceHash }),
        sinal,
      );
      if (sinal.aborted) throw new Error();
      const requisicao = buscar(`${issuer}/token?grant_type=id_token`, {
        method: 'POST',
        redirect: 'error',
        signal: sinal,
        headers: { apikey: chavePublica, 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'google', id_token: idToken, nonce }),
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
      const resultado = dados as Record<string, unknown>;
      if (
        typeof resultado.access_token !== 'string' ||
        typeof resultado.refresh_token !== 'string' ||
        resultado.refresh_token.length === 0 ||
        resultado.refresh_token.length > 4096 ||
        resultado.token_type !== 'bearer'
      )
        throw new Error();
      const claims = await comPrazo(validarJwtDeSessao(resultado.access_token, jwtConfig), sinal);
      if (sinal.aborted) throw new Error();
      const user = resultado.user;
      if (!user || typeof user !== 'object') throw new Error();
      const registro = user as Record<string, unknown>;
      if (
        registro.id !== claims.usuarioId ||
        !Array.isArray(registro.identities) ||
        registro.identities.length > 100
      )
        throw new Error();
      const identidades = registro.identities.filter((item: unknown) => {
        if (!item || typeof item !== 'object') return false;
        const identidade = item as Record<string, unknown>;
        const data = identidade.identity_data;
        return (
          identidade.provider === 'google' &&
          identidade.id === identidadeGoogle.subject &&
          identidade.user_id === claims.usuarioId &&
          data !== null &&
          typeof data === 'object' &&
          (data as Record<string, unknown>).sub === identidadeGoogle.subject
        );
      });
      if (identidades.length !== 1) throw new Error();
      const saida = { ...claims } as typeof claims & {
        subjectGoogle: string;
        emailGoogle: string;
        accessToken: string;
        refreshToken: string;
      };
      Object.defineProperties(saida, {
        subjectGoogle: { value: identidadeGoogle.subject },
        emailGoogle: { value: identidadeGoogle.email },
        accessToken: { value: resultado.access_token },
        refreshToken: { value: resultado.refresh_token },
      });
      return saida;
    } catch (erro) {
      if (erro instanceof ErroIdTokenGoogleInvalido) throw erro;
      throw new Error('Troca Google indisponível ou inválida.');
    }
  };
}
