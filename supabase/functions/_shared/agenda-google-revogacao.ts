/** Google revoga todos os escopos concedidos ao projeto. Só chamar após comprovar
 * projeto isolado e barreira de reconexão concorrente. Uma falha ou timeout não
 * prova que o pedido deixou de ser processado. */
export async function revogarConcessaoGoogle(
  refreshToken: string,
): Promise<'confirmada' | 'nao_comprovada'> {
  if (!refreshToken || refreshToken.length > 4096) return 'nao_comprovada';
  try {
    const resposta = await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: refreshToken }),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    return resposta.status === 200 ? 'confirmada' : 'nao_comprovada';
  } catch {
    return 'nao_comprovada';
  }
}
