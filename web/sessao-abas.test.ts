import { afterEach, expect, it, vi } from 'vitest';
import { ClienteFFCM } from './api.js';

afterEach(() => vi.unstubAllGlobals());

it('outra aba com login recusado não impede saída da sessão original', async () => {
  const id = '10000000-0000-4000-8000-000000000001';
  const sessionId = '20000000-0000-4000-8000-000000000001';
  const sessao = {
    session_id: sessionId,
    usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
    capacidades: [],
  };
  const envelope = (dados: unknown) => Response.json({ dados, request_id: id });
  vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
  vi.stubGlobal('fetch', async (url: URL, opcoes: RequestInit) => {
    if (url.pathname === '/api/auth/tecnica') return new Response(null, { status: 401 });
    if (url.pathname === '/api/sessao') return envelope(sessao);
    if (url.pathname === '/api/sessao/sair') {
      expect(new Headers(opcoes.headers).get('x-sessao')).toBe(sessionId);
      expect(opcoes.credentials).toBe('same-origin');
      return envelope({ encerrada_localmente: true, pendencia_externa: false });
    }
    throw new Error('Rota inesperada na fixture.');
  });
  const primeira = new ClienteFFCM();
  const segunda = new ClienteFFCM();
  await primeira.consultarSessao();
  await expect(segunda.entrar('outra@example.test', 'senha-ficticia')).rejects.toBeDefined();
  await expect(primeira.sair()).resolves.toMatchObject({ encerrada_localmente: true });
});
