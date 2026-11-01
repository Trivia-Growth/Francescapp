import { uuidSchema } from '@ffcmapp/contratos';

type Identidade = Readonly<{ usuarioId: string; sessaoId: string }>;
const erro = () => new Error('Cursor inválido.');
const codificador = new TextEncoder();
const decodificador = new TextDecoder('utf-8', { fatal: true });

function aad(identidade: Identidade): ArrayBuffer {
  const usuario = uuidSchema.parse(identidade.usuarioId).toLowerCase();
  const sessao = uuidSchema.parse(identidade.sessaoId).toLowerCase();
  return codificador.encode(`ffcmapp:cursor-reconciliacao:v1:${usuario}:${sessao}`).buffer;
}
function codificar(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
function decodificar(token: string): Uint8Array {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(token)) throw erro();
  const binario = atob(`${token.replaceAll('-', '+').replaceAll('_', '/')}==`);
  const bytes = Uint8Array.from(binario, (letra) => letra.charCodeAt(0));
  if (bytes.length !== 64 || codificar(bytes) !== token) throw erro();
  return bytes;
}

/** Apenas seam server-only; exige chave própria, provisão e revisão S-02. */
export function criarCursorReconciliacao(material: Uint8Array) {
  if (!(material instanceof Uint8Array) || material.length !== 32) throw erro();
  const chave = crypto.subtle.importKey('raw', new Uint8Array(material).buffer, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
  return Object.freeze({
    async emitir(cursor: string, identidade: Identidade): Promise<string> {
      try {
        const valor = uuidSchema.parse(cursor).toLowerCase();
        const nonce = crypto.getRandomValues(new Uint8Array(12));
        const cifrado = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv: nonce, additionalData: aad(identidade), tagLength: 128 },
          await chave,
          codificador.encode(valor),
        );
        const resultado = new Uint8Array(12 + cifrado.byteLength);
        resultado.set(nonce);
        resultado.set(new Uint8Array(cifrado), 12);
        return codificar(resultado);
      } catch {
        throw erro();
      }
    },
    async abrir(token: string, identidade: Identidade): Promise<string> {
      try {
        const bytes = decodificar(token);
        const claro = await crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: bytes.slice(0, 12),
            additionalData: aad(identidade),
            tagLength: 128,
          },
          await chave,
          bytes.slice(12),
        );
        return uuidSchema.parse(decodificador.decode(claro)).toLowerCase();
      } catch {
        throw erro();
      }
    },
  });
}
