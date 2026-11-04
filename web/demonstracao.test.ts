// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

function servidorFicticio(autenticado = true) {
  const pacientes = [
    { id: '1', name: 'Paciente Exemplo Um', preferredName: 'Exemplo Um' },
    { id: '2', name: 'Paciente Exemplo Dois', preferredName: '' },
  ];
  const previas = new Map<string, { revision: number; anamnese: unknown; tarefas: unknown[] }>();
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    let data: unknown;
    if (url.endsWith('/session'))
      data = autenticado
        ? { authenticated: true, csrfToken: 'token-ficticio' }
        : { authenticated: false };
    else if (url.endsWith('/login')) data = { authenticated: true, csrfToken: 'token-ficticio' };
    else if (url.endsWith('/preview')) {
      const previa = previas.get(url) ?? { revision: 0, anamnese: null, tarefas: [] };
      if (options?.method === 'PUT') {
        const dados = JSON.parse(String(options.body)) as {
          type: 'anamnese' | 'tarefas';
          value: never;
        };
        previa[dados.type] = dados.value;
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
