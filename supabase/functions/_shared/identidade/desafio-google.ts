import { CompactEncrypt, compactDecrypt, errors } from 'jose';

/**
 * O adapter real deve comparar hash, expiração e consumo numa operação atômica,
 * usando o relógio do banco como autoridade; `agora` não é prova de validade.
 * A expiração emitida depende do relógio do processo: sua sincronização e os
 * limites de desvio precisam ser verificados na integração real.
 * Um timeout de consumo tem resultado incerto e exige emitir novo desafio.
 */
export type RepositorioDesafiosGoogle = Readonly<{
  registrar: (id: string, hash: string, expiraEm: number) => Promise<void>;
  consumir: (id: string, hash: string, agora: number) => Promise<boolean>;
}>;

export class ErroDesafioGoogle extends Error {
  constructor() {
    super('Desafio Google indisponível ou inválido.');
    this.name = 'ErroDesafioGoogle';
  }
}

/** Negativa comprovada; nunca usar para timeout ou falha incerta do banco. */
export class ErroDesafioGoogleInvalido extends ErroDesafioGoogle {
  constructor() {
    super();
    this.name = 'ErroDesafioGoogleInvalido';
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const nonceValido = /^[A-Za-z0-9_-]{43}$/;
const encoder = new TextEncoder();

async function hashNonce(nonce: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(nonce));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** A operação pode confirmar depois do timeout; não presumir rollback nem repetir. */
async function antesDaExpiracao<T>(expira: number, executar: () => Promise<T>): Promise<T> {
  const restante = expira - Date.now();
  if (restante <= 0) throw new ErroDesafioGoogle();
  const sinal = AbortSignal.timeout(restante);
  if (sinal.aborted) throw new ErroDesafioGoogle();
  let abortar: (() => void) | undefined;
  const prazo = new Promise<never>((_, rejeitar) => {
    abortar = () => rejeitar(new ErroDesafioGoogle());
    sinal.addEventListener('abort', abortar, { once: true });
  });
  try {
    const resultado = await Promise.race([executar(), prazo]);
    if (sinal.aborted || Date.now() >= expira) throw new ErroDesafioGoogle();
    return resultado;
  } finally {
    if (abortar) sinal.removeEventListener('abort', abortar);
  }
}

/** Núcleo sem transporte HTTP. O chamador deve enviar nonceSelado somente em cookie seguro. */
export function criarDesafiosGoogle(
  config: Readonly<{
    chave: Uint8Array;
    ttlSegundos: number;
    repositorio: RepositorioDesafiosGoogle;
  }>,
) {
  if (
    config.chave.byteLength !== 32 ||
    !Number.isSafeInteger(config.ttlSegundos) ||
    config.ttlSegundos < 1 ||
    config.ttlSegundos > 600
  ) {
    throw new TypeError('Configuração de desafio inválida.');
  }
  const chave = new Uint8Array(config.chave);
  const ttlSegundos = config.ttlSegundos;
  return Object.freeze({
    async emitir() {
      const id = crypto.randomUUID();
      const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      const hash = await hashNonce(nonce);
      const expira = Date.now() + ttlSegundos * 1000;
      const nonceSelado = await new CompactEncrypt(
        encoder.encode(JSON.stringify({ id, nonce, expira })),
      )
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM', typ: 'ffcm-desafio-google' })
        .encrypt(chave);
      try {
        await antesDaExpiracao(expira, () => config.repositorio.registrar(id, hash, expira));
      } catch {
        throw new ErroDesafioGoogle();
      }
      return Object.freeze({
        publico: Object.freeze({
          desafio_id: id,
          nonce_hash: hash,
          expira_em: new Date(expira).toISOString(),
        }),
        nonceSelado,
      });
    },
    async consumir(id: string, nonceSelado: string) {
      if (
        typeof id !== 'string' ||
        !uuid.test(id) ||
        typeof nonceSelado !== 'string' ||
        nonceSelado.length > 2048
      )
        throw new ErroDesafioGoogleInvalido();
      try {
        const { plaintext, protectedHeader } = await compactDecrypt(nonceSelado, chave, {
          keyManagementAlgorithms: ['dir'],
          contentEncryptionAlgorithms: ['A256GCM'],
        }).catch((erro: unknown) => {
          if (
            erro instanceof errors.JWEInvalid ||
            erro instanceof errors.JWEDecryptionFailed ||
            erro instanceof errors.JOSEAlgNotAllowed
          )
            throw new ErroDesafioGoogleInvalido();
          throw erro;
        });
        if (protectedHeader.typ !== 'ffcm-desafio-google') throw new ErroDesafioGoogleInvalido();
        const dados: unknown = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(plaintext),
        );
        if (
          typeof dados !== 'object' ||
          dados === null ||
          !('id' in dados) ||
          !('nonce' in dados) ||
          !('expira' in dados) ||
          dados.id !== id ||
          typeof dados.nonce !== 'string' ||
          !nonceValido.test(dados.nonce) ||
          typeof dados.expira !== 'number' ||
          !Number.isSafeInteger(dados.expira) ||
          dados.expira <= Date.now()
        )
          throw new ErroDesafioGoogleInvalido();
        const hash = await hashNonce(dados.nonce);
        const consumido = await antesDaExpiracao(dados.expira, async () => {
          try {
            return await config.repositorio.consumir(id, hash, Date.now());
          } catch {
            throw new ErroDesafioGoogle();
          }
        });
        if (consumido === false) throw new ErroDesafioGoogleInvalido();
        if (consumido !== true) throw new ErroDesafioGoogle();
        return Object.freeze({ nonce: dados.nonce, nonce_hash: hash });
      } catch (erro) {
        if (erro instanceof ErroDesafioGoogleInvalido) throw erro;
        throw new ErroDesafioGoogle();
      }
    },
  });
}
