import type { CampoCifrado, MetadadosAad } from '../../../packages/contracts/src/rpc.ts';

export type { CampoCifrado, MetadadosAad };

export type ConfiguracaoCifraAutenticada = Readonly<{
  keyIdAtiva: string;
  chavesDeCifra: Readonly<Record<string, Uint8Array>>;
  chaveHmac: Uint8Array;
}>;

export type CifraAutenticada = Readonly<{
  cifrar(valor: string, aad: MetadadosAad): Promise<CampoCifrado>;
  decifrar(campo: CampoCifrado, aad: MetadadosAad): Promise<string>;
  calcularHmac(comandoLogico: string): Promise<string>;
}>;

/** Não inclui `key_id` para não revelar configuração privada em falhas públicas. */
export class ErroChaveIndisponivel extends Error {
  constructor() {
    super('Chave criptográfica indisponível.');
    this.name = 'ErroChaveIndisponivel';
  }
}

/** Falha fechada para envelope, AAD, tag ou texto inválido. */
export class ErroCifraAutenticada extends Error {
  constructor() {
    super('Não foi possível processar o campo cifrado.');
    this.name = 'ErroCifraAutenticada';
  }
}

const tamanhoChaveAes = 32;
const tamanhoNonce = 12;
const tamanhoTag = 16;
const tamanhoMaximoBase64Url = 32_768;
const formatoAtual = 1;
const codificador = new TextEncoder();
const decodificador = new TextDecoder('utf-8', { fatal: true });
const tabelasAad = new Set([
  'cadastro.paciente',
  'cadastro.contato_paciente',
  'cadastro.pessoa_relacionada',
  'cadastro.relacao_paciente',
  'auditoria.evento',
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const base64Url = /^[A-Za-z0-9_-]+$/;

function webCrypto(): Crypto {
  const runtime = globalThis.crypto;
  if (runtime === undefined || runtime.subtle === undefined) {
    throw new ErroCifraAutenticada();
  }
  return runtime;
}

function cryptoSubtle(): SubtleCrypto {
  return webCrypto().subtle;
}

function keyIdValido(keyId: unknown): keyId is string {
  return (
    typeof keyId === 'string' && keyId.length > 0 && keyId.length <= 128 && keyId.trim() === keyId
  );
}

function aadCanonico(aad: MetadadosAad): Uint8Array {
  if (typeof aad === 'object' && aad !== null && aad.tabela === 'cadastro.acesso_paciente') {
    if (
      !uuid.test(aad.registro_id) ||
      (aad.campo !== 'motivo_concessao' && aad.campo !== 'motivo_revogacao') ||
      aad.formato !== formatoAtual
    ) {
      throw new ErroCifraAutenticada();
    }
    return codificador.encode(
      JSON.stringify({
        tabela: aad.tabela,
        registro_id: aad.registro_id,
        campo: aad.campo,
        formato: aad.formato,
      }),
    );
  }
  if (typeof aad === 'object' && aad !== null && aad.tabela === 'cadastro.tarefa_cuidado_versao') {
    if (
      !uuid.test(aad.paciente_id) ||
      !uuid.test(aad.tarefa_id) ||
      !uuid.test(aad.registro_id) ||
      !Number.isInteger(aad.versao) ||
      aad.versao < 1 ||
      aad.versao > 2147483647 ||
      aad.campo !== 'conteudo' ||
      aad.formato !== formatoAtual
    )
      throw new ErroCifraAutenticada();
    return codificador.encode(
      JSON.stringify({
        tabela: aad.tabela,
        paciente_id: aad.paciente_id,
        tarefa_id: aad.tarefa_id,
        registro_id: aad.registro_id,
        versao: aad.versao,
        campo: aad.campo,
        formato: aad.formato,
      }),
    );
  }
  if (
    typeof aad === 'object' &&
    aad !== null &&
    aad.tabela === 'cadastro.objetivo_cuidado_versao'
  ) {
    if (
      !uuid.test(aad.paciente_id) ||
      !uuid.test(aad.objetivo_id) ||
      !uuid.test(aad.registro_id) ||
      !Number.isInteger(aad.versao) ||
      aad.versao < 1 ||
      aad.versao > 2147483647 ||
      aad.campo !== 'conteudo' ||
      aad.formato !== formatoAtual
    )
      throw new ErroCifraAutenticada();
    return codificador.encode(
      JSON.stringify({
        tabela: aad.tabela,
        paciente_id: aad.paciente_id,
        objetivo_id: aad.objetivo_id,
        registro_id: aad.registro_id,
        versao: aad.versao,
        campo: aad.campo,
        formato: aad.formato,
      }),
    );
  }
  if (
    typeof aad === 'object' &&
    aad !== null &&
    aad.tabela === 'cadastro.diario_rascunho_textual'
  ) {
    if (
      typeof aad.paciente_id !== 'string' ||
      !uuid.test(aad.paciente_id) ||
      typeof aad.autor_usuario_id !== 'string' ||
      !uuid.test(aad.autor_usuario_id) ||
      typeof aad.registro_id !== 'string' ||
      !uuid.test(aad.registro_id) ||
      !Number.isInteger(aad.versao) ||
      aad.versao < 1 ||
      aad.versao > 2147483647 ||
      aad.campo !== 'conteudo' ||
      aad.formato !== formatoAtual
    ) {
      throw new ErroCifraAutenticada();
    }
    return codificador.encode(
      JSON.stringify({
        tabela: aad.tabela,
        paciente_id: aad.paciente_id,
        autor_usuario_id: aad.autor_usuario_id,
        registro_id: aad.registro_id,
        versao: aad.versao,
        campo: aad.campo,
        formato: aad.formato,
      }),
    );
  }
  if (typeof aad === 'object' && aad !== null && aad.tabela === 'cadastro.anamnese_versao') {
    if (
      typeof aad.paciente_id !== 'string' ||
      !uuid.test(aad.paciente_id) ||
      typeof aad.registro_id !== 'string' ||
      !uuid.test(aad.registro_id) ||
      !Number.isInteger(aad.versao) ||
      aad.versao < 1 ||
      aad.versao > 2147483647 ||
      aad.campo !== 'conteudo' ||
      aad.formato !== formatoAtual
    ) {
      throw new ErroCifraAutenticada();
    }
    return codificador.encode(
      JSON.stringify({
        tabela: aad.tabela,
        paciente_id: aad.paciente_id,
        registro_id: aad.registro_id,
        versao: aad.versao,
        campo: aad.campo,
        formato: aad.formato,
      }),
    );
  }
  if (
    typeof aad === 'object' &&
    aad !== null &&
    (aad.tabela === 'identidade.concessao_equipe' || aad.tabela === 'identidade.convite_familiar')
  ) {
    if (
      typeof aad.registro_id !== 'string' ||
      !uuid.test(aad.registro_id) ||
      (aad.campo !== 'email' && aad.campo !== 'motivo') ||
      aad.formato !== formatoAtual
    ) {
      throw new ErroCifraAutenticada();
    }
    return codificador.encode(
      JSON.stringify({
        tabela: aad.tabela,
        registro_id: aad.registro_id,
        campo: aad.campo,
        formato: aad.formato,
      }),
    );
  }
  if (typeof aad === 'object' && aad !== null && aad.tabela === 'identidade.sessao') {
    if (
      typeof aad.registro_id !== 'string' ||
      !uuid.test(aad.registro_id) ||
      typeof aad.usuario_id !== 'string' ||
      !uuid.test(aad.usuario_id) ||
      aad.campo !== 'refresh_token' ||
      aad.formato !== formatoAtual
    ) {
      throw new ErroCifraAutenticada();
    }
    return codificador.encode(
      JSON.stringify({
        tabela: aad.tabela,
        registro_id: aad.registro_id,
        usuario_id: aad.usuario_id,
        campo: aad.campo,
        formato: aad.formato,
      }),
    );
  }
  if (
    typeof aad !== 'object' ||
    aad === null ||
    !tabelasAad.has(aad.tabela) ||
    typeof aad.registro_id !== 'string' ||
    !uuid.test(aad.registro_id) ||
    typeof aad.campo !== 'string' ||
    aad.campo.length === 0 ||
    aad.campo.length > 80 ||
    aad.formato !== formatoAtual
  ) {
    throw new ErroCifraAutenticada();
  }

  return codificador.encode(
    JSON.stringify({
      tabela: aad.tabela,
      registro_id: aad.registro_id,
      campo: aad.campo,
      formato: aad.formato,
    }),
  );
}

function bytesParaBase64Url(bytes: Uint8Array): string {
  let binario = '';
  for (let inicio = 0; inicio < bytes.length; inicio += 8192) {
    binario += String.fromCharCode(...bytes.subarray(inicio, inicio + 8192));
  }
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function bytesParaWebCrypto(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copia = new Uint8Array(bytes.length);
  copia.set(bytes);
  return copia;
}

function base64UrlParaBytes(valor: unknown, tamanhoMaximo = tamanhoMaximoBase64Url): Uint8Array {
  if (
    typeof valor !== 'string' ||
    valor.length > tamanhoMaximo ||
    !base64Url.test(valor) ||
    valor.length % 4 === 1
  ) {
    throw new ErroCifraAutenticada();
  }

  try {
    const base64 = valor
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(valor.length / 4) * 4, '=');
    const binario = atob(base64);
    const bytes = Uint8Array.from(binario, (caractere) => caractere.charCodeAt(0));
    if (bytesParaBase64Url(bytes) !== valor) {
      throw new ErroCifraAutenticada();
    }
    return bytes;
  } catch (erro) {
    if (erro instanceof ErroCifraAutenticada) {
      throw erro;
    }
    throw new ErroCifraAutenticada();
  }
}

function campoValido(campo: CampoCifrado): {
  keyId: string;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
  tag: Uint8Array;
} {
  if (
    typeof campo !== 'object' ||
    campo === null ||
    campo.formato !== formatoAtual ||
    !keyIdValido(campo.key_id)
  ) {
    throw new ErroCifraAutenticada();
  }

  const nonce = base64UrlParaBytes(campo.nonce, 16);
  const ciphertext = base64UrlParaBytes(campo.ciphertext);
  const tag = base64UrlParaBytes(campo.tag, 24);
  if (nonce.length !== tamanhoNonce || ciphertext.length === 0 || tag.length !== tamanhoTag) {
    throw new ErroCifraAutenticada();
  }

  return { keyId: campo.key_id, nonce, ciphertext, tag };
}

function chaveDeTamanhoCorreto(chave: unknown): chave is Uint8Array {
  return chave instanceof Uint8Array && chave.length === tamanhoChaveAes;
}

function mesmoMaterialDeChave(primeira: Uint8Array, segunda: Uint8Array): boolean {
  if (primeira.length !== segunda.length) {
    return false;
  }

  let diferenca = 0;
  for (let indice = 0; indice < primeira.length; indice += 1) {
    diferenca |= (primeira[indice] ?? 0) ^ (segunda[indice] ?? 0);
  }
  return diferenca === 0;
}

function importarChaves(configuracao: ConfiguracaoCifraAutenticada): {
  keyIdAtiva: string;
  chavesDeCifra: ReadonlyMap<string, Promise<CryptoKey>>;
  chaveHmac: Promise<CryptoKey>;
  chaveAtivaDuplicada: boolean;
} {
  if (!keyIdValido(configuracao.keyIdAtiva) || !chaveDeTamanhoCorreto(configuracao.chaveHmac)) {
    throw new ErroChaveIndisponivel();
  }

  const subtle = cryptoSubtle();
  const chavesDeCifra = new Map<string, Promise<CryptoKey>>();
  const materiais = new Map<string, Uint8Array>();
  for (const [keyId, chave] of Object.entries(configuracao.chavesDeCifra)) {
    if (!keyIdValido(keyId) || !chaveDeTamanhoCorreto(chave)) {
      throw new ErroChaveIndisponivel();
    }
    if (mesmoMaterialDeChave(chave, configuracao.chaveHmac)) {
      throw new ErroChaveIndisponivel();
    }
    materiais.set(keyId, new Uint8Array(chave));
    chavesDeCifra.set(
      keyId,
      subtle.importKey('raw', new Uint8Array(chave), { name: 'AES-GCM', length: 256 }, false, [
        'encrypt',
        'decrypt',
      ]),
    );
  }

  const materialAtivo = materiais.get(configuracao.keyIdAtiva);
  if (!materialAtivo) {
    throw new ErroChaveIndisponivel();
  }

  return {
    keyIdAtiva: configuracao.keyIdAtiva,
    chavesDeCifra,
    chaveAtivaDuplicada: [...materiais].some(
      ([keyId, chave]) =>
        keyId !== configuracao.keyIdAtiva && mesmoMaterialDeChave(chave, materialAtivo),
    ),
    chaveHmac: subtle.importKey(
      'raw',
      new Uint8Array(configuracao.chaveHmac),
      { name: 'HMAC', hash: 'SHA-256', length: 256 },
      false,
      ['sign'],
    ),
  };
}

function chaveObrigatoria(
  keyId: string,
  chavesDeCifra: ReadonlyMap<string, Promise<CryptoKey>>,
): Promise<CryptoKey> {
  const chave = chavesDeCifra.get(keyId);
  if (chave === undefined) {
    throw new ErroChaveIndisponivel();
  }
  return chave;
}

function unirCiphertextETag(ciphertext: Uint8Array, tag: Uint8Array): Uint8Array {
  const resultado = new Uint8Array(ciphertext.length + tag.length);
  resultado.set(ciphertext);
  resultado.set(tag, ciphertext.length);
  return resultado;
}

export function criarCifraAutenticada(
  configuracao: ConfiguracaoCifraAutenticada,
): CifraAutenticada {
  const chaves = importarChaves(configuracao);

  return Object.freeze({
    async cifrar(valor, aad) {
      if (chaves.chaveAtivaDuplicada) throw new ErroChaveIndisponivel();
      if (typeof valor !== 'string') {
        throw new ErroCifraAutenticada();
      }
      const valorCodificado = codificador.encode(valor);
      if (valorCodificado.length === 0) {
        throw new ErroCifraAutenticada();
      }

      const nonce = webCrypto().getRandomValues(new Uint8Array(tamanhoNonce));
      try {
        const resultado = new Uint8Array(
          await cryptoSubtle().encrypt(
            {
              name: 'AES-GCM',
              iv: bytesParaWebCrypto(nonce),
              additionalData: bytesParaWebCrypto(aadCanonico(aad)),
              tagLength: 128,
            },
            await chaveObrigatoria(chaves.keyIdAtiva, chaves.chavesDeCifra),
            valorCodificado,
          ),
        );
        const ciphertext = resultado.slice(0, -tamanhoTag);
        const tag = resultado.slice(-tamanhoTag);
        return {
          formato: formatoAtual,
          key_id: chaves.keyIdAtiva,
          nonce: bytesParaBase64Url(nonce),
          ciphertext: bytesParaBase64Url(ciphertext),
          tag: bytesParaBase64Url(tag),
        };
      } catch (erro) {
        if (erro instanceof ErroChaveIndisponivel || erro instanceof ErroCifraAutenticada) {
          throw erro;
        }
        throw new ErroCifraAutenticada();
      }
    },

    async decifrar(campo, aad) {
      const envelope = campoValido(campo);
      try {
        const resultado = await cryptoSubtle().decrypt(
          {
            name: 'AES-GCM',
            iv: bytesParaWebCrypto(envelope.nonce),
            additionalData: bytesParaWebCrypto(aadCanonico(aad)),
            tagLength: 128,
          },
          await chaveObrigatoria(envelope.keyId, chaves.chavesDeCifra),
          bytesParaWebCrypto(unirCiphertextETag(envelope.ciphertext, envelope.tag)),
        );
        return decodificador.decode(resultado);
      } catch (erro) {
        if (erro instanceof ErroChaveIndisponivel || erro instanceof ErroCifraAutenticada) {
          throw erro;
        }
        throw new ErroCifraAutenticada();
      }
    },

    async calcularHmac(comandoLogico) {
      if (typeof comandoLogico !== 'string' || comandoLogico.length === 0) {
        throw new ErroCifraAutenticada();
      }
      try {
        const assinatura = await cryptoSubtle().sign(
          'HMAC',
          await chaves.chaveHmac,
          codificador.encode(`ffcmapp:hmac:v1:${comandoLogico}`),
        );
        return bytesParaBase64Url(new Uint8Array(assinatura));
      } catch {
        throw new ErroCifraAutenticada();
      }
    },
  });
}
