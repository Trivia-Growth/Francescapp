import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import auth from '../../auth.ts';

/** O nome do cookie de sessão carrega o fluxo (`ffcm-auth-<fluxo>`), e cada entrada
 * bem-sucedida grava um nome inédito. Sem expirar os anteriores, cada entrada deixava para
 * trás cerca de 4,6 KB por 400 dias; na quarta o cabeçalho `Cookie` passava do limite da
 * plataforma e **toda** requisição à origem voltava `HTTP 400` — a página estática inclusive.
 *
 * Esse estado não se recupera sozinho: o 400 acontece na borda, antes de qualquer função
 * nossa, então nem a entrada seguinte consegue limpar nada. A única saída é apagar os
 * cookies à mão no navegador. Observado em 22/11/2026 com oito cookies (18.920 bytes).
 *
 * Dados fictícios. */

const origem = 'https://app.example.test';
const fluxo = 'AAAAAAAAAAAAAAAAAAAAAA';
const fluxoAntigo = 'BBBBBBBBBBBBBBBBBBBBBB';
const fluxoEmCurso = 'CCCCCCCCCCCCCCCCCCCCCC';
const id = '11111111-1111-4111-8111-111111111111';
const usuario = {
  id,
  aud: 'authenticated',
  app_metadata: {
    provider: 'email',
    ffcm_provisionamento_id: '22222222-2222-4222-8222-222222222222',
  },
  user_metadata: {},
  email: 'ficticio@example.test',
  email_confirmed_at: '2026-11-18T10:00:00Z',
};
const sessao = {
  session_id: '33333333-3333-4333-8333-333333333333',
  usuario: { id, perfil: 'familia', ativo: true, versao: 1 },
  capacidades: [],
};
const exp = Math.floor(Date.now() / 1000) + 3600;
const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, exp })).toString('base64url')}.ZmFrZQ`;

beforeEach(() => {
  vi.stubEnv('FFCM_AUTH_ATIVADO', 'true');
  vi.stubEnv('FFCM_AUTH_INTERNO_ATIVADO', 'true');
  vi.stubEnv('FFCM_SUPABASE_URL', 'https://projeto-ficticio.supabase.co');
  vi.stubEnv('FFCM_SUPABASE_ANON_KEY', 'chave-publica-ficticia');
  vi.stubEnv('FFCM_APP_ORIGIN', origem);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entrada: RequestInfo | URL) => {
      const url = new URL(String(entrada));
      if (url.pathname === '/auth/v1/token')
        return Response.json({
          access_token: token,
          refresh_token: 'refresh-ficticio',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: exp,
          user: usuario,
        });
      if (url.pathname === '/auth/v1/user') return Response.json(usuario);
      if (url.pathname === '/rest/v1/rpc/admitir_sessao_interna_nativa')
        return Response.json(sessao);
      throw new Error('Rota fictícia inesperada.');
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function entrar(cookie: string) {
  const resposta = await auth(
    new Request(`${origem}/api/auth/interno`, {
      method: 'POST',
      headers: { origin: origem, 'content-type': 'application/json', 'x-fluxo': fluxo, cookie },
      body: JSON.stringify({ email: usuario.email, senha: 'senha-ficticia' }),
    }),
  );
  expect(resposta.status).toBe(200);
  return resposta.headers.getSetCookie();
}

function expirado(cookies: string[], nome: string): boolean {
  return cookies.some(
    (c) => c.startsWith(`${nome}=;`) && /max-age=0(?:;|$)/i.test(c.replace(/\s/g, '')),
  );
}

it('expira a sessão deixada por uma entrada anterior do mesmo navegador', async () => {
  const cookies = await entrar(
    `ffcm-auth-${fluxoAntigo}.0=base64-ficticio-parte-0; ffcm-auth-${fluxoAntigo}.1=base64-ficticio-parte-1`,
  );
  expect(expirado(cookies, `ffcm-auth-${fluxoAntigo}.0`)).toBe(true);
  expect(expirado(cookies, `ffcm-auth-${fluxoAntigo}.1`)).toBe(true);
});

it('grava a sessão do fluxo atual sem expirá-la', async () => {
  const cookies = await entrar(`ffcm-auth-${fluxoAntigo}.0=base64-ficticio`);
  const doAtual = cookies.filter((c) => c.startsWith(`ffcm-auth-${fluxo}`));
  expect(doAtual.length).toBeGreaterThan(0);
  expect(doAtual.every((c) => !/max-age=0(?:;|$)/i.test(c.replace(/\s/g, '')))).toBe(true);
});

it('não toca no verificador de uma entrada ainda em andamento', async () => {
  // O `-code-verifier` de outro fluxo é uma entrada concorrente, dura dez minutos e some
  // sozinha. Expirá-lo derrubaria um login legítimo acontecendo em outra aba.
  const cookies = await entrar(`ffcm-auth-${fluxoEmCurso}-code-verifier=verificador-ficticio`);
  expect(cookies.some((c) => c.startsWith(`ffcm-auth-${fluxoEmCurso}-code-verifier`))).toBe(false);
});
