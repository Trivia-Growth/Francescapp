// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('identifica e limpa erros nos campos opcionais sem enviar cadastro', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  const id = '10000000-0000-4000-8000-000000000001';
  const csrf = 'a'.repeat(43);
  const sessao = {
    usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
    capacidades: ['administrar_cadastro'],
  };
  const envelope = (dados: unknown) => Response.json({ dados, request_id: id });
  let postagens = 0;
  vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
    if (url.pathname === '/api/sessao/desafio-tecnico')
      return envelope({ csrf, seletor_desafio: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
    if (url.pathname === '/api/sessao/tecnica')
      return envelope({
        sessao,
        access_token: 'token-ficticio',
        prova_sessao: 'A'.repeat(43),
        geracao_sessao: 1,
        csrf,
        seletor_sessao: id,
      });
    if (url.pathname === '/api/sessao') return envelope(sessao);
    if (url.pathname === '/api/pacientes' && init.method === 'GET')
      return envelope({ itens: [], proximo_cursor: null });
    if (url.pathname === '/api/pacientes' && init.method === 'POST') postagens++;
    throw new Error('Rota inesperada');
  });
  await import('./main.js');
  const elemento = <T extends HTMLElement>(nome: string) => document.getElementById(nome) as T;
  await vi.waitFor(() =>
    expect(elemento<HTMLFieldSetElement>('login-fields').disabled).toBe(false),
  );
  elemento<HTMLInputElement>('email').value = 'tecnica@example.test';
  elemento<HTMLInputElement>('password').value = 'senha-ficticia';
  elemento('login-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(elemento('patients-view').hidden).toBe(false));
  elemento<HTMLInputElement>('patient-name').value = 'Paciente fictício';
  const preferencia = elemento<HTMLInputElement>('preferred-name');
  const nascimento = elemento<HTMLInputElement>('birth-date');
  preferencia.value = 'x'.repeat(201);
  nascimento.value = '10000-01-01';
  elemento('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
  expect(preferencia.getAttribute('aria-invalid')).toBe('true');
  expect(nascimento.getAttribute('aria-invalid')).toBe('true');
  expect(document.activeElement).toBe(preferencia);
  expect(elemento('preferred-error').textContent).toBeTruthy();
  expect(elemento('birth-error').textContent).toBeTruthy();
  expect(preferencia.getAttribute('aria-describedby')).toBe('preferred-error');
  expect(nascimento.getAttribute('aria-describedby')).toBe('birth-error');
  preferencia.value = 'x'.repeat(202);
  nascimento.value = '10001-01-01';
  preferencia.dispatchEvent(new Event('input'));
  nascimento.dispatchEvent(new Event('input'));
  expect(preferencia.getAttribute('aria-invalid')).toBe('true');
  expect(nascimento.getAttribute('aria-invalid')).toBe('true');
  expect(elemento('preferred-error').textContent).toBeTruthy();
  expect(elemento('birth-error').textContent).toBeTruthy();
  preferencia.value = 'Nome fictício';
  nascimento.value = '2000-01-01';
  preferencia.dispatchEvent(new Event('input'));
  nascimento.dispatchEvent(new Event('input'));
  expect(preferencia.hasAttribute('aria-invalid')).toBe(false);
  expect(nascimento.hasAttribute('aria-invalid')).toBe(false);
  expect(elemento('preferred-error').textContent).toBe('');
  expect(elemento('birth-error').textContent).toBe('');
  expect(postagens).toBe(0);
});
