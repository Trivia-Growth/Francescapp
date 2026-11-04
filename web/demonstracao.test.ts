// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
  localStorage.clear();
});

function servidorFicticio(autenticado = true) {
  vi.stubGlobal('navigator', {
    locks: { request: async (_nome: string, executar: () => Promise<void>) => executar() },
  });
  const pacientes = [
    { id: '1', name: 'Paciente Exemplo Um', preferredName: 'Exemplo Um' },
    { id: '2', name: 'Paciente Exemplo Dois', preferredName: '' },
  ];
  const previas = new Map<
    string,
    {
      revision: number;
      anamnese: unknown;
      tarefas: unknown[];
      objetivos?: unknown[];
      relatos?: unknown[];
      operacoesRelato?: string[];
      operacoesRelatoCanceladas?: string[];
    }
  >();
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    let data: unknown;
    if (url.endsWith('/session'))
      data = autenticado
        ? { authenticated: true, csrfToken: 'token-ficticio' }
        : { authenticated: false };
    else if (url.endsWith('/login')) data = { authenticated: true, csrfToken: 'token-ficticio' };
    else if (url.endsWith('/preview')) {
      const previa = previas.get(url) ?? { revision: 0, anamnese: null, tarefas: [] };
      if (options?.method === 'POST') {
        const { operationId } = JSON.parse(String(options.body)) as { operationId: string };
        if (!previa.operacoesRelato?.includes(operationId)) {
          previa.operacoesRelatoCanceladas = [
            ...(previa.operacoesRelatoCanceladas ?? []),
            operationId,
          ];
          previa.revision++;
          previas.set(url, previa);
        }
      } else if (options?.method === 'PUT') {
        const dados = JSON.parse(String(options.body)) as {
          type: 'anamnese' | 'tarefas' | 'objetivos' | 'relatos';
          value: never;
          operationId?: string;
        };
        if (dados.operationId) {
          previa.relatos = [...(previa.relatos ?? []), ...dados.value];
          previa.operacoesRelato = [...(previa.operacoesRelato ?? []), dados.operationId];
        } else previa[dados.type] = dados.value;
        previa.revision++;
        previas.set(url, previa);
      }
      data = previa;
    } else if (options?.method === 'POST') {
      const dados = JSON.parse(String(options.body)) as { name: string; preferredName?: string };
      data = { patient: { id: '3', ...dados } };
    } else data = { patients: pacientes };
    return { ok: true, json: async () => data };
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

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

it('autentica, lista e cadastra com token local', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  const fetch = servidorFicticio(false);
  await import('./demonstracao.js');
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  (document.getElementById('demo-password') as HTMLInputElement).value = 'senha fictícia';
  document
    .getElementById('demo-login-form')
    ?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(document.getElementById('patients-body')?.textContent).toContain('Paciente Exemplo Um'),
  );
  (document.getElementById('patient-name') as HTMLInputElement).value = 'Pessoa Fictícia';
  document.getElementById('create-form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(document.getElementById('patients-body')?.textContent).toContain('Pessoa Fictícia'),
  );
  expect(fetch).toHaveBeenCalledWith(
    '/api/local-feedback/patients',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'X-CSRF-Token': 'token-ficticio' }),
    }),
  );
});

it('identifica pendência e guarda anamnese fictícia por paciente na página', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  servidorFicticio();
  await import('./demonstracao.js');
  await vi.waitFor(() => expect(document.querySelector('#patients-body button')).not.toBeNull());
  (document.querySelector('#patients-body button') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(document.getElementById('anamnese-view')?.hidden).toBe(false));
  expect(document.getElementById('anamnese-progress')?.textContent).toContain('incompleta');
  (document.getElementById('anamnese-state') as HTMLSelectElement).value = 'desconhecido';
  (document.getElementById('anamnese-source') as HTMLInputElement).value = 'Fonte fictícia';
  (document.getElementById('anamnese-date') as HTMLInputElement).value = '2026-01-01';
  document
    .getElementById('anamnese-form')
    ?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(document.getElementById('anamnese-progress')?.textContent).toContain('sem pendências'),
  );
  document.getElementById('back-patients')?.click();
  (document.querySelector('#patients-body button') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(document.getElementById('anamnese-view')?.hidden).toBe(false));
  expect((document.getElementById('anamnese-state') as HTMLSelectElement).value).toBe(
    'desconhecido',
  );
  expect((document.getElementById('anamnese-source') as HTMLInputElement).value).toBe(
    'Fonte fictícia',
  );
});

it('avisa sobre alterações não guardadas antes de sair da anamnese', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
  servidorFicticio();
  await import('./demonstracao.js');
  await vi.waitFor(() => expect(document.querySelector('#patients-body button')).not.toBeNull());
  (document.querySelector('#patients-body button') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(document.getElementById('anamnese-view')?.hidden).toBe(false));
  const campo = document.getElementById('anamnese-value') as HTMLTextAreaElement;
  campo.value = 'Alteração fictícia';
  campo.dispatchEvent(new Event('input', { bubbles: true }));
  expect(document.getElementById('anamnese-feedback')?.textContent).toContain('não guardadas');
  document.getElementById('back-patients')?.click();
  expect(confirmar).toHaveBeenCalled();
  expect(document.getElementById('anamnese-view')?.hidden).toBe(false);
  confirmar.mockReturnValue(true);
  document.getElementById('back-patients')?.click();
  expect(document.getElementById('patients-view')?.hidden).toBe(false);
  confirmar.mockRestore();
});

it('recusa estado inválido antes de guardar a anamnese', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  servidorFicticio();
  await import('./demonstracao.js');
  await vi.waitFor(() => expect(document.querySelector('#patients-body button')).not.toBeNull());
  (document.querySelector('#patients-body button') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(document.getElementById('anamnese-view')?.hidden).toBe(false));
  const estado = document.getElementById('anamnese-state') as HTMLSelectElement;
  estado.add(new Option('Inválido', 'invalido'));
  estado.value = 'invalido';
  (document.getElementById('anamnese-source') as HTMLInputElement).value = 'Fonte fictícia';
  (document.getElementById('anamnese-date') as HTMLInputElement).value = '2026-01-01';
  document
    .getElementById('anamnese-form')
    ?.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(document.getElementById('anamnese-feedback')?.textContent).toContain('Confira');
});

it('mantém tarefas por paciente e exige registro para concluir sem chamar serviço', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  const fetch = servidorFicticio();
  await import('./demonstracao.js');
  await vi.waitFor(() => expect(document.querySelector('#patients-body button')).not.toBeNull());
  const abrir = () =>
    document.querySelectorAll<HTMLButtonElement>(
      '#patients-body button[aria-label^="Abrir tarefas"]',
    );
  abrir()[0]?.click();
  await vi.waitFor(() => expect(document.getElementById('tasks-view')?.hidden).toBe(false));
  (document.getElementById('task-description') as HTMLInputElement).value = 'Acompanhar exemplo';
  (document.getElementById('task-responsible') as HTMLInputElement).value = 'Profissional fictício';
  (document.getElementById('task-deadline') as HTMLInputElement).value = '2026-12-01';
  (document.getElementById('task-priority') as HTMLInputElement).value = 'Prioridade acordada';
  (document.getElementById('task-status') as HTMLSelectElement).value = 'concluida';
  const form = document.getElementById('task-form');
  form?.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(document.getElementById('task-feedback')?.textContent).toContain('ação ou justificativa');
  expect(document.getElementById('tasks-list')?.textContent).not.toContain('Acompanhar exemplo');
  (document.getElementById('task-status') as HTMLSelectElement).value = 'pendente';
  form?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(document.getElementById('tasks-list')?.textContent).toContain('Acompanhar exemplo'),
  );
  const atualizar = document.querySelector('#tasks-list form') as HTMLFormElement;
  (atualizar.querySelector('select') as HTMLSelectElement).value = 'concluida';
  atualizar.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(atualizar.textContent).toContain('Informe a ação');
  (atualizar.querySelector('textarea') as HTMLTextAreaElement).value = 'Ação fictícia';
  const botaoAtualizar = atualizar.querySelector('button') as HTMLButtonElement;
  botaoAtualizar.focus();
  atualizar.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(document.activeElement).toBe(botaoAtualizar);
  await vi.waitFor(() =>
    expect(atualizar.querySelector('[role=status]')?.textContent).toContain('salva'),
  );
  expect(document.getElementById('tasks-list')?.textContent).toContain('Concluída');
  expect(document.getElementById('tasks-list')?.textContent).toContain('Ação fictícia');
  (document.getElementById('task-description') as HTMLInputElement).value = 'Outra tarefa';
  (document.getElementById('task-responsible') as HTMLInputElement).value = 'Pessoa fictícia';
  (document.getElementById('task-deadline') as HTMLInputElement).value = '2026-12-01';
  (document.getElementById('task-priority') as HTMLInputElement).value = 'Alta';
  let liberar!: (value: never) => void;
  fetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        liberar = resolve;
      }),
  );
  form?.dispatchEvent(new Event('submit', { cancelable: true }));
  expect((atualizar.querySelector('textarea') as HTMLTextAreaElement).disabled).toBe(true);
  expect((document.getElementById('tasks-back') as HTMLButtonElement).disabled).toBe(true);
  liberar({ ok: false, status: 500 } as never);
  await vi.waitFor(() =>
    expect((atualizar.querySelector('textarea') as HTMLTextAreaElement).disabled).toBe(false),
  );
  expect((document.getElementById('task-description') as HTMLInputElement).value).toBe(
    'Outra tarefa',
  );

  document.getElementById('tasks-back')?.click();
  abrir()[1]?.click();
  await vi.waitFor(() => expect(document.getElementById('tasks-view')?.hidden).toBe(false));
  expect(document.getElementById('tasks-list')?.textContent).not.toContain('Acompanhar exemplo');
  document.getElementById('tasks-back')?.click();
  abrir()[0]?.click();
  await vi.waitFor(() => expect(document.getElementById('tasks-view')?.hidden).toBe(false));
  expect(document.getElementById('tasks-list')?.textContent).toContain('Acompanhar exemplo');
});

it('confirma descarte de alterações de tarefas ao voltar ou sair', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
  servidorFicticio();
  await import('./demonstracao.js');
  await vi.waitFor(() => expect(document.querySelector('#patients-body button')).not.toBeNull());
  document
    .querySelector<HTMLButtonElement>('#patients-body button[aria-label^="Abrir tarefas"]')
    ?.click();
  await vi.waitFor(() => expect(document.getElementById('tasks-view')?.hidden).toBe(false));
  const campo = document.getElementById('task-description') as HTMLInputElement;
  campo.value = 'Rascunho fictício';
  campo.dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('tasks-back')?.click();
  expect(document.getElementById('tasks-view')?.hidden).toBe(false);
  document.getElementById('logout')?.click();
  expect(confirmar).toHaveBeenCalledTimes(2);
  confirmar.mockReturnValue(true);
  document.getElementById('tasks-back')?.click();
  expect(document.getElementById('patients-view')?.hidden).toBe(false);
  confirmar.mockRestore();
});

it('oculta dados ao expirar sessão e preserva rascunho até novo login', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  const fetch = servidorFicticio();
  const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
  await import('./demonstracao.js');
  await vi.waitFor(() => expect(document.querySelector('#patients-body button')).not.toBeNull());
  (document.querySelector('#patients-body button') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(document.getElementById('anamnese-view')?.hidden).toBe(false));
  const campo = document.getElementById('anamnese-value') as HTMLTextAreaElement;
  campo.value = 'Rascunho fictício';
  campo.dispatchEvent(new Event('input', { bubbles: true }));
  fetch.mockImplementationOnce(
    async () => ({ ok: false, status: 401, json: async () => ({}) }) as never,
  );
  document.getElementById('logout')?.click();
  await vi.waitFor(() => expect(document.getElementById('login-view')?.hidden).toBe(false));
  expect(document.getElementById('anamnese-view')?.hidden).toBe(true);
  expect(document.getElementById('login-feedback')?.textContent).toContain('Sessão encerrada');
  (document.getElementById('demo-password') as HTMLInputElement).value = 'senha fictícia';
  fetch.mockImplementationOnce(
    async () => ({ ok: false, status: 401, json: async () => ({}) }) as never,
  );
  document
    .getElementById('demo-login-form')
    ?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(document.getElementById('login-feedback')?.textContent).toContain(
      'Não foi possível entrar',
    ),
  );
  expect(campo.value).toBe('Rascunho fictício');
  document
    .getElementById('demo-login-form')
    ?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(document.getElementById('anamnese-view')?.hidden).toBe(false));
  expect(campo.value).toBe('Rascunho fictício');
  confirmar.mockRestore();
});

it('guarda objetivos fictícios por paciente e valida campos', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  servidorFicticio();
  await import('./demonstracao.js');
  await vi.waitFor(() => expect(document.querySelector('#patients-body button')).not.toBeNull());
  const abrir = () =>
    document.querySelectorAll<HTMLButtonElement>(
      '#patients-body button[aria-label^="Abrir plano"]',
    );
  abrir()[0]?.click();
  await vi.waitFor(() => expect(document.getElementById('goals-view')?.hidden).toBe(false));
  const form = document.getElementById('goal-form') as HTMLFormElement;
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(document.getElementById('goal-feedback')?.textContent).toContain('Confira');
  for (const [id, value] of Object.entries({
    'goal-description': 'Objetivo fictício',
    'goal-area': 'Rotina',
    'goal-responsible': 'Equipe',
    'goal-initial': 'Inicial',
    'goal-progress': 'Relato',
    'goal-date': '2026-12-01',
  }))
    (document.getElementById(id) as HTMLInputElement).value = value;
  fetch.mockImplementationOnce(async () => {
    throw new Error('resposta perdida');
  });
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(document.getElementById('goal-feedback')?.textContent).toContain(
      'Confira a lista atualizada',
    ),
  );
  expect((document.getElementById('goal-description') as HTMLInputElement).value).toBe(
    'Objetivo fictício',
  );
  fetch.mockImplementationOnce(
    async () => ({ ok: false, status: 409, json: async () => ({}) }) as never,
  );
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(document.getElementById('goal-feedback')?.textContent).toContain('Lista atualizada'),
  );
  expect((document.getElementById('goal-description') as HTMLInputElement).value).toBe(
    'Objetivo fictício',
  );
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(document.getElementById('goals-list')?.textContent).toContain('Objetivo fictício'),
  );
  document.getElementById('goals-back')?.click();
  abrir()[1]?.click();
  await vi.waitFor(() => expect(document.getElementById('goals-view')?.hidden).toBe(false));
  expect(document.getElementById('goals-list')?.textContent).not.toContain('Objetivo fictício');
  document.getElementById('goals-back')?.click();
  abrir()[0]?.click();
  await vi.waitFor(() =>
    expect(document.getElementById('goals-list')?.textContent).toContain('Objetivo fictício'),
  );
});

it('abre relato fictício isolado e descarta conteúdo ao voltar', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  const fetch = servidorFicticio();
  await import('./demonstracao.js');
  await vi.waitFor(() => expect(document.querySelector('#patients-body button')).not.toBeNull());
  const chamadasAntes = fetch.mock.calls.length;
  document.getElementById('open-relato')?.click();
  expect(document.getElementById('relato-view')?.hidden).toBe(false);
  expect(document.getElementById('login-view')?.hidden).toBe(true);
  expect(document.getElementById('relato-content')?.textContent).toContain(
    'não será salvo nem enviado',
  );
  const descricao = document.querySelector<HTMLTextAreaElement>('#relato-content textarea');
  if (!descricao) throw new Error('Descrição ausente');
  descricao.value = 'Conteúdo fictício';
  document.getElementById('relato-back')?.click();
  expect(document.getElementById('relato-content')?.childElementCount).toBe(0);
  expect(document.activeElement?.id).toBe('open-relato');
  expect(fetch.mock.calls.length).toBe(chamadasAntes);
  document.getElementById('open-relato')?.click();
  expect(document.querySelector<HTMLTextAreaElement>('#relato-content textarea')?.value).toBe('');
});

it('guarda relato fictício somente na prévia do paciente escolhido', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  servidorFicticio();
  await import('./demonstracao.js');
  await vi.waitFor(() => expect(document.querySelector('#patients-body button')).not.toBeNull());
  const abrir = () =>
    document.querySelectorAll<HTMLButtonElement>(
      '#patients-body button[aria-label^="Abrir relatos"]',
    );
  abrir()[0]?.click();
  await vi.waitFor(() => expect(document.getElementById('relato-view')?.hidden).toBe(false));
  (document.querySelector('#relato-content input[type=date]') as HTMLInputElement).value =
    '2026-11-04';
  (document.querySelector('#relato-content textarea') as HTMLTextAreaElement).value =
    'Relato fictício';
  document
    .querySelector('#relato-content form')
    ?.dispatchEvent(new Event('submit', { cancelable: true }));
  document.querySelector<HTMLButtonElement>('#relato-content section button')?.click();
  await vi.waitFor(() =>
    expect(document.getElementById('relato-list')?.textContent).toContain('Relato fictício'),
  );
  document.getElementById('relato-back')?.click();
  abrir()[1]?.click();
  await vi.waitFor(() => expect(document.getElementById('relato-view')?.hidden).toBe(false));
  expect(document.getElementById('relato-list')?.textContent).not.toContain('Relato fictício');
});

it('preserva relato e tela ao expirar sessão durante gravação', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  const fetch = servidorFicticio();
  await import('./demonstracao.js');
  await vi.waitFor(() => expect(document.querySelector('#patients-body button')).not.toBeNull());
  document
    .querySelector<HTMLButtonElement>('#patients-body button[aria-label^="Abrir relatos"]')
    ?.click();
  await vi.waitFor(() => expect(document.getElementById('relato-view')?.hidden).toBe(false));
  (document.querySelector('#relato-content input[type=date]') as HTMLInputElement).value =
    '2026-11-04';
  const descricao = document.querySelector<HTMLTextAreaElement>('#relato-content textarea');
  if (!descricao) throw new Error('Descrição ausente');
  descricao.value = 'Rascunho fictício';
  document
    .querySelector('#relato-content form')
    ?.dispatchEvent(new Event('submit', { cancelable: true }));
  fetch.mockImplementationOnce(
    async () => ({ ok: false, status: 401, json: async () => ({}) }) as never,
  );
  document.querySelector<HTMLButtonElement>('#relato-content section button')?.click();
  await vi.waitFor(() => expect(document.getElementById('login-view')?.hidden).toBe(false));
  (document.getElementById('demo-password') as HTMLInputElement).value = 'senha fictícia';
  document
    .getElementById('demo-login-form')
    ?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(document.getElementById('relato-view')?.hidden).toBe(false));
  expect(descricao.value).toBe('Rascunho fictício');
});

it('bloqueia repetição após resposta perdida mesmo ao revisar novamente', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  const fetch = servidorFicticio();
  await import('./demonstracao.js');
  await vi.waitFor(() => expect(document.querySelector('#patients-body button')).not.toBeNull());
  document
    .querySelector<HTMLButtonElement>('#patients-body button[aria-label^="Abrir relatos"]')
    ?.click();
  await vi.waitFor(() => expect(document.getElementById('relato-view')?.hidden).toBe(false));
  (document.querySelector('#relato-content input[type=date]') as HTMLInputElement).value =
    '2026-11-04';
  const descricao = document.querySelector<HTMLTextAreaElement>('#relato-content textarea');
  if (!descricao) throw new Error('Descrição ausente');
  descricao.value = 'Rascunho fictício';
  const form = document.querySelector<HTMLFormElement>('#relato-content form');
  if (!form) throw new Error('Formulário ausente');
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  fetch.mockImplementationOnce(async () => {
    throw new Error('resposta perdida');
  });
  document.querySelector<HTMLButtonElement>('#relato-content section button')?.click();
  await vi.waitFor(() =>
    expect(document.querySelector('#relato-content [role=status]')?.textContent).toContain(
      'consultar o servidor',
    ),
  );
  expect(descricao.value).toBe('Rascunho fictício');
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(
    document.querySelector<HTMLButtonElement>('#relato-content section button')?.disabled,
  ).toBe(true);
  document.getElementById('relato-back')?.click();
  document
    .querySelector<HTMLButtonElement>('#patients-body button[aria-label^="Abrir relatos"]')
    ?.click();
  await vi.waitFor(() => expect(document.getElementById('relato-view')?.hidden).toBe(false));
  expect(localStorage.getItem('relato-pendente:1')).toBeNull();
  (document.querySelector('#relato-content input[type=date]') as HTMLInputElement).value =
    '2026-11-04';
  (document.querySelector('#relato-content textarea') as HTMLTextAreaElement).value =
    'Rascunho fictício';
  document
    .querySelector<HTMLFormElement>('#relato-content form')
    ?.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(
    document.querySelector<HTMLButtonElement>('#relato-content section button')?.disabled,
  ).toBe(false);
});

it('reconcilia resposta perdida após recarga sem guardar texto no navegador', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  const fetch = servidorFicticio();
  await import('./demonstracao.js');
  await vi.waitFor(() => expect(document.querySelector('#patients-body button')).not.toBeNull());
  document
    .querySelector<HTMLButtonElement>('#patients-body button[aria-label^="Abrir relatos"]')
    ?.click();
  await vi.waitFor(() => expect(document.getElementById('relato-view')?.hidden).toBe(false));
  (document.querySelector('#relato-content input[type=date]') as HTMLInputElement).value =
    '2026-11-04';
  (document.querySelector('#relato-content textarea') as HTMLTextAreaElement).value =
    'Texto fictício reservado';
  document
    .querySelector<HTMLFormElement>('#relato-content form')
    ?.dispatchEvent(new Event('submit', { cancelable: true }));
  const responder = fetch.getMockImplementation();
  if (!responder) throw new Error('Servidor ausente');
  fetch.mockImplementationOnce(async (url, options) => {
    await responder(url, options);
    throw new Error('resposta perdida');
  });
  document.querySelector<HTMLButtonElement>('#relato-content section button')?.click();
  await vi.waitFor(() => expect(localStorage.getItem('relato-pendente:1')).toBeTruthy());
  expect(JSON.stringify(localStorage)).not.toContain('Texto fictício reservado');
  await vi.waitFor(() =>
    expect(document.querySelector('#relato-content [role=status]')?.textContent).toContain(
      'consultar o servidor',
    ),
  );
  vi.resetModules();
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  await import('./demonstracao.js');
  await vi.waitFor(() => expect(document.querySelector('#patients-body button')).not.toBeNull());
  document
    .querySelector<HTMLButtonElement>('#patients-body button[aria-label^="Abrir relatos"]')
    ?.click();
  await vi.waitFor(() => expect(document.getElementById('relato-view')?.hidden).toBe(false));
  expect(localStorage.getItem('relato-pendente:1')).toBeNull();
  expect(document.querySelectorAll('#relato-list li')).toHaveLength(1);
  expect(document.getElementById('relato-list')?.textContent).toContain('Texto fictício reservado');
});

it('mantém bloqueio quando reconciliação falha', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  const fetch = servidorFicticio();
  localStorage.setItem('relato-pendente:1', '11234567-1234-4234-8234-123456789abc');
  await import('./demonstracao.js');
  await vi.waitFor(() => expect(document.querySelector('#patients-body button')).not.toBeNull());
  const responder = fetch.getMockImplementation();
  if (!responder) throw new Error('Servidor ausente');
  fetch.mockImplementationOnce(responder).mockImplementationOnce(async () => {
    throw new Error('falha');
  });
  document
    .querySelector<HTMLButtonElement>('#patients-body button[aria-label^="Abrir relatos"]')
    ?.click();
  await vi.waitFor(() =>
    expect(document.getElementById('workspace-feedback')?.textContent).toContain(
      'Não foi possível',
    ),
  );
  expect(localStorage.getItem('relato-pendente:1')).toBe('11234567-1234-4234-8234-123456789abc');
  expect(document.getElementById('relato-view')?.hidden).toBe(true);
});
