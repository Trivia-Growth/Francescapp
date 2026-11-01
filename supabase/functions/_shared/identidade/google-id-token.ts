import {
  decodeProtectedHeader,
  errors,
  jwtVerify,
  type JWTVerifyGetKey,
  type KeyInput,
} from 'jose';

const tamanhoMaximoIdToken = 16_384;
const tamanhoMinimoNonce = 32;
const tamanhoMaximoNonce = 512;
const tamanhoMaximoSubject = 255;
const tamanhoMaximoEmail = 254;
// Margem técnica para pequenas diferenças entre relógios, sem estender expiração.
const toleranciaEmissaoSegundos = 60;
const algoritmosGooglePermitidos = ['RS256'] as const;
const issuersGooglePermitidos = ['https://accounts.google.com', 'accounts.google.com'] as const;
const nonceBase64Url = /^[A-Za-z0-9_-]+$/;
const subjectGoogle = /^[\x21-\x7E]+$/;
const email =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const dominioWorkspace = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * A chave deve vir de um adapter server-side que administra a rotação do JWKS.
 * Este núcleo não busca rede nem recebe chave, perfil ou domínio do navegador.
 */
export type ConfiguracaoValidacaoIdTokenGoogle = Readonly<{
  audienciaEsperada: string;
  dominioWorkspace: string;
  nonceEsperado: string;
  chaveDeVerificacao: KeyInput | JWTVerifyGetKey;
}>;

/** Prova criptográfica, não autorização e nem perfil da pessoa. */
export type IdentidadeGoogleVerificada = Readonly<{
  subject: string;
  email: string;
  dominioWorkspace: string;
}>;

export class ErroIdTokenGoogleInvalido extends Error {
  constructor() {
    super('ID token Google inválido.');
    this.name = 'ErroIdTokenGoogleInvalido';
  }
}

/** Não revela variável, chave, domínio ou detalhe interno da configuração. */
export class ErroConfiguracaoValidacaoGoogleInvalida extends Error {
  constructor() {
    super('Configuração de validação Google indisponível.');
    this.name = 'ErroConfiguracaoValidacaoGoogleInvalida';
  }
}

function valorSemEspacos(valor: unknown, tamanhoMaximo: number): valor is string {
  return (
    typeof valor === 'string' &&
    valor.length > 0 &&
    valor.length <= tamanhoMaximo &&
    valor.trim() === valor &&
    !/\s/.test(valor)
  );
}

function nonceValido(valor: unknown): valor is string {
  return (
    valorSemEspacos(valor, tamanhoMaximoNonce) &&
    valor.length >= tamanhoMinimoNonce &&
    nonceBase64Url.test(valor) &&
    valor.length % 4 !== 1
  );
}

function configuracaoValida(
  configuracao: unknown,
): configuracao is ConfiguracaoValidacaoIdTokenGoogle {
  if (typeof configuracao !== 'object' || configuracao === null) {
    return false;
  }

  const candidata = configuracao as Partial<ConfiguracaoValidacaoIdTokenGoogle>;
  return (
    valorSemEspacos(candidata.audienciaEsperada, 512) &&
    typeof candidata.dominioWorkspace === 'string' &&
    candidata.dominioWorkspace.length <= 253 &&
    candidata.dominioWorkspace === candidata.dominioWorkspace.toLowerCase() &&
    dominioWorkspace.test(candidata.dominioWorkspace) &&
    nonceValido(candidata.nonceEsperado) &&
    candidata.chaveDeVerificacao !== null &&
    candidata.chaveDeVerificacao !== undefined
  );
}

function compararEmTempoConstante(recebido: string, esperado: string): boolean {
  const recebidoBytes = new TextEncoder().encode(recebido);
  const esperadoBytes = new TextEncoder().encode(esperado);
  let diferenca = recebidoBytes.byteLength ^ esperadoBytes.byteLength;
  const tamanho = Math.max(recebidoBytes.byteLength, esperadoBytes.byteLength);

  for (let indice = 0; indice < tamanho; indice += 1) {
    diferenca |= (recebidoBytes[indice] ?? 0) ^ (esperadoBytes[indice] ?? 0);
  }

  return diferenca === 0;
}

function subjectValido(valor: unknown): valor is string {
  return (
    typeof valor === 'string' &&
    valor.length > 0 &&
    valor.length <= tamanhoMaximoSubject &&
    subjectGoogle.test(valor)
  );
}

function emailValido(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.length <= tamanhoMaximoEmail && email.test(valor);
}

function identidadeDosClaims(
  claims: Readonly<Record<string, unknown>>,
  configuracao: ConfiguracaoValidacaoIdTokenGoogle,
): IdentidadeGoogleVerificada {
  if (
    !subjectValido(claims.sub) ||
    !emailValido(claims.email) ||
    claims.email_verified !== true ||
    claims.hd !== configuracao.dominioWorkspace ||
    (claims.azp !== undefined && claims.azp !== configuracao.audienciaEsperada) ||
    // OIDC 3.1.3.7: rejeitar audiences adicionais não confiáveis.
    (Array.isArray(claims.aud) &&
      claims.aud.some((audiencia: unknown) => audiencia !== configuracao.audienciaEsperada)) ||
    (Array.isArray(claims.aud) &&
      claims.aud.length > 1 &&
      claims.azp !== configuracao.audienciaEsperada) ||
    typeof claims.iat !== 'number' ||
    !Number.isFinite(claims.iat) ||
    claims.iat > Math.floor(Date.now() / 1000) + toleranciaEmissaoSegundos ||
    !nonceValido(claims.nonce) ||
    !compararEmTempoConstante(claims.nonce, configuracao.nonceEsperado)
  ) {
    throw new ErroIdTokenGoogleInvalido();
  }

  return Object.freeze({
    subject: claims.sub,
    email: claims.email,
    dominioWorkspace: claims.hd,
  });
}

/**
 * Verifica somente a prova OIDC recebida. A concessão prévia, o consumo
 * atômico do desafio, a troca no Supabase e a admissão local são posteriores.
 */
export async function validarIdTokenGoogle(
  idToken: string,
  configuracao: ConfiguracaoValidacaoIdTokenGoogle,
): Promise<IdentidadeGoogleVerificada> {
  if (!configuracaoValida(configuracao)) {
    throw new ErroConfiguracaoValidacaoGoogleInvalida();
  }
  if (!valorSemEspacos(idToken, tamanhoMaximoIdToken)) {
    throw new ErroIdTokenGoogleInvalido();
  }

  try {
    // Esta integração não suporta extensões críticas JOSE.
    if (Object.hasOwn(decodeProtectedHeader(idToken), 'crit'))
      throw new ErroIdTokenGoogleInvalido();
    const { payload } = await jwtVerify(idToken, configuracao.chaveDeVerificacao, {
      algorithms: [...algoritmosGooglePermitidos],
      issuer: [...issuersGooglePermitidos],
      audience: configuracao.audienciaEsperada,
      requiredClaims: ['exp', 'iat', 'sub', 'nonce', 'email', 'email_verified', 'hd'],
    });

    return identidadeDosClaims(payload, configuracao);
  } catch (erro) {
    if (erro instanceof ErroIdTokenGoogleInvalido) {
      throw erro;
    }
    if (
      erro instanceof errors.JWTInvalid ||
      erro instanceof errors.JWSInvalid ||
      erro instanceof errors.JWTExpired ||
      erro instanceof errors.JWTClaimValidationFailed ||
      erro instanceof errors.JWSSignatureVerificationFailed ||
      erro instanceof errors.JOSEAlgNotAllowed
    )
      throw new ErroIdTokenGoogleInvalido();
    throw new Error('Validação Google indisponível.');
  }
}
