import { criarCursorReconciliacao } from './cursor-reconciliacao.ts';

/** Domínio separado da reconciliação; material é exclusivo do servidor. */
export async function criarCursorCarteira(material: Uint8Array) {
  if (!(material instanceof Uint8Array) || material.length !== 32)
    throw new Error('Cursor inválido.');
  const origem = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(material).buffer,
    'HKDF',
    false,
    ['deriveBits'],
  );
  const derivada = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('ffcmapp:cursores:v1'),
      info: new TextEncoder().encode('carteira:v1'),
    },
    origem,
    256,
  );
  return criarCursorReconciliacao(new Uint8Array(derivada));
}
