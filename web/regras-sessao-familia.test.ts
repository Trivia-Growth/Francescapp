// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

const id = '10000000-0000-4000-8000-00000000000a';
const sessionId = '20000000-0000-4000-8000-000000000001';
const usuarioId = '30000000-0000-4000-8000-000000000001';
const envelope = (dados: unknown) => Response.json({ dados, request_id: id });

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
  window.history.replaceState(null, '', '/');
});

/** Regressão: "#regras" não tem controle de perfil no link (`web/index.html`) — família
 * alcança essa tela. `aplicarSessao` sempre fecha a ficha para família, mas essa regra não
 * pode também fechar outras telas (home/administração/regras) sem motivo de troca real,
 * senão a página fica em branco a cada revalidação sem ninguém reabrir sozinho. */
it('família com "Como funciona" aberto não perde a tela ao revalidar sem troca de sessão', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  sessionStorage.setItem('modo-acesso', 'familiar');
  sessionStorage.setItem('fluxo-familiar', 'AAAAAAAAAAAAAAAAAAAAAA');
  sessionStorage.setItem('sessao-familiar', sessionId);
  let consultasRegras = 0;
  vi.stubGlobal('fetch', async (entrada: URL | string) => {
    const caminho = typeof entrada === 'string' ? entrada.split('?')[0] : entrada.pathname;
    if (caminho === '/api/familiar/sessao')
      return envelope({
        session_id: sessionId,
        usuario: { id: usuarioId, perfil: 'familia', ativo: true, versao: 1 },
        capacidades: [],
      });
    if (caminho === '/api/familiar/pacientes') return envelope({ itens: [], proximo_cursor: null });
    if (caminho === '/api/regras-atendimento') {
      consultasRegras += 1;
      return envelope([]);
    }
    throw new Error(`Rota inesperada: ${caminho}`);
  });
  window.history.replaceState(null, '', '/#regras');
  await import('./main.js');
  await vi.waitFor(() => expect(consultasRegras).toBe(1));
  await vi.waitFor(() => expect(document.getElementById('regras-view')?.hidden).toBe(false));

  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  document.dispatchEvent(new Event('visibilitychange'));
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  document.dispatchEvent(new Event('visibilitychange'));
  for (let volta = 0; volta < 5; volta += 1) await new Promise((r) => setTimeout(r, 0));

  expect(document.getElementById('regras-view')?.hidden).toBe(false);
  expect(consultasRegras).toBe(1);
  Reflect.deleteProperty(document, 'hidden');
});
