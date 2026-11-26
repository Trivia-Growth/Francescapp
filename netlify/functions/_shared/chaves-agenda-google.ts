/** Deriva chaves efêmeras do HMAC existente; não cria credencial ou segredo persistente. */
export async function derivarChavesAgendaGoogle(hmac: Uint8Array) {
  if (hmac.length !== 32) throw new Error('Conexão indisponível.');
  const material = await crypto.subtle.importKey('raw', new Uint8Array(hmac), 'HKDF', false, [
    'deriveBits',
  ]);
  const derivar = async (finalidade: string) =>
    new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: new TextEncoder().encode('ffcmapp:agenda-google:v1'),
          info: new TextEncoder().encode(finalidade),
        },
        material,
        256,
      ),
    );
  const [state, cookie, desconexao] = await Promise.all([
    derivar('state'),
    derivar('cookie'),
    derivar('desconexao'),
  ]);
  return { state, cookie, desconexao };
}
