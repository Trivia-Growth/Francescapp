import { afterEach, expect, it, vi } from 'vitest';
import auth from '../../auth.ts';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it.each([undefined, '', 'false', 'TRUE'])(
  'bloqueia todas as rotas quando ativação explícita é %s',
  async (ativacao) => {
    vi.stubEnv('FFCM_AUTH_ATIVADO', ativacao);
    const rede = vi.fn();
    vi.stubGlobal('fetch', rede);
    for (const rota of [
      '/api/auth/google',
      '/api/auth/callback',
      '/api/sessao',
      '/api/sessao/sair',
      '/.netlify/functions/auth',
    ]) {
      const resposta = await auth(new Request(`https://app.example.test${rota}`));
      expect(resposta.status).toBe(503);
      expect(resposta.headers.get('cache-control')).toBe('private, no-store');
      expect(resposta.headers.getSetCookie()).toEqual([]);
    }
    expect(rede).not.toHaveBeenCalled();
  },
);
