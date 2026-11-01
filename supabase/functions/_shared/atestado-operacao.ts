import { dadosAtestadoSchema } from '../../../packages/contracts/src/rpc.ts';

/** Experimento isolado; NÃO integrar antes de verificar no banco a vinculação
 * dos bytes assinados à entrada executada e obter revisão S-02. Não verifica JWT,
 * autorização, validade temporal ou Vault. */
export function criarAtestadorOperacao(configuracao: { keyId: string; chave: Uint8Array }) {
  if (
    !configuracao.keyId ||
    !(configuracao.chave instanceof Uint8Array) ||
    configuracao.chave.length !== 32
  ) {
    throw new Error('Configuração de atestado inválida.');
  }
  const keyId = configuracao.keyId;
  const chave = crypto.subtle.importKey(
    'raw',
    new Uint8Array(configuracao.chave),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const codificador = new TextEncoder();
  const base64 = (bytes: ArrayBuffer) =>
    btoa(String.fromCharCode(...new Uint8Array(bytes)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');

  function canonico(valor: unknown): string {
    const partes: string[] = [];
    const ancestrais = new WeakSet<object>();
    let bytes = 0;
    const emitir = (parte: string) => {
      bytes += codificador.encode(parte).length;
      if (bytes > 1024 * 1024) throw new Error('Entrada inválida.');
      partes.push(parte);
    };
    function visitar(valor: unknown, profundidade: number): void {
      if (profundidade > 64) throw new Error('Entrada inválida.');
      if (valor === null || typeof valor === 'boolean' || typeof valor === 'string') {
        if (
          typeof valor === 'string' &&
          /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(valor)
        ) {
          throw new Error('Entrada inválida.');
        }
        if (typeof valor === 'string' && valor.length > 1024 * 1024 - bytes) {
          throw new Error('Entrada inválida.');
        }
        emitir(JSON.stringify(valor));
        return;
      }
      if (typeof valor === 'number' && Number.isFinite(valor)) {
        emitir(JSON.stringify(valor));
        return;
      }
      if (typeof valor === 'object' && valor !== null) {
        if (ancestrais.has(valor)) throw new Error('Entrada inválida.');
        ancestrais.add(valor);
      }
      if (Array.isArray(valor)) {
        emitir('[');
        for (let i = 0; i < valor.length; i += 1) {
          if (i > 0) emitir(',');
          const propriedade = Object.getOwnPropertyDescriptor(valor, i);
          if (!propriedade || !('value' in propriedade)) throw new Error('Entrada inválida.');
          visitar(propriedade.value, profundidade + 1);
        }
        emitir(']');
        ancestrais.delete(valor);
        return;
      }
      if (
        typeof valor === 'object' &&
        valor !== null &&
        Object.getPrototypeOf(valor) === Object.prototype
      ) {
        emitir('{');
        const chaves: string[] = [];
        for (const chave in valor) {
          if (!Object.hasOwn(valor, chave)) continue;
          if (chaves.length >= 10000) throw new Error('Entrada inválida.');
          chaves.push(chave);
        }
        chaves.sort();
        chaves.forEach((chave, indice) => {
          if (indice > 0) emitir(',');
          const propriedade = Object.getOwnPropertyDescriptor(valor, chave);
          if (!propriedade || !('value' in propriedade)) throw new Error('Entrada inválida.');
          visitar(chave, profundidade + 1);
          emitir(':');
          visitar(propriedade.value, profundidade + 1);
        });
        emitir('}');
        ancestrais.delete(valor);
        return;
      }
      throw new Error('Entrada inválida.');
    }
    visitar(valor, 0);
    return partes.join('');
  }

  return Object.freeze({
    canonicalizar: canonico,
    async atestarEntrada(dados: unknown, entrada: Record<string, unknown>) {
      const metadados = dadosAtestadoSchema.omit({ digest_entrada: true }).parse(dados);
      if (metadados.key_id !== keyId) throw new Error('Atestado inválido.');
      const entradaCanonica = canonico(entrada);
      const digest_entrada = base64(
        await crypto.subtle.digest('SHA-256', codificador.encode(entradaCanonica)),
      );
      const validado = dadosAtestadoSchema.parse({ ...metadados, digest_entrada });
      const dadosCanonicos = canonico(validado);
      const mac = base64(
        await crypto.subtle.sign(
          'HMAC',
          await chave,
          codificador.encode(`ffcmapp:atestado:v1:${dadosCanonicos}`),
        ),
      );
      return { atestado: { ...validado, mac }, entradaCanonica, dadosCanonicos };
    },
    async atestar(dados: unknown, entrada: Record<string, unknown>) {
      const validado = dadosAtestadoSchema.parse(dados);
      if (validado.key_id !== keyId) throw new Error('Atestado inválido.');
      const entradaCanonica = canonico(entrada);
      const dadosCanonicos = canonico(validado);
      const digest = base64(
        await crypto.subtle.digest('SHA-256', codificador.encode(entradaCanonica)),
      );
      if (digest !== validado.digest_entrada) throw new Error('Atestado inválido.');
      const mac = base64(
        await crypto.subtle.sign(
          'HMAC',
          await chave,
          codificador.encode(`ffcmapp:atestado:v1:${dadosCanonicos}`),
        ),
      );
      return { atestado: { ...validado, mac }, entradaCanonica, dadosCanonicos };
    },
  });
}
