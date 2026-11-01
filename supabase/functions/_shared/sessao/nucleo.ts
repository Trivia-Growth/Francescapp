import { jwtVerify, type JWSAlgorithm, type KeyInput } from 'jose';

const caminhoDaSessao = '/api/sessao';
const nomeCookieSessao = 'ffcm_sessao';
const nomeCookieCsrf = 'ffcm_csrf';
const nomeCookieCsrfDesafio = 'ffcm_csrf_desafio';
const versaoCookie = 'v1';
const bytesCsrf = 32;
const tamanhoMaximoCsrf = 512;
const tamanhoMaximoJwt = 16_384;
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TransporteDeCookie = 'https' | 'http-local';

export type ConfiguracaoDeCookiesSessao = Readonly<{
  /** Material base64url validado pelo fluxo `sessao` da configuração 1.3. */
  chaveDeSelagem: string;
  /** HTTP só pode ser selecionado explicitamente para desenvolvimento local. */
  transporte: TransporteDeCookie;
}>;

export type CodecDeCookiesSessao = Readonly<{
  selarSessao: (identificador: string) => Promise<string>;
  abrirSessao: (cabecalhoCookie: string) => Promise<string | null>;
  selarCsrf: (csrf: string) => Promise<string>;
  abrirCsrf: (cabecalhoCookie: string) => Promise<string | null>;
  selarCsrfDesafio: (csrf: string) => Promise<string>;
  abrirCsrfDesafio: (cabecalhoCookie: string) => Promise<string | null>;
  limparCsrfDesafio: () => string;
  limparSessao: () => string;
  limparCsrf: () => string;
}>;

export class ErroJwtDeSessaoInvalido extends Error {
  constructor() {
    super('JWT de sessão inválido.');
    this.name = 'ErroJwtDeSessaoInvalido';
  }
}

export type ConfiguracaoJwtSessao = Readonly<{
  issuer: string;
  audience: string;
  algoritmosPermitidos: readonly JWSAlgorithm[];
  chaveDeVerificacao: KeyInput;
}>;

export type ClaimsDeSessaoVerificados = Readonly<{
  usuarioId: string;
  sessionId: string;
}>;

export type MetodoDeAdmissao = 'google_workspace' | 'tecnica';

/**
 * Esta é a única identidade entregue ao adapter de admissão. O perfil nunca
 * atravessa este seam: ele é decidido pela autoridade local na tarefa 3.2.2.
 */
export type IdentidadeParaAdmissao = Readonly<{
  usuario_id: string;
  session_id: string;
  metodo: MetodoDeAdmissao;
}>;

/** Adapter exclusivamente server-side para a RPC interna de admissão. */
export type AdaptadorDeAdmissaoSessao<Resultado> = Readonly<{
  admitir: (identidade: IdentidadeParaAdmissao) => Promise<Resultado>;
}>;

function paraBase64Url(bytes: Uint8Array): string {
  let binario = '';
  for (const byte of bytes) {
    binario += String.fromCharCode(byte);
  }
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function deBase64Url(valor: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(valor) || valor.length % 4 === 1) {
    return null;
  }

  try {
    const base64 = valor
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(valor.length / 4) * 4, '=');
    const binario = atob(base64);
    return Uint8Array.from(binario, (caractere) => caractere.charCodeAt(0));
  } catch {
    return null;
  }
}

function paraArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copia = new Uint8Array(bytes.byteLength);
  copia.set(bytes);
  return copia.buffer;
}

async function importarChaveDeCookie(chaveDeSelagem: string): Promise<CryptoKey> {
  const material = deBase64Url(chaveDeSelagem);
  if (material === null || material.byteLength < 32) {
    throw new TypeError('Chave de selagem inválida.');
  }

  const digest = await crypto.subtle.digest('SHA-256', paraArrayBuffer(material));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function atributosCookie(transporte: TransporteDeCookie, maxAge?: number): string {
  const atributos = [`Path=${caminhoDaSessao}`, 'HttpOnly', 'SameSite=Lax'];
  if (transporte === 'https') {
    atributos.push('Secure');
  }
  if (maxAge !== undefined) {
    atributos.push(`Max-Age=${maxAge}`);
  }
  return atributos.join('; ');
}

function valorDoCookie(cabecalhoCookie: string, nome: string): string | null {
  const prefixo = `${nome}=`;
  for (const parte of cabecalhoCookie.split(';')) {
    const candidato = parte.trim();
    if (candidato.startsWith(prefixo)) {
      return candidato.slice(prefixo.length);
    }
  }
  return null;
}

function dadosAdicionais(nome: string): Uint8Array {
  return new TextEncoder().encode(`ffcm:sessao:${nome}:${versaoCookie}`);
}

async function selarValor(nome: string, valor: string, chave: CryptoKey): Promise<string> {
  if (valor.length === 0) {
    throw new TypeError('Valor de cookie vazio.');
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const texto = new TextEncoder().encode(valor);
  const cifrado = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: paraArrayBuffer(iv),
        additionalData: paraArrayBuffer(dadosAdicionais(nome)),
      },
      chave,
      paraArrayBuffer(texto),
    ),
  );
  return `${versaoCookie}.${paraBase64Url(iv)}.${paraBase64Url(cifrado)}`;
}

async function abrirValor(
  nome: string,
  valorSelado: string,
  chave: CryptoKey,
): Promise<string | null> {
  const partes = valorSelado.split('.');
  if (partes.length !== 3 || partes[0] !== versaoCookie) {
    return null;
  }

  const iv = deBase64Url(partes[1] ?? '');
  const cifrado = deBase64Url(partes[2] ?? '');
  if (iv === null || iv.byteLength !== 12 || cifrado === null) {
    return null;
  }

  try {
    const texto = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: paraArrayBuffer(iv),
        additionalData: paraArrayBuffer(dadosAdicionais(nome)),
      },
      chave,
      paraArrayBuffer(cifrado),
    );
    return new TextDecoder().decode(texto);
  } catch {
    return null;
  }
}

/** Cria cookies HttpOnly, sem Domain e restritos às rotas de sessão. */
export function criarCodecDeCookiesSessao(
  configuracao: ConfiguracaoDeCookiesSessao,
): CodecDeCookiesSessao {
  return criarCodec(configuracao, nomeCookieSessao, nomeCookieCsrf);
}

/** O seletor é um identificador aleatório da emissão, não uma credencial ou session_id. */
export function criarCodecDeCookiesSessaoIsolada(
  configuracao: ConfiguracaoDeCookiesSessao,
  seletor: string,
): CodecDeCookiesSessao {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(seletor)) {
    throw new TypeError('Seletor de sessão inválido.');
  }
  return criarCodec(configuracao, `${nomeCookieSessao}_${seletor}`, `${nomeCookieCsrf}_${seletor}`);
}

/** O nome autenticado do cookie vincula proteção a uma única tentativa. */
export function criarCodecDeCookiesDesafioIsolado(
  configuracao: ConfiguracaoDeCookiesSessao,
  seletor: string,
): CodecDeCookiesSessao {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(seletor)) {
    throw new TypeError('Seletor de desafio inválido.');
  }
  return criarCodec(
    configuracao,
    nomeCookieSessao,
    nomeCookieCsrf,
    `${nomeCookieCsrfDesafio}_${seletor}`,
  );
}

function criarCodec(
  configuracao: ConfiguracaoDeCookiesSessao,
  nomeSessao: string,
  nomeCsrf: string,
  nomeDesafio: string = nomeCookieCsrfDesafio,
): CodecDeCookiesSessao {
  if (configuracao.transporte !== 'https' && configuracao.transporte !== 'http-local') {
    throw new TypeError('Transporte de cookie inválido.');
  }
  const chave = importarChaveDeCookie(configuracao.chaveDeSelagem);

  const selarCookie = async (nome: string, valor: string): Promise<string> => {
    const valorSelado = await selarValor(nome, valor, await chave);
    return `${nome}=${valorSelado}; ${atributosCookie(configuracao.transporte)}`;
  };
  const abrirCookie = async (nome: string, cabecalhoCookie: string): Promise<string | null> => {
    const valorSelado = valorDoCookie(cabecalhoCookie, nome);
    return valorSelado === null ? null : abrirValor(nome, valorSelado, await chave);
  };
  const limparCookie = (nome: string): string =>
    `${nome}=; ${atributosCookie(configuracao.transporte, 0)}`;

  return Object.freeze({
    selarSessao: (identificador) => selarCookie(nomeSessao, identificador),
    abrirSessao: (cabecalhoCookie) => abrirCookie(nomeSessao, cabecalhoCookie),
    selarCsrf: (csrf) => selarCookie(nomeCsrf, csrf),
    abrirCsrf: (cabecalhoCookie) => abrirCookie(nomeCsrf, cabecalhoCookie),
    selarCsrfDesafio: async (csrf) =>
      `${await selarCookie(nomeDesafio, csrf)}${nomeDesafio === nomeCookieCsrfDesafio ? '' : '; Max-Age=300'}`,
    abrirCsrfDesafio: (cabecalhoCookie) => abrirCookie(nomeDesafio, cabecalhoCookie),
    limparCsrfDesafio: () => limparCookie(nomeDesafio),
    limparSessao: () => limparCookie(nomeSessao),
    limparCsrf: () => limparCookie(nomeCsrf),
  });
}

export async function emitirProtecaoCsrf(
  codec: CodecDeCookiesSessao,
): Promise<Readonly<{ csrf: string; setCookie: string }>> {
  const csrf = paraBase64Url(crypto.getRandomValues(new Uint8Array(bytesCsrf)));
  return Object.freeze({ csrf, setCookie: await codec.selarCsrf(csrf) });
}

export async function emitirProtecaoCsrfDesafio(
  codec: CodecDeCookiesSessao,
): Promise<Readonly<{ csrf: string; setCookie: string }>> {
  const csrf = paraBase64Url(crypto.getRandomValues(new Uint8Array(bytesCsrf)));
  return Object.freeze({ csrf, setCookie: await codec.selarCsrfDesafio(csrf) });
}

/** Compara até o limite aceito, sem encerrar a comparação no primeiro byte divergente. */
export function compararCsrfEmTempoConstante(recebido: string, esperado: string): boolean {
  const recebidoBytes = new TextEncoder().encode(recebido);
  const esperadoBytes = new TextEncoder().encode(esperado);
  let diferenca = recebidoBytes.byteLength ^ esperadoBytes.byteLength;

  for (let indice = 0; indice < tamanhoMaximoCsrf; indice += 1) {
    diferenca |= (recebidoBytes[indice] ?? 0) ^ (esperadoBytes[indice] ?? 0);
  }

  return (
    recebidoBytes.byteLength >= 32 &&
    recebidoBytes.byteLength <= tamanhoMaximoCsrf &&
    esperadoBytes.byteLength >= 32 &&
    esperadoBytes.byteLength <= tamanhoMaximoCsrf &&
    diferenca === 0
  );
}

function origemExataPermitida(
  origem: string | null,
  origensPermitidas: readonly string[],
): boolean {
  if (origem === null) {
    return false;
  }

  try {
    const url = new URL(origem);
    return url.origin === origem && origensPermitidas.includes(origem);
  } catch {
    return false;
  }
}

export async function verificarProtecaoDeComando(
  entrada: Readonly<{
    origem: string | null;
    csrfCabecalho: string | null;
    cookieCsrf: string | null;
    origensPermitidas: readonly string[];
    codec: CodecDeCookiesSessao;
  }>,
): Promise<boolean> {
  if (!origemExataPermitida(entrada.origem, entrada.origensPermitidas)) {
    return false;
  }
  if (entrada.csrfCabecalho === null || entrada.cookieCsrf === null) {
    return false;
  }

  const csrfEsperado = await entrada.codec.abrirCsrf(entrada.cookieCsrf);
  return csrfEsperado !== null && compararCsrfEmTempoConstante(entrada.csrfCabecalho, csrfEsperado);
}

/** O desafio de entrada nunca reutiliza o cookie da sessão já estabelecida. */
export async function verificarProtecaoDeEntrada(
  entrada: Parameters<typeof verificarProtecaoDeComando>[0],
): Promise<boolean> {
  if (!origemExataPermitida(entrada.origem, entrada.origensPermitidas)) return false;
  if (entrada.csrfCabecalho === null || entrada.cookieCsrf === null) return false;
  const esperado = await entrada.codec.abrirCsrfDesafio(entrada.cookieCsrf);
  return esperado !== null && compararCsrfEmTempoConstante(entrada.csrfCabecalho, esperado);
}

function configuracaoJwtValida(configuracao: ConfiguracaoJwtSessao): boolean {
  return (
    configuracao.issuer.length > 0 &&
    configuracao.audience.length > 0 &&
    configuracao.algoritmosPermitidos.length > 0 &&
    configuracao.algoritmosPermitidos.every(
      (algoritmo) => algoritmo.length > 0 && algoritmo !== 'none',
    )
  );
}

/** Verifica assinatura e claims obrigatórios; nunca apenas decodifica o JWT. */
export async function validarJwtDeSessao(
  jwt: string,
  configuracao: ConfiguracaoJwtSessao,
): Promise<ClaimsDeSessaoVerificados> {
  try {
    if (jwt.length === 0 || jwt.length > tamanhoMaximoJwt || !configuracaoJwtValida(configuracao)) {
      throw new ErroJwtDeSessaoInvalido();
    }

    const { payload } = await jwtVerify(jwt, configuracao.chaveDeVerificacao, {
      issuer: configuracao.issuer,
      audience: configuracao.audience,
      algorithms: [...configuracao.algoritmosPermitidos],
    });
    if (
      typeof payload.sub !== 'string' ||
      !uuidRegex.test(payload.sub) ||
      typeof payload.session_id !== 'string' ||
      !uuidRegex.test(payload.session_id) ||
      typeof payload.exp !== 'number'
    ) {
      throw new ErroJwtDeSessaoInvalido();
    }

    return Object.freeze({ usuarioId: payload.sub, sessionId: payload.session_id });
  } catch {
    throw new ErroJwtDeSessaoInvalido();
  }
}

/**
 * Orquestra exclusivamente server-side: o chamador fornece um método fixado
 * pela rota/adaptador confiável, mas não consegue declarar perfil ou usuário.
 */
export async function admitirSessaoNoServidor<Resultado>(
  entrada: Readonly<{ jwt: string; metodo: MetodoDeAdmissao }>,
  dependencias: Readonly<{
    configuracaoJwt: ConfiguracaoJwtSessao;
    adaptador: AdaptadorDeAdmissaoSessao<Resultado>;
  }>,
): Promise<Resultado> {
  if (entrada.metodo !== 'google_workspace' && entrada.metodo !== 'tecnica') {
    throw new TypeError('Método de admissão inválido.');
  }
  const claims = await validarJwtDeSessao(entrada.jwt, dependencias.configuracaoJwt);
  return dependencias.adaptador.admitir(
    Object.freeze({
      usuario_id: claims.usuarioId,
      session_id: claims.sessionId,
      metodo: entrada.metodo,
    }),
  );
}
