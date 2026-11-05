import {
  type ConfiguracaoValidacaoIdTokenGoogle,
  validarIdTokenGoogle,
} from './identidade/google-id-token.ts';

/** Operações OAuth somente para runtime de servidor. State e verificador devem ser
 * guardados com sessão, prazo e consumo único antes de usar a troca de código. */
export type ConfiguracaoOAuthAgenda = Readonly<{
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}>;

const escopo = 'https://www.googleapis.com/auth/calendar.events';
const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

function validarConfiguracao(config: ConfiguracaoOAuthAgenda): void {
  const url = new URL(config.redirectUri);
  if (
    !config.clientId ||
    !config.clientSecret ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Configuração OAuth indisponível.');
}

export async function iniciarConsentimentoAgenda(config: ConfiguracaoOAuthAgenda) {
  validarConfiguracao(config);
  const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const verificador = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const nonce = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificador));
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: `openid email ${escopo}`,
    access_type: 'offline',
    // Reconexões precisam de novo refresh token; ausência continua falha fechada.
    prompt: 'consent',
    state,
    nonce,
    code_challenge: base64url(new Uint8Array(digest)),
    code_challenge_method: 'S256',
  }).toString();
  return { url: url.toString(), state, verificador, nonce };
}

/** Nunca retorna detalhes da resposta de erro do provedor. */
export async function trocarCodigoAgenda(
  config: ConfiguracaoOAuthAgenda,
  codigo: string,
  verificador: string,
  validacao: ConfiguracaoValidacaoIdTokenGoogle,
  subjectEsperado: string,
): Promise<Readonly<{ accessToken: string; refreshToken: string }>> {
  validarConfiguracao(config);
  if (!codigo || codigo.length > 4096 || !/^[A-Za-z0-9_-]{43}$/.test(verificador))
    throw new Error('Consentimento indisponível.');
  const controle = new AbortController();
  const prazo = setTimeout(() => controle.abort(), 15_000);
  try {
    const resposta = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
        code: codigo,
        code_verifier: verificador,
      }),
      redirect: 'error',
      signal: controle.signal,
    });
    if (!resposta.ok) throw new Error();
    const dados: unknown = await resposta.json();
    if (
      typeof dados !== 'object' ||
      dados === null ||
      !('access_token' in dados) ||
      typeof dados.access_token !== 'string' ||
      !dados.access_token ||
      !('refresh_token' in dados) ||
      typeof dados.refresh_token !== 'string' ||
      !dados.refresh_token ||
      !('id_token' in dados) ||
      typeof dados.id_token !== 'string' ||
      !dados.id_token ||
      !('scope' in dados) ||
      typeof dados.scope !== 'string' ||
      !dados.scope.split(' ').includes(escopo)
    )
      throw new Error();
    if (validacao.audienciaEsperada !== config.clientId || !subjectEsperado) throw new Error();
    const identidade = await validarIdTokenGoogle(dados.id_token, validacao);
    if (identidade.subject !== subjectEsperado) throw new Error();
    return { accessToken: dados.access_token, refreshToken: dados.refresh_token };
  } catch {
    throw new Error('Consentimento indisponível.');
  } finally {
    clearTimeout(prazo);
  }
}

/** Renova somente em servidor; credencial de longa duração nunca vai ao navegador. */
export async function renovarAcessoAgenda(
  config: ConfiguracaoOAuthAgenda,
  refreshToken: string,
): Promise<string> {
  validarConfiguracao(config);
  if (!refreshToken || refreshToken.length > 4096) throw new Error('Conexão indisponível.');
  const controle = new AbortController();
  const prazo = setTimeout(() => controle.abort(), 15_000);
  try {
    const resposta = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
      redirect: 'error',
      signal: controle.signal,
    });
    if (!resposta.ok) throw new Error();
    const dados: unknown = await resposta.json();
    if (
      typeof dados !== 'object' ||
      dados === null ||
      !('access_token' in dados) ||
      typeof dados.access_token !== 'string' ||
      !dados.access_token
    )
      throw new Error();
    return dados.access_token;
  } catch {
    throw new Error('Conexão indisponível.');
  } finally {
    clearTimeout(prazo);
  }
}
