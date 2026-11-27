// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { montarCascaParaTeste } from './teste-casca.js';

const idA = '10000000-0000-4000-8000-00000000000a';
const idB = '10000000-0000-4000-8000-00000000000b';
const sessionId = '20000000-0000-4000-8000-000000000001';
const usuarioId = '30000000-0000-4000-8000-000000000001';
const envelope = (dados: unknown) => Response.json({ dados, request_id: idA });

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
  window.history.replaceState(null, '', '/');
});

/** Risco do design.md ("nenhum contador global ou cache compartilhado entre sessões"): a
 * revalidação periódica (`revalidarAcesso`, acionada ao voltar à aba) pode trazer um perfil
 * diferente para a MESMA sessão/usuário — por exemplo, outra conta assumindo o cookie
 * compartilhado do navegador em outra aba. `aplicarSessao` detecta a troca de perfil, mas a
 * leitura da pinagem de sessão em `api.ts` só compara `session_id` e `usuario.id`, não
 * `perfil` — então é exatamente esse caso que chega a `aplicarSessao` sem ser barrado antes.
 *
 * Arquivo isolado (um só teste): o listener de `visibilitychange` que `main.js` registra em
 * `document` não é removido por `vi.resetModules()`, então um segundo `import('./main.js')`
 * no mesmo arquivo deixaria o módulo da primeira execução reagindo aos eventos da segunda. */
it('perfil trocado na revalidação remonta "Seu dia" em vez de manter o caso da sessão anterior', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  sessionStorage.setItem('modo-acesso', 'tecnica');
  sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
  sessionStorage.setItem('sessao-tecnica', sessionId);
  let consultasSessao = 0;
  vi.stubGlobal('fetch', async (url: URL) => {
    if (url.pathname === '/api/sessao') {
      consultasSessao += 1;
      return envelope({
        session_id: sessionId,
        usuario: {
          id: usuarioId,
          perfil: consultasSessao === 1 ? 'profissional' : 'administrador',
          ativo: true,
          versao: 1,
        },
        capacidades: [],
      });
    }
    if (url.pathname === '/api/pacientes') {
      const caso =
        consultasSessao === 1
          ? {
              id: idA,
              nome: 'Caso da Primeira Sessão',
              nome_preferencia: null,
              versao: 1,
              sinal: { estado: 'atencao_operacional', motivos: ['Motivo A.'] },
            }
          : {
              id: idB,
              nome: 'Caso da Segunda Sessão',
              nome_preferencia: null,
              versao: 1,
              sinal: { estado: 'atencao_operacional', motivos: ['Motivo B.'] },
            };
      return envelope({ itens: [caso], proximo_cursor: null });
    }
    throw new Error(`Rota inesperada: ${url.pathname}`);
  });
  await montarCascaParaTeste();
  await vi.waitFor(() =>
    expect(document.getElementById('home-view')?.textContent).toContain('Caso da Primeira Sessão'),
  );

  // Aba volta a ficar visível: dispara a revalidação, que desta vez devolve outro perfil.
  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  document.dispatchEvent(new Event('visibilitychange'));
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  document.dispatchEvent(new Event('visibilitychange'));

  await vi.waitFor(() =>
    expect(document.getElementById('home-view')?.textContent).toContain('Caso da Segunda Sessão'),
  );
  expect(document.getElementById('home-view')?.textContent).not.toContain(
    'Caso da Primeira Sessão',
  );
  Reflect.deleteProperty(document, 'hidden');
});
