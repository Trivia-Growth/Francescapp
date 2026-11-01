/** Chamar apenas após leitor comprovar origem, CSRF e seletor da tentativa. */
export function limparCookiesDesafio(
  resposta: Response,
  seletor: string,
  google: boolean,
): Response {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(seletor))
    return resposta;
  const atributos = 'Path=/api/sessao; HttpOnly; SameSite=Lax; Secure; Max-Age=0';
  resposta.headers.append('Set-Cookie', `ffcm_csrf_desafio_${seletor}=; ${atributos}`);
  if (google) resposta.headers.append('Set-Cookie', `ffcm_nonce_${seletor}=; ${atributos}`);
  return resposta;
}
