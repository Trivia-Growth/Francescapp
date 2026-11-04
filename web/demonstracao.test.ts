// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
  localStorage.clear();
});

function servidorFicticio(autenticado = true, legado = false) {
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
      agenda?: unknown[];
      documentos?: unknown[];
      encaminhamentos?: unknown[];
      orientacoes?: unknown[];
      relacoes?: unknown[];
      operacoesRelato?: string[];
      operacoesRelatoCanceladas?: string[];
    }
  >();
  if (legado)
    previas.set('/api/local-feedback/patients/1/preview', {
      revision: 1,
      anamnese: {
        estado: 'informado',
        valor: 'Legado fictício',
        fonte: 'Teste',
        data: '2026-01-01',
      },
      tarefas: [],
    });
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    let data: unknown;
    if (url.endsWith('/session'))
      data = autenticado
        ? { authenticated: true, csrfToken: 'token-ficticio' }
        : { authenticated: false };
    else if (url.endsWith('/login')) data = { authenticated: true, csrfToken: 'token-ficticio' };
    else if (url.endsWith('/agenda'))
      data = {
        appointments: [
          {
            patientId: '1',
            patientName: 'Paciente Exemplo Um',
            data: '2026-12-01',
            hora: '10:00',
            descricao: 'Encontro fictício',
            estado: 'cancelado',
          },
        ],
      };
    else if (url.endsWith('/pending-tasks'))
      data = {
        patients: [
          {
            id: '1',
            nome: 'Paciente Exemplo Um',
            tarefas: [
              {
                descricao: 'Contato fictício',
                responsavel: 'Equipe',
                prazo: '2026-01-01',
                estado: 'pendente',
              },
            ],
          },
        ],
      };
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
          type:
            | 'anamnese'
            | 'tarefas'
            | 'objetivos'
            | 'relatos'
            | 'agenda'
            | 'documentos'
            | 'encaminhamentos'
            | 'orientacoes'
            | 'relacoes';
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
  (document.getElementById('birth-date') as HTMLInputElement).value = '2000-02-29';
  (document.getElementById('patient-phone') as HTMLInputElement).value = '11999999999';
  (document.getElementById('patient-email') as HTMLInputElement).value = 'pessoa@example.test';
  document.getElementById('create-form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(document.getElementById('patients-body')?.textContent).toContain('Pessoa Fictícia'),
  );
  document
    .querySelector<HTMLButtonElement>('[aria-label="Abrir resumo de Pessoa Fictícia"]')
    ?.click();
  await vi.waitFor(() => expect(document.getElementById('summary-view')?.hidden).toBe(false));
  expect(document.getElementById('summary-content')?.textContent).toContain('pessoa@example.test');
  expect(document.getElementById('summary-content')?.textContent).toContain('11999999999');
  expect(document.getElementById('summary-content')?.textContent).toContain('2000-02-29');
  expect(fetch).toHaveBeenCalledWith(
    '/api/local-feedback/patients',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'X-CSRF-Token': 'token-ficticio' }),
    }),
  );
});

it('bloqueia troca de cadastro durante salvamento pendente', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  const fetch = servidorFicticio();
  await import('./demonstracao.js');
  await vi.waitFor(() =>
    expect(document.querySelectorAll('[aria-label^="Editar cadastro de"]')).toHaveLength(2),
  );
  const edits = document.querySelectorAll<HTMLButtonElement>('[aria-label^="Editar cadastro de"]');
  edits[0]?.click();
  const nome = document.getElementById('patient-name') as HTMLInputElement;
  nome.value = 'Nome atualizado';
  nome.dispatchEvent(new Event('input'));
  let liberar!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
  fetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        liberar = resolve;
      }),
  );
  const form = document.getElementById('create-form') as HTMLFormElement;
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(nome.disabled).toBe(true);
  expect((document.getElementById('cancel-edit') as HTMLButtonElement).disabled).toBe(true);
  expect(edits[1]?.disabled).toBe(true);
  edits[1]?.click();
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  liberar({
    ok: true,
    json: async () => ({ patient: { id: '1', name: 'Nome atualizado', preferredName: '' } }),
  });
  await vi.waitFor(() =>
    expect(document.getElementById('patients-body')?.textContent).toContain('Nome atualizado'),
  );
  expect(document.querySelectorAll('#patients-body tr')).toHaveLength(2);
  expect(fetch.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(1);
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

it('preserva anamnese legada e reabre campos em duas seções', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  servidorFicticio(true, true);
  await import('./demonstracao.js');
  await vi.waitFor(() => expect(document.querySelector('#patients-body button')).not.toBeNull());
  (document.querySelector('#patients-body button') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(document.getElementById('anamnese-view')?.hidden).toBe(false));
  expect((document.getElementById('anamnese-value') as HTMLTextAreaElement).value).toBe(
    'Legado fictício',
  );
  document.getElementById('anamnese-add')?.click();
  const segundo = document.querySelectorAll<HTMLFieldSetElement>('#anamnese-fields fieldset')[1];
  (segundo.querySelector('[name="secao"]') as HTMLInputElement).value = 'Outra seção';
  (segundo.querySelector('[name="campo"]') as HTMLInputElement).value = 'Outro campo';
  (segundo.querySelector('[name="estado"]') as HTMLSelectElement).value = 'desconhecido';
  (segundo.querySelector('[name="fonte"]') as HTMLInputElement).value = 'Equipe fictícia';
  (segundo.querySelector('[name="data"]') as HTMLInputElement).value = '2026-01-02';
  document
    .getElementById('anamnese-form')
    ?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(document.getElementById('anamnese-feedback')?.textContent).toContain('salva'),
  );
  document.getElementById('back-patients')?.click();
  (document.querySelector('#patients-body button') as HTMLButtonElement).click();
  await vi.waitFor(() =>
    expect(document.querySelectorAll('#anamnese-fields fieldset')).toHaveLength(2),
  );
  expect((document.getElementById('anamnese-value') as HTMLTextAreaElement).value).toBe(
    'Legado fictício',
  );
  expect(
    document.querySelectorAll<HTMLInputElement>('#anamnese-fields [name="secao"]')[1].value,
  ).toBe('Outra seção');
});

it('limita campos e permite remover sem perder outros rascunhos', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  servidorFicticio();
  await import('./demonstracao.js');
  await vi.waitFor(() => expect(document.querySelector('#patients-body button')).not.toBeNull());
  (document.querySelector('#patients-body button') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(document.getElementById('anamnese-view')?.hidden).toBe(false));
  (document.getElementById('anamnese-value') as HTMLTextAreaElement).value = 'Rascunho';
  const adicionar = document.getElementById('anamnese-add') as HTMLButtonElement;
  for (let indice = 1; indice < 101; indice++) adicionar.click();
  expect(document.querySelectorAll('#anamnese-fields fieldset')).toHaveLength(100);
  expect(document.getElementById('anamnese-feedback')?.textContent).toContain('Limite de 100');
  document.querySelectorAll<HTMLButtonElement>('#anamnese-fields fieldset button')[1].click();
  expect(document.querySelectorAll('#anamnese-fields fieldset')).toHaveLength(99);
  expect((document.getElementById('anamnese-value') as HTMLTextAreaElement).value).toBe('Rascunho');
  adicionar.click();
  expect(document.querySelectorAll('#anamnese-fields fieldset')).toHaveLength(100);
  for (const remover of document.querySelectorAll<HTMLButtonElement>(
    '#anamnese-fields fieldset button',
  ))
    remover.click();
  document
    .getElementById('anamnese-form')
    ?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(document.getElementById('anamnese-feedback')?.textContent).toContain('salva'),
  );
  document.getElementById('back-patients')?.click();
  (document.querySelector('#patients-body button') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(document.getElementById('anamnese-view')?.hidden).toBe(false));
  expect(document.querySelectorAll('#anamnese-fields fieldset')).toHaveLength(0);
});

it('guarda e reabre metadados de documentos por paciente', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  servidorFicticio();
  await import('./demonstracao.js');
  await vi.waitFor(() =>
    expect(
      document.querySelector('[aria-label="Abrir documentos de Paciente Exemplo Um"]'),
    ).not.toBeNull(),
  );
  const abrir = () =>
    (
      document.querySelector(
        '[aria-label="Abrir documentos de Paciente Exemplo Um"]',
      ) as HTMLButtonElement
    ).click();
  abrir();
  await vi.waitFor(() => expect(document.getElementById('documents-view')?.hidden).toBe(false));
  const inputs = document.querySelectorAll<HTMLInputElement>('#documents-content input');
  inputs[0].value = 'Exame fictício';
  inputs[1].value = 'Exame';
  document
    .querySelector('#documents-content form')
    ?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(document.getElementById('documents-content')?.textContent).toContain(
      'Documento registrado',
    ),
  );
  document.getElementById('documents-back')?.click();
  abrir();
  await vi.waitFor(() => expect(document.getElementById('documents-view')?.hidden).toBe(false));
  expect(document.getElementById('documents-content')?.textContent).toContain('Exame fictício');
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

it('preserva alerta de cadastro ao salvar tarefa e voltar à lista', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
  servidorFicticio();
  await import('./demonstracao.js');
  await vi.waitFor(() =>
    expect(document.querySelector('[aria-label^="Abrir tarefas"]')).not.toBeNull(),
  );
  const nome = document.getElementById('patient-name') as HTMLInputElement;
  nome.value = 'Rascunho fictício';
  nome.dispatchEvent(new Event('input', { bubbles: true }));
  (document.querySelector('[aria-label^="Abrir tarefas"]') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(document.getElementById('tasks-view')?.hidden).toBe(false));
  (document.getElementById('task-description') as HTMLInputElement).value = 'Tarefa fictícia';
  (document.getElementById('task-responsible') as HTMLInputElement).value = 'Pessoa fictícia';
  (document.getElementById('task-deadline') as HTMLInputElement).value = '2026-12-01';
  (document.getElementById('task-priority') as HTMLInputElement).value = 'Alta';
  document.getElementById('task-form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(document.getElementById('task-feedback')?.textContent).toContain('salva'),
  );
  document.getElementById('tasks-back')?.click();
  confirmar.mockClear();
  confirmar.mockReturnValue(false);
  document.getElementById('logout')?.click();
  expect(confirmar).toHaveBeenCalled();
  expect(nome.value).toBe('Rascunho fictício');
  confirmar.mockRestore();
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
  const camposEdicao = atualizar.querySelectorAll('input');
  camposEdicao[0].value = 'Tarefa revisada';
  camposEdicao[1].value = 'Outra pessoa fictícia';
  camposEdicao[2].value = '2026-12-15';
  camposEdicao[3].value = 'Alta';
  camposEdicao[3].dispatchEvent(new Event('input', { bubbles: true }));
  const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
  document.getElementById('tasks-back')?.click();
  expect(confirmar).toHaveBeenCalledOnce();
  expect(document.getElementById('tasks-view')?.hidden).toBe(false);
  expect(camposEdicao[3].value).toBe('Alta');
  confirmar.mockRestore();
  atualizar.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(document.getElementById('tasks-list')?.textContent).toContain('Tarefa revisada'),
  );
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
  expect(document.getElementById('tasks-list')?.textContent).toContain('Tarefa revisada');
  expect(document.getElementById('tasks-list')?.textContent).toContain('Outra pessoa fictícia');
  expect(document.getElementById('tasks-list')?.textContent).toContain('2026-12-15');
  expect(document.getElementById('tasks-list')?.textContent).toContain('Prioridade: Alta');
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
  const fetch = servidorFicticio();
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
  document.querySelector<HTMLButtonElement>('#goals-list button')?.click();
  (document.getElementById('goal-description') as HTMLInputElement).value = 'Objetivo revisado';
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(document.getElementById('goal-feedback')?.textContent).toContain('motivo');
  (document.getElementById('goal-reason') as HTMLTextAreaElement).value = 'Nova observação';
  const executar = fetch.getMockImplementation();
  if (!executar) throw new Error('Servidor fictício indisponível.');
  let liberar = () => {};
  const espera = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  fetch.mockImplementationOnce(async (url, options) => {
    await espera;
    return executar(url, options);
  });
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  const botaoRevisar = document.querySelector<HTMLButtonElement>('#goals-list button');
  if (!botaoRevisar) throw new Error('Botão de revisão indisponível.');
  expect(botaoRevisar.disabled).toBe(true);
  botaoRevisar.click();
  expect((document.getElementById('goal-description') as HTMLInputElement).value).toBe(
    'Objetivo revisado',
  );
  liberar();
  await vi.waitFor(() =>
    expect(document.getElementById('goals-list')?.textContent).toContain('Objetivo revisado'),
  );
  expect(document.getElementById('goals-list')?.textContent).toContain('Objetivo fictício');
  expect(document.getElementById('goals-list')?.textContent).toContain('Nova observação');
  document.getElementById('goals-back')?.click();
  abrir()[1]?.click();
  await vi.waitFor(() => expect(document.getElementById('goals-view')?.hidden).toBe(false));
  expect(document.getElementById('goals-list')?.textContent).not.toContain('Objetivo fictício');
  document.getElementById('goals-back')?.click();
  abrir()[0]?.click();
  await vi.waitFor(() =>
    expect(document.getElementById('goals-list')?.textContent).toContain('Objetivo revisado'),
  );
  expect(document.getElementById('goals-list')?.textContent).toContain('Nova observação');
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
  expect(document.getElementById('relato-back')?.textContent).toBe('Voltar ao acesso');
  expect(document.getElementById('login-view')?.hidden).toBe(true);
  expect(document.getElementById('relato-content')?.textContent).toContain(
    'não será salvo nem enviado',
  );
  const descricao = document.querySelector<HTMLTextAreaElement>('#relato-content textarea');
  if (!descricao) throw new Error('Descrição ausente');
  descricao.value = 'Conteúdo fictício';
  descricao.dispatchEvent(new Event('input', { bubbles: true }));
  const confirmar = vi
    .spyOn(window, 'confirm')
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(true);
  document.getElementById('relato-back')?.click();
  expect(document.getElementById('relato-view')?.hidden).toBe(false);
  expect(descricao.value).toBe('Conteúdo fictício');
  document.getElementById('relato-back')?.click();
  expect(confirmar).toHaveBeenCalledTimes(2);
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
  expect(document.getElementById('relato-back')?.textContent).toBe('Voltar à lista');
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

it('guarda compromisso fictício e o apresenta ao reabrir a agenda', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  const fetch = servidorFicticio();
  await import('./demonstracao.js');
  await vi.waitFor(() =>
    expect(
      document.querySelector('[aria-label="Abrir agenda de Paciente Exemplo Um"]'),
    ).not.toBeNull(),
  );
  (
    document.querySelector(
      '[aria-label="Abrir agenda de Paciente Exemplo Um"]',
    ) as HTMLButtonElement
  ).click();
  await vi.waitFor(() => expect(document.getElementById('agenda-view')?.hidden).toBe(false));
  for (const [campo, valor] of Object.entries({
    description: 'Consulta fictícia',
    professional: 'Profissional fictício',
    date: '2026-12-01',
    time: '10:00',
    duration: '60',
    location: 'Online',
    participants: 'Pessoa fictícia',
  })) {
    (document.getElementById(`agenda-${campo}`) as HTMLInputElement).value = valor;
  }
  document.getElementById('agenda-form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(document.getElementById('agenda-feedback')?.textContent).toContain(
      'salvo somente nesta prévia local',
    ),
  );
  expect(fetch).toHaveBeenCalledWith(
    '/api/local-feedback/patients/1/preview',
    expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({ 'X-CSRF-Token': 'token-ficticio' }),
    }),
  );
  document.getElementById('agenda-back')?.click();
  (
    document.querySelector(
      '[aria-label="Abrir agenda de Paciente Exemplo Um"]',
    ) as HTMLButtonElement
  ).click();
  await vi.waitFor(() =>
    expect(document.getElementById('agenda-list')?.textContent).toContain('Consulta fictícia'),
  );
  expect(document.getElementById('agenda-list')?.textContent).toContain('Origem: prévia local');
});

it('ignora abertura anterior quando outra prévia responde primeiro', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  const fetch = servidorFicticio();
  await import('./demonstracao.js');
  await vi.waitFor(() =>
    expect(
      document.querySelector('[aria-label="Abrir agenda de Paciente Exemplo Um"]'),
    ).not.toBeNull(),
  );
  let liberar!: (valor: { ok: boolean; json: () => Promise<unknown> }) => void;
  fetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        liberar = resolve;
      }),
  );
  (
    document.querySelector(
      '[aria-label="Abrir agenda de Paciente Exemplo Um"]',
    ) as HTMLButtonElement
  ).click();
  (
    document.querySelector(
      '[aria-label="Abrir tarefas de Paciente Exemplo Dois"]',
    ) as HTMLButtonElement
  ).click();
  await vi.waitFor(() => expect(document.getElementById('tasks-view')?.hidden).toBe(false));
  liberar({ ok: true, json: async () => ({ revision: 0, anamnese: null, tarefas: [] }) });
  await vi.waitFor(() =>
    expect(document.getElementById('tasks-patient')?.textContent).toBe('Paciente Exemplo Dois'),
  );
  expect(document.getElementById('agenda-view')?.hidden).toBe(true);
  expect(document.getElementById('tasks-view')?.hidden).toBe(false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (const [campo, valor] of Object.entries({
    description: 'Tarefa fictícia',
    responsible: 'Equipe',
    deadline: '2026-12-01',
    priority: 'Alta',
  })) {
    (document.getElementById(`task-${campo}`) as HTMLInputElement).value = valor;
  }
  document.getElementById('task-form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      '/api/local-feedback/patients/2/preview',
      expect.objectContaining({ method: 'PUT' }),
    ),
  );
  expect(document.getElementById('agenda-view')?.hidden).toBe(true);
});

it('abre agenda geral e tarefas do painel de pendências', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  servidorFicticio();
  await import('./demonstracao.js');
  await vi.waitFor(() =>
    expect(document.getElementById('pending-panel')?.textContent).toContain('Contato fictício'),
  );
  (document.querySelector('#pending-panel button') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(document.getElementById('tasks-view')?.hidden).toBe(false));
  (document.getElementById('tasks-back') as HTMLButtonElement).click();
  (document.getElementById('open-general-agenda') as HTMLButtonElement).click();
  await vi.waitFor(() =>
    expect(document.getElementById('general-agenda-list')?.textContent).toContain('Cancelado'),
  );
  expect(document.getElementById('general-agenda-list')?.textContent).toContain(
    'Paciente Exemplo Um',
  );
  (document.querySelector('#general-agenda-list button') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(document.getElementById('agenda-view')?.hidden).toBe(false));
  expect(document.getElementById('agenda-patient')?.textContent).toBe('Paciente Exemplo Um');
});

it('ignora resposta antiga do painel após atualização mais recente', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  const original = servidorFicticio();
  let liberar!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
  let chamadas = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, options?: RequestInit) => {
      if (url.endsWith('/pending-tasks') && ++chamadas === 1)
        return new Promise((resolve) => {
          liberar = resolve;
        });
      return original(url, options);
    }),
  );
  await import('./demonstracao.js');
  await vi.waitFor(() => expect(chamadas).toBe(1));
  (document.getElementById('reload-patients') as HTMLButtonElement).click();
  await vi.waitFor(() =>
    expect(document.getElementById('pending-panel')?.textContent).toContain('Contato fictício'),
  );
  liberar({ ok: true, json: async () => ({ patients: [] }) });
  await vi.waitFor(() => expect(chamadas).toBe(2));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(document.getElementById('pending-panel')?.textContent).toContain('Contato fictício');
});

it('guarda encaminhamentos por paciente e recupera ao reabrir', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  servidorFicticio();
  await import('./demonstracao.js');
  await vi.waitFor(() =>
    expect(
      document.querySelector('[aria-label="Abrir encaminhamentos de Paciente Exemplo Um"]'),
    ).not.toBeNull(),
  );
  (
    document.querySelector(
      '[aria-label="Abrir encaminhamentos de Paciente Exemplo Um"]',
    ) as HTMLButtonElement
  ).click();
  await vi.waitFor(() => expect(document.querySelector('#referrals-content form')).not.toBeNull());
  const campos = document.querySelectorAll<HTMLInputElement>('#referrals-content input');
  campos[0].value = 'Serviço fictício';
  campos[1].value = 'Avaliação';
  campos[2].value = 'Equipe';
  document
    .querySelector('#referrals-content form')
    ?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(document.getElementById('referrals-content')?.textContent).toContain('Serviço fictício'),
  );
  (document.getElementById('referrals-back') as HTMLButtonElement).click();
  (
    document.querySelector(
      '[aria-label="Abrir encaminhamentos de Paciente Exemplo Dois"]',
    ) as HTMLButtonElement
  ).click();
  await vi.waitFor(() =>
    expect(document.getElementById('referrals-patient')?.textContent).toBe('Paciente Exemplo Dois'),
  );
  expect(document.getElementById('referrals-content')?.textContent).not.toContain(
    'Serviço fictício',
  );
  (document.getElementById('referrals-back') as HTMLButtonElement).click();
  (
    document.querySelector(
      '[aria-label="Abrir encaminhamentos de Paciente Exemplo Um"]',
    ) as HTMLButtonElement
  ).click();
  await vi.waitFor(() =>
    expect(document.getElementById('referrals-content')?.textContent).toContain('Serviço fictício'),
  );
});

it('guarda orientações por paciente e recupera ao reabrir', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  servidorFicticio();
  await import('./demonstracao.js');
  const abrir = (nome: string) =>
    (
      document.querySelector(`[aria-label="Abrir orientações de ${nome}"]`) as HTMLButtonElement
    ).click();
  await vi.waitFor(() =>
    expect(
      document.querySelector('[aria-label="Abrir orientações de Paciente Exemplo Um"]'),
    ).not.toBeNull(),
  );
  abrir('Paciente Exemplo Um');
  await vi.waitFor(() => expect(document.querySelector('#guidance-content form')).not.toBeNull());
  (document.querySelector('#guidance-content textarea') as HTMLTextAreaElement).value =
    'Orientação fictícia';
  const campos = document.querySelectorAll<HTMLInputElement>('#guidance-content input');
  campos[0].value = 'Equipe';
  campos[1].value = '2026-11-04';
  campos[2].value = 'Família';
  document
    .querySelector('#guidance-content form')
    ?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(document.getElementById('guidance-content')?.textContent).toContain(
      'Orientação fictícia',
    ),
  );
  (document.getElementById('guidance-back') as HTMLButtonElement).click();
  abrir('Paciente Exemplo Dois');
  await vi.waitFor(() =>
    expect(document.getElementById('guidance-patient')?.textContent).toBe('Paciente Exemplo Dois'),
  );
  expect(document.getElementById('guidance-content')?.textContent).not.toContain(
    'Orientação fictícia',
  );
  (document.getElementById('guidance-back') as HTMLButtonElement).click();
  abrir('Paciente Exemplo Um');
  await vi.waitFor(() =>
    expect(document.getElementById('guidance-content')?.textContent).toContain(
      'Orientação fictícia',
    ),
  );
});

it('guarda evoluções fictícias isoladas por paciente e recupera ao reabrir', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  servidorFicticio();
  await import('./demonstracao.js');
  const abrir = (nome: string) =>
    (
      document.querySelector(`[aria-label="Abrir evoluções de ${nome}"]`) as HTMLButtonElement
    ).click();
  await vi.waitFor(() =>
    expect(
      document.querySelector('[aria-label="Abrir evoluções de Paciente Exemplo Um"]'),
    ).not.toBeNull(),
  );
  abrir('Paciente Exemplo Um');
  await vi.waitFor(() => expect(document.querySelector('#evolutions-content form')).not.toBeNull());
  (document.querySelector('#evolutions-content textarea') as HTMLTextAreaElement).value =
    'Registro único de evolução';
  const campos = document.querySelectorAll<HTMLInputElement>('#evolutions-content input');
  campos[0].value = '2026-11-04';
  campos[1].value = 'Equipe fictícia';
  campos[2].value = 'Área fictícia';
  document
    .querySelector('#evolutions-content form')
    ?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(document.getElementById('evolutions-content')?.textContent).toContain(
      'Registro único de evolução',
    ),
  );
  (document.getElementById('evolutions-back') as HTMLButtonElement).click();
  abrir('Paciente Exemplo Dois');
  await vi.waitFor(() =>
    expect(document.getElementById('evolutions-patient')?.textContent).toBe(
      'Paciente Exemplo Dois',
    ),
  );
  expect(document.getElementById('evolutions-content')?.textContent).not.toContain(
    'Registro único de evolução',
  );
  (document.getElementById('evolutions-back') as HTMLButtonElement).click();
  abrir('Paciente Exemplo Um');
  await vi.waitFor(() =>
    expect(document.getElementById('evolutions-content')?.textContent).toContain(
      'Registro único de evolução',
    ),
  );
});

it('cancela edição de pessoa de referência sem manter rascunho sujo', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  const confirmar = vi.fn(() => true);
  vi.stubGlobal('confirm', confirmar);
  servidorFicticio();
  await import('./demonstracao.js');
  const abrir = '[aria-label="Abrir pessoas de referência de Paciente Exemplo Um"]';
  await vi.waitFor(() => expect(document.querySelector(abrir)).not.toBeNull());
  (document.querySelector(abrir) as HTMLButtonElement).click();
  await vi.waitFor(() => expect(document.querySelector('#relations-content form')).not.toBeNull());
  const form = document.querySelector('#relations-content form') as HTMLFormElement;
  const campos = form.querySelectorAll<HTMLInputElement>('input');
  campos[0].value = 'Pessoa fictícia';
  campos[1].value = 'Familiar';
  campos[0].dispatchEvent(new Event('input', { bubbles: true }));
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(document.querySelector('#relations-content ul')?.textContent).toContain(
      'Pessoa fictícia',
    ),
  );
  (document.querySelector('#relations-content ul button') as HTMLButtonElement).click();
  campos[0].value = 'Alteração';
  campos[0].dispatchEvent(new Event('input', { bubbles: true }));
  (
    Array.from(form.querySelectorAll('button')).find(
      (botao) => botao.textContent === 'Cancelar edição',
    ) as HTMLButtonElement
  ).click();
  expect(confirmar).toHaveBeenCalledTimes(1);
  (document.getElementById('relations-back') as HTMLButtonElement).click();
  expect(confirmar).toHaveBeenCalledTimes(1);
  expect(document.getElementById('patients-view')?.hidden).toBe(false);
});
