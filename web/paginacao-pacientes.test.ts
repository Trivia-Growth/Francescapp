// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { mensagensErro } from '../packages/contracts/src/index.js';

const id = '10000000-0000-4000-8000-000000000001';
const csrf = 'a'.repeat(43);
const sessao = {
  usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
  capacidades: [],
};
const envelope = (dados: unknown) => Response.json({ dados, request_id: id });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it.each(['sucesso', 'erro', 'foco-movido', 'pagina-intermediaria'] as const)(
  'preserva navegação de teclado durante consulta: %s',
  async (caso) => {
    document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
    let resolver!: (resposta: Response) => void;
    vi.stubGlobal('fetch', async (url: URL) => {
      if (url.pathname === '/api/sessao/desafio-tecnico')
        return envelope({ csrf, seletor_desafio: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
      if (url.pathname === '/api/sessao/tecnica')
        return envelope({
          sessao,
          access_token: 'token-ficticio',
          prova_sessao: 'A'.repeat(43),
          geracao_sessao: 1,
          csrf,
          seletor_sessao: '20000000-0000-4000-8000-000000000001',
        });
      if (url.pathname === '/api/sessao') return envelope(sessao);
      if (url.pathname === '/api/pacientes') {
        if (!url.searchParams.has('cursor'))
          return envelope({ itens: [], proximo_cursor: 'cursor-ficticio' });
        return new Promise<Response>((resolve) => {
          resolver = resolve;
        });
      }
      throw new Error('Rota inesperada.');
    });
    await import('./main.js');
    const elemento = <T extends HTMLElement>(nome: string) => document.getElementById(nome) as T;
    await vi.waitFor(() =>
      expect(elemento<HTMLFieldSetElement>('login-fields').disabled).toBe(false),
    );
    elemento<HTMLInputElement>('email').value = 'tecnica@example.test';
    elemento<HTMLInputElement>('password').value = 'senha-ficticia';
    elemento('login-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(elemento('pagination').hidden).toBe(false));
    expect(elemento('empty-description').textContent).toBe(
      'Nenhum paciente nesta página. Avance para continuar a consulta.',
    );
    const proximo = elemento<HTMLButtonElement>('next-page');
    proximo.focus();
    proximo.click();
    await vi.waitFor(() => expect(resolver).toBeDefined());
    expect(elemento('pagination').hidden).toBe(false);
    expect(document.activeElement).toBe(proximo);
    if (caso === 'foco-movido') elemento<HTMLButtonElement>('logout').focus();
    resolver(
      caso === 'erro'
        ? new Response(null, { status: 503 })
        : envelope({
            itens: [],
            proximo_cursor: caso === 'pagina-intermediaria' ? 'outro-cursor' : null,
          }),
    );
    await vi.waitFor(() =>
      expect(elemento('reload-patients').hasAttribute('aria-disabled')).toBe(false),
    );
    expect(document.activeElement).toBe(
      caso === 'foco-movido'
        ? elemento('logout')
        : caso === 'pagina-intermediaria'
          ? proximo
          : elemento('previous-page'),
    );
    if (caso === 'pagina-intermediaria') {
      expect(elemento('empty-description').textContent).toBe(
        'Nenhum paciente nesta página. Use a página anterior ou a próxima para continuar a consulta.',
      );
    }
  },
);

it.each([422, 503])('recupera navegação após falha %s na página seguinte', async (status) => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  const cursores: Array<string | null> = [];
  vi.stubGlobal('fetch', async (url: URL) => {
    if (url.pathname === '/api/sessao/desafio-tecnico')
      return envelope({ csrf, seletor_desafio: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
    if (url.pathname === '/api/sessao/tecnica')
      return envelope({
        sessao,
        access_token: 'token-ficticio',
        prova_sessao: 'A'.repeat(43),
        geracao_sessao: 1,
        csrf,
        seletor_sessao: '20000000-0000-4000-8000-000000000001',
      });
    if (url.pathname === '/api/sessao') return envelope(sessao);
    if (url.pathname === '/api/pacientes') {
      const cursor = url.searchParams.get('cursor');
      cursores.push(cursor);
      if (cursor) {
        const codigo = status === 422 ? 'entrada_invalida' : 'servico_indisponivel';
        return Response.json(
          { erro: { codigo, mensagem: mensagensErro[codigo] }, request_id: id },
          { status },
        );
      }
      return envelope({ itens: [], proximo_cursor: 'cursor-ficticio' });
    }
    throw new Error('Rota inesperada.');
  });
  await import('./main.js');
  const elemento = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  await vi.waitFor(() =>
    expect(elemento<HTMLFieldSetElement>('login-fields').disabled).toBe(false),
  );
  elemento<HTMLInputElement>('email').value = 'tecnica@example.test';
  elemento<HTMLInputElement>('password').value = 'senha-ficticia';
  elemento('login-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(cursores).toHaveLength(1));
  await vi.waitFor(() => expect(elemento('pagination').hidden).toBe(false));
  elemento<HTMLButtonElement>('next-page').click();
  await vi.waitFor(() => expect(cursores).toHaveLength(2));
  await vi.waitFor(() =>
    expect(elemento('reload-patients').hasAttribute('aria-disabled')).toBe(false),
  );
  if (status === 422) {
    expect(elemento('list-status').textContent).toContain('primeira página');
    elemento<HTMLButtonElement>('reload-patients').click();
  } else {
    expect(elemento('pagination').hidden).toBe(false);
    elemento<HTMLButtonElement>('previous-page').click();
  }
  await vi.waitFor(() => expect(cursores).toEqual([null, 'cursor-ficticio', null]));
});

it('mantém recuperação acessível quando voltar à primeira página falha', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  let consultasPrimeiraPagina = 0;
  vi.stubGlobal('fetch', async (url: URL) => {
    if (url.pathname === '/api/sessao/desafio-tecnico')
      return envelope({ csrf, seletor_desafio: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
    if (url.pathname === '/api/sessao/tecnica')
      return envelope({
        sessao,
        access_token: 'token-ficticio',
        prova_sessao: 'A'.repeat(43),
        geracao_sessao: 1,
        csrf,
        seletor_sessao: '20000000-0000-4000-8000-000000000001',
      });
    if (url.pathname === '/api/sessao') return envelope(sessao);
    if (url.pathname === '/api/pacientes') {
      if (url.searchParams.has('cursor')) return envelope({ itens: [], proximo_cursor: null });
      consultasPrimeiraPagina += 1;
      if (consultasPrimeiraPagina === 2) return new Response(null, { status: 503 });
      return envelope({ itens: [], proximo_cursor: 'cursor-ficticio' });
    }
    throw new Error('Rota inesperada.');
  });
  await import('./main.js');
  const elemento = <T extends HTMLElement>(nome: string) => document.getElementById(nome) as T;
  await vi.waitFor(() =>
    expect(elemento<HTMLFieldSetElement>('login-fields').disabled).toBe(false),
  );
  elemento<HTMLInputElement>('email').value = 'tecnica@example.test';
  elemento<HTMLInputElement>('password').value = 'senha-ficticia';
  elemento('login-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(elemento('pagination').hidden).toBe(false));
  elemento<HTMLButtonElement>('next-page').click();
  await vi.waitFor(() => expect(elemento('page-number').textContent).toBe('Página 2'));
  expect(elemento('empty-description').textContent).toBe(
    'Nenhum paciente nesta página. Volte à página anterior para continuar a consulta.',
  );
  const anterior = elemento<HTMLButtonElement>('previous-page');
  anterior.focus();
  anterior.click();
  await vi.waitFor(() => expect(elemento('list-status').textContent).toContain('Atualizar lista'));
  expect(elemento('pagination').hidden).toBe(true);
  expect(document.activeElement).toBe(elemento('reload-patients'));
  elemento<HTMLButtonElement>('reload-patients').click();
  await vi.waitFor(() => expect(elemento('page-number').textContent).toBe('Página 1'));
  expect(elemento('pagination').hidden).toBe(false);
});
