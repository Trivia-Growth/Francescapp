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

it('identifica pendência e guarda anamnese fictícia por paciente na página', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await import('./demonstracao.js');
  document.getElementById('demo-login')?.click();
  (document.querySelector('#patients-body button') as HTMLButtonElement).click();
  expect(document.getElementById('anamnese-progress')?.textContent).toContain('incompleta');
  (document.getElementById('anamnese-state') as HTMLSelectElement).value = 'desconhecido';
  (document.getElementById('anamnese-source') as HTMLInputElement).value = 'Fonte fictícia';
  (document.getElementById('anamnese-date') as HTMLInputElement).value = '2026-01-01';
  document
    .getElementById('anamnese-form')
    ?.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(document.getElementById('anamnese-progress')?.textContent).toContain('sem pendências');
  document.getElementById('back-patients')?.click();
  (document.querySelector('#patients-body button') as HTMLButtonElement).click();
  expect((document.getElementById('anamnese-state') as HTMLSelectElement).value).toBe(
    'desconhecido',
  );
  expect((document.getElementById('anamnese-source') as HTMLInputElement).value).toBe(
    'Fonte fictícia',
  );
  expect(fetch).not.toHaveBeenCalled();
});

it('avisa sobre alterações não guardadas antes de sair da anamnese', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await import('./demonstracao.js');
  document.getElementById('demo-login')?.click();
  (document.querySelector('#patients-body button') as HTMLButtonElement).click();
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
  await import('./demonstracao.js');
  document.getElementById('demo-login')?.click();
  (document.querySelector('#patients-body button') as HTMLButtonElement).click();
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
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await import('./demonstracao.js');
  document.getElementById('demo-login')?.click();
  const abrir = () =>
    document.querySelectorAll<HTMLButtonElement>(
      '#patients-body button[aria-label^="Abrir tarefas"]',
    );
  abrir()[0]?.click();
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
  expect(document.getElementById('tasks-list')?.textContent).toContain('Acompanhar exemplo');
  const atualizar = document.querySelector('#tasks-list form') as HTMLFormElement;
  (atualizar.querySelector('select') as HTMLSelectElement).value = 'concluida';
  atualizar.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(atualizar.textContent).toContain('Informe a ação');
  (atualizar.querySelector('textarea') as HTMLTextAreaElement).value = 'Ação fictícia';
  const botaoAtualizar = atualizar.querySelector('button') as HTMLButtonElement;
  botaoAtualizar.focus();
  atualizar.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(document.activeElement).toBe(botaoAtualizar);
  expect(atualizar.querySelector('[role=status]')?.textContent).toContain('atualizada');
  expect(document.getElementById('tasks-list')?.textContent).toContain('Concluída');
  expect(document.getElementById('tasks-list')?.textContent).toContain('Ação fictícia');
  document.getElementById('tasks-back')?.click();
  abrir()[1]?.click();
  expect(document.getElementById('tasks-list')?.textContent).not.toContain('Acompanhar exemplo');
  document.getElementById('tasks-back')?.click();
  abrir()[0]?.click();
  expect(document.getElementById('tasks-list')?.textContent).toContain('Acompanhar exemplo');
  expect(fetch).not.toHaveBeenCalled();
});

it('confirma descarte de alterações de tarefas ao voltar ou sair', async () => {
  document.documentElement.innerHTML = readFileSync('web/demonstracao.html', 'utf8');
  vi.stubGlobal('location', { hostname: 'localhost' });
  vi.stubEnv('DEV', true);
  const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await import('./demonstracao.js');
  document.getElementById('demo-login')?.click();
  document
    .querySelector<HTMLButtonElement>('#patients-body button[aria-label^="Abrir tarefas"]')
    ?.click();
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
