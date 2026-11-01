import { createServerClient } from '@supabase/ssr';
import { describe, expect, it } from 'vitest';

type Cookie = { name: string; value: string; options: { maxAge?: number } };

describe('isolamento experimental de cookies do SDK', () => {
  it('preserva sessões por chave em callbacks invertidos, mas não um seletor compartilhado', async () => {
    const navegador = new Map<string, string>();
    const publicar = (cookies: Cookie[]) => {
      for (const cookie of cookies) {
        if (cookie.options.maxAge === 0) navegador.delete(cookie.name);
        else navegador.set(cookie.name, cookie.value);
      }
    };
    const criar = (nome: string, origem: Map<string, string>) => {
      const alteracoes: Cookie[] = [];
      const cliente = createServerClient('https://projeto-ficticio.supabase.co', 'chave-ficticia', {
        cookieOptions: { name: nome, httpOnly: true, secure: true, sameSite: 'lax', path: '/' },
        cookies: {
          getAll: () => Array.from(origem, ([name, value]) => ({ name, value })),
          setAll: (cookies) => {
            alteracoes.push(...cookies);
          },
        },
        global: {
          fetch: async (_input, init) => {
            const corpo = JSON.parse(String(init?.body)) as { auth_code: string };
            return Response.json({
              access_token: `token-${corpo.auth_code}`,
              refresh_token: `refresh-${corpo.auth_code}`,
              token_type: 'bearer',
              expires_in: 3600,
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              user: {
                id: corpo.auth_code,
                app_metadata: {},
                user_metadata: {},
                aud: 'authenticated',
                created_at: '2020-01-01T00:00:00Z',
              },
            });
          },
        },
      });
      return { cliente, alteracoes };
    };

    for (const nome of ['sessao-a', 'sessao-b']) {
      const inicio = criar(nome, navegador);
      const resultado = await inicio.cliente.auth.signInWithOAuth({ provider: 'google' });
      expect(resultado.error).toBeNull();
      publicar(inicio.alteracoes);
    }
    const snapshot = new Map(navegador);
    const a = criar('sessao-a', snapshot);
    const b = criar('sessao-b', snapshot);
    expect((await a.cliente.auth.exchangeCodeForSession('usuario-a')).error).toBeNull();
    expect((await b.cliente.auth.exchangeCodeForSession('usuario-b')).error).toBeNull();
    publicar(b.alteracoes);
    publicar(a.alteracoes);

    expect([...navegador.keys()].some((nome) => /^sessao-a(?:\.\d+)?$/.test(nome))).toBe(true);
    expect([...navegador.keys()].some((nome) => /^sessao-b(?:\.\d+)?$/.test(nome))).toBe(true);
    expect(
      (await criar('sessao-a', navegador).cliente.auth.getSession()).data.session?.user.id,
    ).toBe('usuario-a');
    expect(
      (await criar('sessao-b', navegador).cliente.auth.getSession()).data.session?.user.id,
    ).toBe('usuario-b');

    // Um cookie comum escolhendo a chave continua sujeito à ordem das respostas HTTP.
    navegador.set('sessao-selecionada', 'sessao-b');
    navegador.set('sessao-selecionada', 'sessao-a');
    expect(navegador.get('sessao-selecionada')).toBe('sessao-a');
  });
});
