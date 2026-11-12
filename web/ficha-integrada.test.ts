// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

const A = '10000000-0000-4000-8000-00000000000a';
const B = '10000000-0000-4000-8000-00000000000b';
const C = '10000000-0000-4000-8000-00000000000c';
const sessionId = '20000000-0000-4000-8000-000000000001';
const usuarioId = '30000000-0000-4000-8000-000000000001';
const envelope = (dados: unknown) => Response.json({ dados, request_id: A });
const pacientes = [
  { id: A, nome: 'Helena Souza', nome_preferencia: 'Lena', versao: 1 },
  { id: B, nome: 'Bruno Costa', nome_preferencia: null, versao: 1 },
];
const tarefa = (descricao: string) => ({
  tarefa_id: A,
  versao: 1,
  ator_usuario_id: A,
  data: '2026-11-05T12:00:00Z',
  tarefa: {
    descricao,
    responsavel: 'Equipe',
    prazo: '2026-12-01',
    prioridade: 'alta',
    estado: 'pendente',
  },
});

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
  window.history.replaceState(null, '', '/');
});

function preparar(
  perfil: 'administrador' | 'profissional',
  capacidades: string[],
  rotas: (caminho: string) => Response | undefined = () => undefined,
  lista: unknown[] = pacientes,
) {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  sessionStorage.setItem('modo-acesso', 'tecnica');
  sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
  sessionStorage.setItem('sessao-tecnica', sessionId);
  const caminhos: string[] = [];
  vi.stubGlobal('fetch', async (url: URL | string) => {
    const caminho = typeof url === 'string' ? url.split('?')[0] : url.pathname;
    caminhos.push(caminho as string);
    if (caminho === '/api/sessao')
      return envelope({
        session_id: sessionId,
        usuario: { id: usuarioId, perfil, ativo: true, versao: 1 },
        capacidades,
      });
    if (caminho === '/api/pacientes') return envelope({ itens: lista, proximo_cursor: null });
    const resposta = rotas(caminho as string);
    if (resposta) return resposta;
    if (caminho === `/api/pacientes/${A}/plano`)
      return envelope({ itens: [], proximo_cursor: null });
    if (caminho === `/api/pacientes/${B}/plano`)
      return envelope({ itens: [], proximo_cursor: null });
    if (caminho === `/api/pacientes/${A}/tarefas`) return envelope([tarefa('Tarefa de Helena')]);
    if (caminho === `/api/pacientes/${B}/tarefas`) return envelope([tarefa('Tarefa de Bruno')]);
    if (caminho.endsWith('/anamnese')) return envelope(null);
    return new Response(null, { status: 404 });
  });
  return caminhos;
}

const linha = (id: string) => `[data-paciente-id="${id}"]`;
const painel = () => document.getElementById('ficha-painel')?.textContent ?? '';
const el = (id: string) => document.getElementById(id) as HTMLElement;

it('abre a ficha pela lista, atualiza o fragmento e volta com foco na linha', async () => {
  preparar('profissional', []);
  await import('./main.js');
  await vi.waitFor(() => expect(document.querySelector(linha(A))).not.toBeNull());
  expect(document.querySelector(linha(A))?.textContent).toContain('HS');
  expect(document.querySelector(linha(A))?.textContent).toContain('Helena Souza');
  expect(document.querySelector(linha(A))?.textContent).toContain('Preferência: Lena');
  expect(document.querySelector(linha(B))?.textContent).toContain('Preferência não informada');
  document.querySelector<HTMLButtonElement>(linha(A))?.click();
  expect(el('ficha-view').hidden).toBe(false);
  expect(el('lista-view').hidden).toBe(true);
  expect(el('ficha-title').textContent).toBe('Helena Souza');
  expect(el('crumb-paciente').textContent).toBe('Helena Souza');
  expect(window.location.hash).toBe(`#paciente/${A}/visao`);
  await vi.waitFor(() => expect(painel()).toContain('Tarefa de Helena'));
  el('ficha-voltar').click();
  expect(el('ficha-view').hidden).toBe(true);
  expect(el('lista-view').hidden).toBe(false);
  expect(window.location.hash).toBe('');
  expect(document.activeElement).toBe(document.querySelector(linha(A)));
  expect(el('crumb-paciente').hidden).toBe(true);
});

it('não deixa resíduo do paciente anterior ao abrir outro', async () => {
  preparar('profissional', []);
  await import('./main.js');
  await vi.waitFor(() => expect(document.querySelector(linha(A))).not.toBeNull());
  document.querySelector<HTMLButtonElement>(linha(A))?.click();
  await vi.waitFor(() => expect(painel()).toContain('Tarefa de Helena'));
  el('ficha-voltar').click();
  document.querySelector<HTMLButtonElement>(linha(B))?.click();
  await vi.waitFor(() => expect(painel()).toContain('Tarefa de Bruno'));
  expect(el('ficha-view').textContent).not.toContain('Helena');
  expect(el('ficha-view').textContent).not.toContain('Tarefa de Helena');
  expect(el('crumb-paciente').textContent).toBe('Bruno Costa');
});

it('reabre na mesma seção ao recarregar, revalidando a sessão antes de mostrar dados', async () => {
  window.history.replaceState(null, '', `/#paciente/${A}/anamnese`);
  const caminhos = preparar('profissional', []);
  await import('./main.js');
  await vi.waitFor(() => expect(el('ficha-view').hidden).toBe(false));
  expect(el('ficha-aba-anamnese').getAttribute('aria-selected')).toBe('true');
  expect(el('ficha-title').textContent).toBe('Helena Souza');
  await vi.waitFor(() => expect(caminhos).toContain(`/api/pacientes/${A}/anamnese`));
  expect(caminhos.indexOf('/api/sessao')).toBeLessThan(
    caminhos.indexOf(`/api/pacientes/${A}/anamnese`),
  );
  expect(caminhos).not.toContain(`/api/pacientes/${A}`);
});

it('não consulta o endpoint de paciente para profissional fora da página carregada', async () => {
  window.history.replaceState(null, '', `/#paciente/${C}/visao`);
  const caminhos = preparar('profissional', []);
  await import('./main.js');
  await vi.waitFor(() =>
    expect(el('workspace-feedback').textContent).toContain('Escolha o paciente na lista'),
  );
  expect(el('ficha-view').hidden).toBe(true);
  expect(el('lista-view').hidden).toBe(false);
  expect(window.location.hash).toBe('');
  expect(caminhos).not.toContain(`/api/pacientes/${C}`);
  expect(el('login-view').hidden).toBe(true);
});

it('administrador reabre paciente fora da página pelo endpoint de consulta', async () => {
  window.history.replaceState(null, '', `/#paciente/${C}/plano`);
  preparar('administrador', ['administrar_cadastro'], (caminho) =>
    caminho === `/api/pacientes/${C}`
      ? envelope({
          id: C,
          nome: 'Carla Pereira',
          nome_preferencia: null,
          versao: 1,
          data_nascimento: null,
          contatos: [],
          acompanhamento: [],
        })
      : caminho === `/api/pacientes/${C}/plano`
        ? envelope({ itens: [], proximo_cursor: null })
        : undefined,
  );
  await import('./main.js');
  await vi.waitFor(() => expect(el('ficha-view').hidden).toBe(false));
  expect(el('ficha-title').textContent).toBe('Carla Pereira');
  expect(el('ficha-aba-plano').getAttribute('aria-selected')).toBe('true');
});

it.each([
  {
    perfil: 'profissional' as const,
    capacidades: [],
    abas: [
      'Visão do caso',
      'Anamnese',
      'Saúde',
      'Plano de cuidado',
      'Tarefas',
      'Encaminhamentos',
      'Orientações',
      'Rotina e recursos',
      'Rede de cuidado',
      'Diário em breve',
    ],
  },
  {
    perfil: 'administrador' as const,
    capacidades: ['administrar_cadastro', 'administrar_concessoes'],
    abas: [
      'Visão do caso',
      'Anamnese',
      'Saúde',
      'Plano de cuidado',
      'Cadastro',
      'Equipe com acesso',
      'Encaminhamentos',
      'Orientações',
      'Rotina e recursos',
      'Rede de cuidado',
      'Diário em breve',
    ],
  },
])(
  'oferece ao perfil $perfil só as seções que ele já usa',
  async ({ perfil, capacidades, abas }) => {
    preparar(perfil, capacidades);
    await import('./main.js');
    await vi.waitFor(() => expect(document.querySelector(linha(A))).not.toBeNull());
    document.querySelector<HTMLButtonElement>(linha(A))?.click();
    expect([...document.querySelectorAll('[role="tab"]')].map((aba) => aba.textContent)).toEqual(
      abas,
    );
  },
);

it('só mostra a seção da visão de tarefas ao profissional', async () => {
  preparar('administrador', ['administrar_cadastro']);
  await import('./main.js');
  await vi.waitFor(() => expect(document.querySelector(linha(A))).not.toBeNull());
  document.querySelector<HTMLButtonElement>(linha(A))?.click();
  await vi.waitFor(() => expect(el('ficha-painel').textContent).toContain('Objetivos ativos'));
  expect(el('ficha-painel').textContent).not.toContain('Tarefas pendentes');
  expect(el('ficha-painel').textContent).not.toContain('Tarefa de Helena');
});

it('mostra à família só os dados do paciente vinculado', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  sessionStorage.setItem('modo-acesso', 'familiar');
  sessionStorage.setItem('fluxo-familiar', 'AAAAAAAAAAAAAAAAAAAAAA');
  sessionStorage.setItem('sessao-familiar', sessionId);
  vi.stubGlobal('fetch', async (url: URL | string) => {
    const caminho = typeof url === 'string' ? url.split('?')[0] : url.pathname;
    if (caminho === '/api/familiar/sessao')
      return envelope({
        session_id: sessionId,
        usuario: { id: usuarioId, perfil: 'familia', ativo: true, versao: 1 },
        capacidades: [],
      });
    if (caminho === '/api/familiar/pacientes')
      return envelope({ itens: [pacientes[0]], proximo_cursor: null });
    if (caminho === `/api/familiar/pacientes/${A}`) return envelope(pacientes[0]);
    return new Response(null, { status: 404 });
  });
  await import('./main.js');
  await vi.waitFor(() => expect(document.querySelector(linha(A))).not.toBeNull());
  document.querySelector<HTMLButtonElement>(linha(A))?.click();
  expect([...document.querySelectorAll('[role="tab"]')].map((aba) => aba.textContent)).toEqual([
    'Dados do paciente',
  ]);
  await vi.waitFor(() => expect(painel()).toContain('Helena Souza'));
  expect(painel()).toContain('Lena');
  expect(painel()).not.toContain('Plano de cuidado');
});

it('remove a visão do caso do DOM com a aba oculta e a recarrega ao voltar', async () => {
  preparar('profissional', []);
  await import('./main.js');
  await vi.waitFor(() => expect(document.querySelector(linha(A))).not.toBeNull());
  document.querySelector<HTMLButtonElement>(linha(A))?.click();
  await vi.waitFor(() => expect(painel()).toContain('Tarefa de Helena'));
  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  document.dispatchEvent(new Event('visibilitychange'));
  expect(painel()).toBe('');
  expect(el('patients-view').hidden).toBe(true);
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.waitFor(() => expect(painel()).toContain('Tarefa de Helena'));
  expect(el('patients-view').hidden).toBe(false);
  Reflect.deleteProperty(document, 'hidden');
});

it('mostra situação e responsável na visão só ao Administrador com edição disponível', async () => {
  const caminhos = preparar('administrador', ['administrar_cadastro'], (caminho) =>
    caminho === '/api/pacientes/edicao/disponibilidade'
      ? envelope({ disponivel: true })
      : caminho === `/api/pacientes/${A}`
        ? envelope({
            id: A,
            nome: 'Helena Souza',
            nome_preferencia: 'Lena',
            data_nascimento: null,
            contatos: [],
            versao: 3,
            acompanhamento: [
              {
                versao: 3,
                situacao: 'pausado',
                responsavel_id: usuarioId,
                responsavel_ativo: true,
                ator_id: usuarioId,
                criado_em: '2026-11-06T15:00:00.000000+00:00',
                motivo: 'Pausa fictícia',
              },
            ],
          })
        : undefined,
  );
  await import('./main.js');
  await vi.waitFor(() => expect(document.querySelector(linha(A))).not.toBeNull());
  document.querySelector<HTMLButtonElement>(linha(A))?.click();
  await vi.waitFor(() => expect(painel()).toContain('Situação: Pausado'));
  expect(painel()).toContain('Responsável: Responsável indicado');
  expect(painel()).not.toContain('Pausa fictícia');
  expect(painel()).not.toContain('Situação do caso e responsável: indisponíveis');
  expect(caminhos).not.toContain('/api/admin/concessoes-equipe');
});

it('não consulta nem mostra situação e responsável para o Profissional', async () => {
  const caminhos = preparar('profissional', []);
  await import('./main.js');
  await vi.waitFor(() => expect(document.querySelector(linha(A))).not.toBeNull());
  document.querySelector<HTMLButtonElement>(linha(A))?.click();
  await vi.waitFor(() => expect(painel()).toContain('Tarefa de Helena'));
  expect(document.querySelector('[data-bloco="situacao"]')).toBeNull();
  expect(painel()).toContain('Situação do caso e responsável: indisponíveis nesta versão');
  expect(caminhos).not.toContain(`/api/pacientes/${A}`);
});

it('mostra a situação de cada pessoa na lista do Administrador, inclusive "a completar"', async () => {
  preparar('administrador', ['administrar_cadastro'], () => undefined, [
    { ...pacientes[0], situacao: 'ativo' },
    { ...pacientes[1], situacao: null },
  ]);
  await import('./main.js');
  await vi.waitFor(() => expect(document.querySelector(linha(A))).not.toBeNull());
  const comSituacao = document.querySelector<HTMLElement>(linha(A));
  expect(comSituacao?.querySelector('.pessoa-situacao')?.textContent).toBe('Situação: Ativo');
  expect(comSituacao?.getAttribute('aria-label')).toBe(
    'Abrir ficha de Helena Souza. Situação: Ativo.',
  );
  const aCompletar = document.querySelector<HTMLElement>(linha(B));
  expect(aCompletar?.querySelector('.pessoa-situacao')?.textContent).toBe('Situação a completar');
  expect(aCompletar?.querySelector<HTMLElement>('.pessoa-situacao')?.dataset.situacao).toBe(
    'completar',
  );
  expect(aCompletar?.getAttribute('aria-label')).toBe(
    'Abrir ficha de Bruno Costa. Situação a completar.',
  );
});

it('não mostra situação na lista quando o servidor não devolve o campo', async () => {
  preparar('profissional', []);
  await import('./main.js');
  await vi.waitFor(() => expect(document.querySelector(linha(A))).not.toBeNull());
  expect(document.querySelector('.pessoa-situacao')).toBeNull();
  expect(document.querySelector(linha(A))?.getAttribute('aria-label')).toBe(
    'Abrir ficha de Helena Souza',
  );
  // O rótulo "Situação" do formulário de cadastro novo não conta: só a lista de pacientes.
  expect(document.getElementById('patients-body')?.textContent).not.toContain('Situação');
});
