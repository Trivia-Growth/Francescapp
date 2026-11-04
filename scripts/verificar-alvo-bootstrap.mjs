// Validação prévia somente de leitura. A confirmação independente do alvo deve
// ser obtida fora deste módulo; esta consulta não autentica uma conexão SQL.
const REF = /^[a-z0-9]{20}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function verificarAlvoBootstrap({
  projetoRef,
  projetoRefConfirmado,
  uuidAuth,
  email,
  token,
}) {
  if (
    !REF.test(projetoRef ?? '') ||
    projetoRef !== projetoRefConfirmado ||
    !UUID.test(uuidAuth ?? '') ||
    typeof email !== 'string' ||
    email.length > 320 ||
    !/^[^\s@]+@[^\s@]+$/.test(email) ||
    typeof token !== 'string' ||
    !token.trim()
  ) {
    throw new Error('Dados de verificação inválidos ou alvo não confirmado.');
  }
  const base = `https://api.supabase.com/v1/projects/${projetoRef}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  try {
    const projeto = await fetch(base, { headers, redirect: 'error' });
    if (!projeto.ok) throw new Error();
    const dadosProjeto = await projeto.json();
    if (dadosProjeto.ref !== projetoRef) throw new Error();
    const resposta = await fetch(`${base}/database/query/read-only`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      redirect: 'error',
      body: JSON.stringify({
        query:
          'select exists(select 1 from auth.users where id = $1::uuid and lower(email) = lower($2::text)) as corresponde',
        parameters: [uuidAuth, email],
      }),
    });
    if (!resposta.ok) throw new Error();
    const resultado = await resposta.json();
    if (!Array.isArray(resultado) || resultado.length !== 1 || resultado[0]?.corresponde !== true)
      throw new Error();
  } catch {
    // Nunca repassar corpo HTTP, exceção de rede, token ou identidade ao log.
    throw new Error(
      'Não foi possível confirmar projeto e vínculo Auth pela API somente de leitura.',
    );
  }
}
