// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { FalhaApi } from './api.js';
import { montarPlanoCuidado } from './plano-cuidado.js';

const objetivo = {
  descricao: '<img src=x>',
  area: 'Cuidado',
  responsavel: 'Equipe',
  situacaoInicial: 'Inicial',
  observacaoProgresso: 'Observação',
  dataRevisao: '2026-12-01',
  estado: 'proposto' as const,
};
const atual = { objetivo_id: 'objetivo', versao: 1, objetivo };

it('mostra texto como texto e envia revisão com versão esperada', async () => {
  const raiz = document.createElement('div');
  const revisarObjetivo = vi.fn().mockResolvedValue(undefined);
  montarPlanoCuidado(
    raiz,
    'paciente',
    {
      consultarObjetivos: vi.fn().mockResolvedValue([atual]),
      criarObjetivo: vi.fn(),
      revisarObjetivo,
    },
    vi.fn(),
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('<img src=x>'));
  expect(raiz.querySelector('img')).toBeNull();
  [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Revisar objetivo')?.click();
  const motivo = [...raiz.querySelectorAll('label')]
    .find((label) => label.textContent?.includes('Motivo da revisão'))
    ?.querySelector('textarea');
  if (!motivo) throw new Error('Motivo ausente');
  motivo.value = 'Ajuste';
  raiz.querySelector('form')?.requestSubmit();
  await vi.waitFor(() =>
    expect(revisarObjetivo).toHaveBeenCalledWith('paciente', 'objetivo', 1, {
      objetivo,
      motivo: 'Ajuste',
    }),
  );
});

it('preserva rascunho e bloqueia reenvio quando resultado é incerto', async () => {
  const raiz = document.createElement('div');
  const revisarObjetivo = vi.fn().mockRejectedValue(new Error());
  montarPlanoCuidado(
    raiz,
    'paciente',
    {
      consultarObjetivos: vi.fn().mockResolvedValue([atual]),
      criarObjetivo: vi.fn(),
      revisarObjetivo,
    },
    vi.fn(),
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('Revisar objetivo'));
  [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Revisar objetivo')?.click();
  const motivo = [...raiz.querySelectorAll('label')]
    .find((label) => label.textContent?.includes('Motivo da revisão'))
    ?.querySelector('textarea');
  if (!motivo) throw new Error('Motivo ausente');
  motivo.value = 'Ajuste';
  raiz.querySelector('form')?.requestSubmit();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Não foi possível confirmar'));
  raiz.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(revisarObjetivo).toHaveBeenCalledTimes(1);
  expect(motivo.value).toBe('Ajuste');
});

it('remove dados quando acesso é revogado', async () => {
  const raiz = document.createElement('div');
  const acessoPerdido = vi.fn();
  montarPlanoCuidado(
    raiz,
    'paciente',
    {
      consultarObjetivos: vi.fn().mockRejectedValue(new FalhaApi('negado', 403)),
      criarObjetivo: vi.fn(),
      revisarObjetivo: vi.fn(),
    },
    acessoPerdido,
  );
  await vi.waitFor(() => expect(acessoPerdido).toHaveBeenCalledOnce());
  expect(raiz.childElementCount).toBe(0);
});

it('consulta plano atual sem perder rascunho nem reenviar após conflito', async () => {
  const raiz = document.createElement('div');
  const revisarObjetivo = vi.fn().mockRejectedValue(new FalhaApi('conflito_versao', 409));
  const consultarObjetivos = vi.fn().mockResolvedValue([atual]);
  montarPlanoCuidado(
    raiz,
    'paciente',
    { consultarObjetivos, criarObjetivo: vi.fn(), revisarObjetivo },
    vi.fn(),
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('Revisar objetivo'));
  [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Revisar objetivo')?.click();
  const motivo = [...raiz.querySelectorAll('label')]
    .find((label) => label.textContent?.includes('Motivo da revisão'))
    ?.querySelector('textarea');
  if (!motivo) throw new Error('Motivo ausente');
  motivo.value = 'Rascunho preservado';
  raiz.querySelector('form')?.requestSubmit();
  await vi.waitFor(() => expect(raiz.textContent).toContain('outra pessoa'));
  [...raiz.querySelectorAll('button')]
    .find((b) => b.textContent === 'Consultar versão atual')
    ?.click();
  await vi.waitFor(() =>
    expect(raiz.textContent).toContain('Descartar rascunho e abrir plano atual'),
  );
  expect(motivo.value).toBe('Rascunho preservado');
  expect(revisarObjetivo).toHaveBeenCalledTimes(1);
  [...raiz.querySelectorAll('button')]
    .find((b) => b.textContent === 'Descartar rascunho e abrir plano atual')
    ?.click();
  expect(raiz.querySelector('form')).toBeNull();
  expect(raiz.textContent).toContain('Revisar objetivo');
});

it('mantém criação bloqueada após consulta quando salvamento pode concluir depois', async () => {
  const raiz = document.createElement('div');
  const criarObjetivo = vi.fn().mockRejectedValue(new Error());
  const consultarObjetivos = vi.fn().mockResolvedValue([]);
  montarPlanoCuidado(
    raiz,
    'paciente',
    { consultarObjetivos, criarObjetivo, revisarObjetivo: vi.fn() },
    vi.fn(),
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('Adicionar objetivo'));
  [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Adicionar objetivo')?.click();
  const form = raiz.querySelector('form');
  if (!form) throw new Error('Formulário ausente');
  const preencher = (nome: string, valor: string) => {
    const campo = [...form.querySelectorAll('label')]
      .find((l) => l.textContent?.includes(nome))
      ?.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null;
    if (!campo) throw new Error(`Campo ausente: ${nome}`);
    campo.value = valor;
  };
  preencher('Objetivo', 'Objetivo fictício');
  preencher('Área', 'Cuidado');
  preencher('Responsável', 'Equipe');
  preencher('Situação inicial', 'Inicial');
  preencher('Como observar o progresso', 'Observação');
  preencher('Data de revisão', '2026-12-01');
  form.requestSubmit();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Não foi possível confirmar'));
  [...raiz.querySelectorAll('button')]
    .find((b) => b.textContent === 'Consultar versão atual')
    ?.click();
  await vi.waitFor(() =>
    expect(raiz.textContent).toContain('Descartar rascunho e abrir plano atual'),
  );
  [...raiz.querySelectorAll('button')]
    .find((b) => b.textContent === 'Descartar rascunho e abrir plano atual')
    ?.click();
  const adicionar = [...raiz.querySelectorAll('button')].find(
    (b) => b.textContent === 'Adicionar objetivo',
  );
  expect(adicionar?.disabled).toBe(true);
  expect(raiz.textContent).toContain('precisa de confirmação definitiva');
  expect(criarObjetivo).toHaveBeenCalledTimes(1);
});
