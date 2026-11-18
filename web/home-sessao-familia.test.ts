// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

const idA = '10000000-0000-4000-8000-00000000000a';
const sessionId = '20000000-0000-4000-8000-000000000001';
const usuarioId = '30000000-0000-4000-8000-000000000001';
const envelope = (dados: unknown) => Response.json({ dados, request_id: idA });

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
  window.history.replaceState(null, '', '/');
});

/** Regressão: `aplicarSessao` sempre fecha a ficha para família (regra pré-existente, sem
 * relação com troca de identidade — a sessão da família não muda entre chamadas). Rotear de
 * novo a cada revalidação só porque esse fechamento aconteceu remontaria a ficha, refazendo
 * a consulta do paciente, toda vez que a aba voltasse a ficar visível.
 *
 * Arquivo isolado (um só teste): ver nota em `home-sessao-troca-perfil.test.ts` sobre o
 * listener de `visibilitychange` de `main.js` sobrevivendo a `vi.resetModules()`. */
it('família não remonta a ficha a cada revalidação quando a sessão não mudou', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  sessionStorage.setItem('modo-acesso', 'familiar');
  sessionStorage.setItem('fluxo-familiar', 'AAAAAAAAAAAAAAAAAAAAAA');
  sessionStorage.setItem('sessao-familiar', sessionId);
  let consultasPaciente = 0;
  vi.stubGlobal('fetch', async (url: URL) => {
    if (url.pathname === '/api/familiar/sessao')
      return envelope({
        session_id: sessionId,
        usuario: { id: usuarioId, perfil: 'familia', ativo: true, versao: 1 },
        capacidades: [],
      });
    if (url.pathname === '/api/familiar/pacientes')
      return envelope({
        itens: [{ id: idA, nome: 'Paciente Vinculado', nome_preferencia: null, versao: 1 }],
        proximo_cursor: null,
      });
    if (url.pathname === `/api/familiar/pacientes/${idA}`) {
      consultasPaciente += 1;
      return envelope({ id: idA, nome: 'Paciente Vinculado', nome_preferencia: null });
    }
    throw new Error(`Rota inesperada: ${url.pathname}`);
  });
  window.history.replaceState(null, '', `/#paciente/${idA}/dados`);
  await import('./main.js');
  await vi.waitFor(() => expect(consultasPaciente).toBe(1));

  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  document.dispatchEvent(new Event('visibilitychange'));
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  document.dispatchEvent(new Event('visibilitychange'));
  // Dá tempo para uma eventual remontagem (e a nova consulta que ela dispararia) terminar
  // antes de conferir que não aconteceu; esperar só algum estado visível não garante isso.
  for (let volta = 0; volta < 5; volta += 1) await new Promise((r) => setTimeout(r, 0));

  // Regra pré-existente, fora do escopo desta correção: `aplicarSessao` sempre fecha a
  // ficha para família (não só na troca de identidade) e nada a reabre sozinho — por isso a
  // ficha fica fechada aqui, não reaberta. O que esta prova protege é não haver consulta
  // repetida; se a ficha reabrisse, haveria uma 2ª consulta.
  expect(consultasPaciente).toBe(1);
  Reflect.deleteProperty(document, 'hidden');
});
