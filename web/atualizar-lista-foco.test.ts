// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

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

it.each(['sucesso', 'erro'])(
  'mantém foco e evita pedidos duplicados ao atualizar: %s',
  async (caso) => {
    document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
    let consultas = 0;
    let concluir!: (resposta: Response) => void;
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
        consultas++;
        if (consultas === 1) return envelope({ itens: [], proximo_cursor: null });
        return new Promise<Response>((resolve) => {
          concluir = resolve;
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
    await vi.waitFor(() => expect(elemento('list-status').textContent).toContain('nesta página'));
    const atualizar = elemento<HTMLButtonElement>('reload-patients');
    atualizar.focus();
    atualizar.click();
    await vi.waitFor(() => expect(concluir).toBeDefined());
    expect(atualizar.disabled).toBe(false);
    expect(atualizar.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(atualizar);
    atualizar.click();
    expect(consultas).toBe(2);
    concluir(
      caso === 'erro'
        ? new Response(null, { status: 503 })
        : envelope({ itens: [], proximo_cursor: null }),
    );
    await vi.waitFor(() => expect(atualizar.hasAttribute('aria-disabled')).toBe(false));
    expect(document.activeElement).toBe(atualizar);
  },
);
