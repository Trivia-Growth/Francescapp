// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

const id = '10000000-0000-4000-8000-000000000001';
const sessionId = '20000000-0000-4000-8000-000000000001';
const envelope = (dados: unknown) => Response.json({ dados, request_id: id });
const pessoa = (n: number, nome: string, nome_preferencia: string | null = null) => ({
  id: `10000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
  nome,
  nome_preferencia,
  versao: 1,
});

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function abrirLista(listar: () => Response | Promise<Response>) {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  sessionStorage.setItem('modo-acesso', 'tecnica');
  sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
  sessionStorage.setItem('sessao-tecnica', sessionId);
  vi.stubGlobal('fetch', async (url: URL | string) => {
    const caminho = typeof url === 'string' ? url.split('?')[0] : url.pathname;
    if (caminho === '/api/sessao')
      return envelope({
        session_id: sessionId,
        usuario: { id, perfil: 'profissional', ativo: true, versao: 1 },
        capacidades: [],
      });
    if (caminho === '/api/pacientes') return listar();
    return new Response(null, { status: 404 });
  });
  await import('./main.js');
}
const el = (nome: string) => document.getElementById(nome) as HTMLElement;
const linhas = () => [...document.querySelectorAll('#patients-body li')];

it('lista os pacientes persistidos com iniciais, nome e preferência', async () => {
  await abrirLista(() =>
    envelope({
      itens: [pessoa(1, 'Ângela Souza', 'Gela'), pessoa(2, 'Bruno Costa')],
      proximo_cursor: null,
    }),
  );
  await vi.waitFor(() => expect(linhas()).toHaveLength(2));
  expect(linhas()[0]?.textContent).toContain('ÂS');
  expect(linhas()[0]?.textContent).toContain('Preferência: Gela');
  expect(el('list-status').textContent).toBe('2 pacientes nesta página.');
  expect(el('list-empty').hidden).toBe(true);
  expect(el('busca').hidden).toBe(false);
});

it('informa lista realmente vazia sem inventar pacientes', async () => {
  await abrirLista(() => envelope({ itens: [], proximo_cursor: null }));
  await vi.waitFor(() => expect(el('list-empty').hidden).toBe(false));
  expect(el('list-empty').textContent).toContain('Nenhum paciente nesta lista');
  expect(linhas()).toHaveLength(0);
  expect(el('patients-body').hidden).toBe(true);
  expect(el('busca').hidden).toBe(true);
});

it('em falha da consulta não mostra nomes nem dados de exemplo e oferece nova tentativa', async () => {
  await abrirLista(() => new Response(null, { status: 503 }));
  await vi.waitFor(() => expect(el('list-status').textContent).toContain('Atualizar lista'));
  expect(el('list-status').dataset.tone).toBe('error');
  expect(linhas()).toHaveLength(0);
  expect(el('list-empty').hidden).toBe(true);
  expect(el('busca').hidden).toBe(true);
  expect(el('reload-patients').hasAttribute('aria-disabled')).toBe(false);
});

it('limita a busca aos pacientes carregados e não declara que não existem outros', async () => {
  await abrirLista(() =>
    envelope({
      itens: [pessoa(1, 'Ângela Souza', 'Gela'), pessoa(2, 'Bruno Costa')],
      proximo_cursor: 'cursor-ficticio',
    }),
  );
  await vi.waitFor(() => expect(linhas()).toHaveLength(2));
  expect(el('busca-aviso').textContent).toContain('os pacientes desta página');
  const campo = el('busca-pacientes') as HTMLInputElement;
  campo.value = 'angela';
  campo.dispatchEvent(new Event('input', { bubbles: true }));
  expect(linhas()).toHaveLength(1);
  expect(linhas()[0]?.textContent).toContain('Ângela Souza');
  expect(el('list-status').textContent).toBe('1 de 2 pacientes desta página correspondem à busca.');
  campo.value = 'gela';
  campo.dispatchEvent(new Event('input', { bubbles: true }));
  expect(linhas()).toHaveLength(1);
  campo.value = 'zzz';
  campo.dispatchEvent(new Event('input', { bubbles: true }));
  expect(linhas()).toHaveLength(0);
  expect(el('busca-vazia').hidden).toBe(false);
  // Não afirma que o paciente não existe: aponta as outras páginas.
  expect(el('busca-vazia').textContent).toContain(
    'Avance para as próximas páginas para continuar procurando',
  );
  expect(el('list-empty').hidden).toBe(true);
  campo.value = '';
  campo.dispatchEvent(new Event('input', { bubbles: true }));
  expect(linhas()).toHaveLength(2);
  expect(el('busca-vazia').hidden).toBe(true);
});
