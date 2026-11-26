import type { ConfiguracaoCifraAutenticada } from './cifra-autenticada.ts';

type NomeFuncaoCofre = 'identidade.ler_chave_cifra_vault';

export type ExecutorCofreInterno = Readonly<{
  executar(nome: NomeFuncaoCofre, argumentos: Readonly<{ p_referencia: string }>): Promise<unknown>;
}>;

export type ReferenciasCifraCofre = Readonly<{
  keyIdAtiva: string;
  referenciasCifra: Readonly<Record<string, string>>;
  referenciaHmac: string;
}>;

/** Não inclui referência ou causa para não expor a topologia do cofre. */
export class ErroCofreIndisponivel extends Error {
  constructor() {
    super('Chave criptográfica indisponível.');
    this.name = 'ErroCofreIndisponivel';
  }
}

const tamanhoChave = 32;
const referenciaCofre = /^ffcmapp\.cifra\.[a-z0-9][a-z0-9_-]{0,63}$/;

function keyIdValido(keyId: unknown): keyId is string {
  return (
    typeof keyId === 'string' && keyId.length > 0 && keyId.length <= 128 && keyId.trim() === keyId
  );
}

function referenciaValida(referencia: unknown): referencia is string {
  return typeof referencia === 'string' && referenciaCofre.test(referencia);
}

function decodificarChave(valor: unknown): Uint8Array {
  if (typeof valor !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(valor)) {
    throw new ErroCofreIndisponivel();
  }

  try {
    const binario = atob(valor);
    const chave = Uint8Array.from(binario, (caractere) => caractere.charCodeAt(0));
    if (chave.length !== tamanhoChave || btoa(binario) !== valor) {
      throw new ErroCofreIndisponivel();
    }
    return chave;
  } catch (erro) {
    if (erro instanceof ErroCofreIndisponivel) {
      throw erro;
    }
    throw new ErroCofreIndisponivel();
  }
}

export async function lerChaveCofre(
  executor: ExecutorCofreInterno,
  referencia: unknown,
): Promise<Uint8Array> {
  if (!referenciaValida(referencia)) {
    throw new ErroCofreIndisponivel();
  }

  try {
    return decodificarChave(
      await executor.executar('identidade.ler_chave_cifra_vault', { p_referencia: referencia }),
    );
  } catch (erro) {
    if (erro instanceof ErroCofreIndisponivel) {
      throw erro;
    }
    throw new ErroCofreIndisponivel();
  }
}

/**
 * Porta exclusiva do runtime confiável: recebe executor interno, nunca um cliente público Supabase.
 */
export async function carregarMaterialCriptograficoDoCofre(
  executor: ExecutorCofreInterno,
  referencias: ReferenciasCifraCofre,
): Promise<ConfiguracaoCifraAutenticada> {
  if (
    !keyIdValido(referencias.keyIdAtiva) ||
    !Object.hasOwn(referencias.referenciasCifra, referencias.keyIdAtiva)
  ) {
    throw new ErroCofreIndisponivel();
  }

  const entradas = Object.entries(referencias.referenciasCifra);
  if (entradas.length === 0 || entradas.some(([keyId]) => !keyIdValido(keyId))) {
    throw new ErroCofreIndisponivel();
  }

  const chavesDeCifra = Object.fromEntries(
    await Promise.all(
      entradas.map(async ([keyId, referencia]) => [
        keyId,
        await lerChaveCofre(executor, referencia),
      ]),
    ),
  );

  return Object.freeze({
    keyIdAtiva: referencias.keyIdAtiva,
    chavesDeCifra: Object.freeze(chavesDeCifra),
    chaveHmac: await lerChaveCofre(executor, referencias.referenciaHmac),
  });
}
