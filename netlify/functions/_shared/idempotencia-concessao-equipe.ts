type Candidato = Readonly<{ concessao_id: string; digest_idempotencia: string }>;

/** Chaves dedicadas permanecem disponíveis enquanto houver recibos que as utilizem. */
export async function calcularCandidatosConcessao(
  chaves: Readonly<Record<string, Uint8Array>>,
  usuario: string,
  pedido: string,
  comando: string,
): Promise<Readonly<Record<string, Candidato>>> {
  const entradas = Object.entries(chaves);
  if (!usuario || !pedido || !comando || entradas.length === 0 || entradas.length > 16)
    throw new Error('Configuração indisponível.');
  const encoder = new TextEncoder();
  const candidatos = await Promise.all(
    entradas.map(async ([versao, material]) => {
      if (
        !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(versao) ||
        !(material instanceof Uint8Array) ||
        material.length !== 32
      )
        throw new Error('Configuração indisponível.');
      const chave = await crypto.subtle.importKey(
        'raw',
        new Uint8Array(material),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
      const assinar = async (mensagem: string) =>
        new Uint8Array(await crypto.subtle.sign('HMAC', chave, encoder.encode(mensagem)));
      const bytes = (
        await assinar(`ffcmapp:concessao-equipe:id:v2:${JSON.stringify([usuario, pedido])}`)
      ).slice(0, 16);
      bytes[6] = ((bytes[6] ?? 0) & 15) | 64;
      bytes[8] = ((bytes[8] ?? 0) & 63) | 128;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      const concessao_id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      const digest = await assinar(`ffcmapp:concessao-equipe:comando:v2:${comando}`);
      const digest_idempotencia = btoa(String.fromCharCode(...digest))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      return [versao, Object.freeze({ concessao_id, digest_idempotencia })] as const;
    }),
  );
  return Object.freeze(Object.fromEntries(candidatos));
}
