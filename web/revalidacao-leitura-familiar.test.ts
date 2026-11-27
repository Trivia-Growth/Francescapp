// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { montarCascaParaTeste } from './teste-casca.js';

const id = '10000000-0000-4000-8000-00000000000a';
const sessao = '20000000-0000-4000-8000-000000000001';
const usuario = '30000000-0000-4000-8000-000000000001';
const envelope = (dados: unknown) => Response.json({ dados, request_id: id });

afterEach(() => {
  Reflect.deleteProperty(document, 'hidden');
  Reflect.deleteProperty(document, 'visibilityState');
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
  window.history.replaceState(null, '', '/');
});

it('remove leitura familiar ao ocultar e consulta audiência atual ao retornar', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  sessionStorage.setItem('modo-acesso', 'familiar');
  sessionStorage.setItem('fluxo-familiar', 'AAAAAAAAAAAAAAAAAAAAAA');
  sessionStorage.setItem('sessao-familiar', sessao);
  let consultasPlano = 0;
  vi.stubGlobal('fetch', async (entrada: URL | string) => {
    const caminho = new URL(String(entrada), window.location.origin).pathname;
    if (caminho === '/api/familiar/sessao')
      return envelope({
        session_id: sessao,
        usuario: { id: usuario, perfil: 'familia', ativo: true, versao: 1 },
        capacidades: [],
      });
    if (caminho === '/api/familiar/pacientes')
      return envelope({
        itens: [{ id, nome: 'Paciente fictício', nome_preferencia: null, versao: 1 }],
        proximo_cursor: null,
      });
    if (caminho === `/api/familiar/pacientes/${id}`)
      return envelope({ id, nome: 'Paciente fictício', nome_preferencia: null, versao: 1 });
    if (caminho === `/api/pacientes/${id}/plano`) {
      consultasPlano += 1;
      // A fonte passa a filtrar o objetivo que deixou de ser público.
      const itens =
        consultasPlano === 1
          ? [
              {
                objetivo_id: id,
                versao: 1,
                visibilidade: 'publica',
                ator_usuario_id: usuario,
                data: '2026-11-17T12:00:00Z',
                objetivo: {
                  descricao: 'Objetivo antes compartilhado',
                  area: 'Cuidado',
                  responsavel: 'Equipe',
                  situacaoInicial: 'Inicial',
                  observacaoProgresso: 'Observação',
                  dataRevisao: '2026-12-01',
                  estado: 'proposto',
                },
              },
            ]
          : [];
      return envelope({ itens, proximo_cursor: null });
    }
    throw new Error(`Rota inesperada: ${caminho}`);
  });
  window.history.replaceState(null, '', `/#paciente/${id}/plano`);
  await montarCascaParaTeste();
  await vi.waitFor(() =>
    expect(document.getElementById('ficha-view')?.textContent).toContain(
      'Objetivo antes compartilhado',
    ),
  );
  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
  expect(document.getElementById('patients-view')?.hidden).toBe(true);
  expect(document.getElementById('ficha-view')?.textContent).not.toContain(
    'Objetivo antes compartilhado',
  );
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.waitFor(() => expect(consultasPlano).toBe(2));
  await vi.waitFor(() =>
    expect(document.getElementById('ficha-view')?.textContent).toContain('Nenhum objetivo'),
  );
  expect(document.getElementById('ficha-view')?.textContent).not.toContain(
    'Objetivo antes compartilhado',
  );
});
