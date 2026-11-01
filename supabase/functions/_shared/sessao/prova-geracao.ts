function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Não registrar prova nem seu verificador: ambos são sensíveis no canal restrito. */
export async function hashProvaGeracao(prova: string): Promise<string> {
  if (typeof prova !== 'string' || !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(prova))
    throw new Error('Prova inválida.');
  const binario = atob(`${prova.replace(/-/g, '+').replace(/_/g, '/')}=`);
  const bytes = Uint8Array.from(binario, (caractere) => caractere.charCodeAt(0));
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}

export async function criarProvaGeracao() {
  const prova = base64url(crypto.getRandomValues(new Uint8Array(32)));
  return { prova, provaHash: await hashProvaGeracao(prova) };
}
