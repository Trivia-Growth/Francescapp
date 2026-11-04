// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

it('mantém a página oculta fora de localhost ou em produção', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'exemplo.test' });
  await import('./demonstracao.js');
  expect(document.body.hidden).toBe(true);
  vi.resetModules();
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', false);
  await import('./demonstracao.js');
  expect(document.body.hidden).toBe(true);
});

it('permite cadastrar fictício em memória sem chamar serviço', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await import('./demonstracao.js');
  document.getElementById('demo-login')?.click();
  (document.getElementById('patient-name') as HTMLInputElement).value = 'Pessoa Fictícia';
  document.getElementById('create-form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(document.getElementById('patients-body')?.textContent).toContain('Pessoa Fictícia');
  expect(fetch).not.toHaveBeenCalled();
});
