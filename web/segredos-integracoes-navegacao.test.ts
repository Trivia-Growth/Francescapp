// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { montarCascaParaTeste } from './teste-casca.js';
const id = '10000000-0000-4000-8000-000000000001';
const sid = '20000000-0000-4000-8000-000000000001';
const envelope = (dados: unknown) => Response.json({ dados, request_id: id });
let desmontarEventos = () => {};
afterEach(() => {
  desmontarEventos();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
  window.history.replaceState(null, '', '/');
});
function preparar(perfil: 'administrador' | 'profissional') {
  // main é entrada de página: resetModules não desmonta seus listeners globais.
  // Cada cenário precisa encerrar a página anterior, sem reaproveitar ator antigo.
  const janela = vi.spyOn(window, 'addEventListener');
  const documento = vi.spyOn(document, 'addEventListener');
  desmontarEventos = () => {
    for (const args of janela.mock.calls) window.removeEventListener(...args);
    for (const args of documento.mock.calls) document.removeEventListener(...args);
    janela.mockRestore();
    documento.mockRestore();
  };
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  window.history.replaceState(null, '', '#carteira');
  sessionStorage.setItem('modo-acesso', 'tecnica');
  sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
  sessionStorage.setItem('sessao-tecnica', sid);
  const caminhos: string[] = [];
  vi.stubGlobal('fetch', async (entrada: URL | string) => {
    const url = new URL(String(entrada), window.location.origin);
    caminhos.push(url.pathname + url.search);
    if (url.pathname === '/api/sessao')
      return envelope({
        session_id: sid,
        usuario: { id, perfil, ativo: true, versao: 1 },
        capacidades: [],
      });
    if (url.pathname === '/api/pacientes') return envelope({ itens: [], proximo_cursor: null });
    if (url.pathname === '/api/admin/campo-extra-plano') return envelope([]);
    if (url.pathname === '/api/admin/configuracao-sistema') return envelope([]);
    if (url.pathname === '/api/admin/segredos-integracoes')
      return envelope(
        url.searchParams.get('operacao') === 'expurgo'
          ? { ativo: false, ultima_execucao: null }
          : [
              {
                chave: 'ffcmapp.integracao.openrouter',
                cadastrado: true,
                versao: 2,
                atualizado_por_usuario_id: null,
                atualizado_em: null,
              },
            ],
      );
    throw new Error(`Rota fictícia não prevista: ${url.pathname}`);
  });
  return caminhos;
}
it('navega pela administração até credenciais, desmonta valor digitado e relê só metadados', async () => {
  const caminhos = preparar('administrador');
  await montarCascaParaTeste();
  await vi.waitFor(() => expect(document.getElementById('patients-view')?.hidden).toBe(false));
  document.getElementById('nav-administracao')?.click();
  await vi.waitFor(() =>
    expect(document.getElementById('administracao-conteudo')?.textContent).toContain(
      'Nenhum ajuste disponível',
    ),
  );
  await vi.waitFor(() =>
    expect(document.querySelector('a[href="#administracao/integracoes"]')).not.toBeNull(),
  );
  (document.querySelector('a[href="#administracao/integracoes"]') as HTMLAnchorElement).click();
  await vi.waitFor(() =>
    expect(document.getElementById('administracao-conteudo')?.textContent).toContain('Versão 2'),
  );
  expect(window.location.hash).toBe('#administracao/integracoes');
  expect(
    document.querySelector('a[href="#administracao/integracoes"]')?.getAttribute('aria-current'),
  ).toBe('page');
  const antigo = document.querySelector<HTMLInputElement>(
    '#administracao-conteudo input[type="password"]',
  );
  if (!antigo) throw new Error('Campo ausente');
  antigo.value = 'valor-ficticio-invalido';
  document.getElementById('nav-carteira')?.click();
  expect(antigo.value).toBe('');
  expect(document.getElementById('administracao-conteudo')?.childElementCount).toBe(0);
  window.history.pushState(null, '', '#administracao/integracoes');
  window.dispatchEvent(new PopStateEvent('popstate'));
  await vi.waitFor(() =>
    expect(document.querySelector('#administracao-conteudo input[type="password"]')).not.toBeNull(),
  );
  expect(
    document.querySelector<HTMLInputElement>('#administracao-conteudo input[type="password"]')
      ?.value,
  ).toBe('');
  expect(caminhos.filter((c) => c === '/api/admin/segredos-integracoes')).toHaveLength(2);
  expect(JSON.stringify(sessionStorage)).not.toContain('valor-ficticio-invalido');
});
it('rota forçada do profissional não monta credenciais nem consulta metadados administrativos', async () => {
  const caminhos = preparar('profissional');
  await montarCascaParaTeste();
  await vi.waitFor(() => expect(document.getElementById('patients-view')?.hidden).toBe(false));
  window.history.pushState(null, '', '#administracao/integracoes');
  window.dispatchEvent(new PopStateEvent('popstate'));
  expect(document.querySelector('a[href="#administracao/integracoes"]')).toBeNull();
  expect(document.querySelector('#administracao-conteudo input[type="password"]')).toBeNull();
  expect(caminhos.some((c) => c.startsWith('/api/admin/segredos-integracoes'))).toBe(false);
});
