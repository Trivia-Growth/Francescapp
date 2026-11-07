// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { FalhaApi } from './api.ts';
import { montarTarefasCuidado } from './tarefas-cuidado.ts';

it.each([401, 403])('remove rascunho antes de informar perda de acesso %s', async (status) => {
  const raiz = document.createElement('div');
  const acessoPerdido = vi.fn(() => expect(raiz.textContent).not.toContain('Dado fictício'));
  montarTarefasCuidado(
    raiz,
    'paciente',
    {
      consultarTarefas: vi.fn().mockResolvedValue([]),
      criarTarefa: vi.fn().mockRejectedValue(new FalhaApi('sem_permissao', status)),
    },
    acessoPerdido,
  );
  await vi.waitFor(() => expect(raiz.querySelector('form')).not.toBeNull());
  const inputs = raiz.querySelectorAll('form input');
  const [descricao, responsavel, prazo] = inputs;
  if (!descricao || !responsavel || !prazo) throw new Error('Campos ausentes');
  descricao.value = 'Dado fictício';
  responsavel.value = 'Equipe';
  prazo.value = '2026-12-01';
  raiz.querySelector('form')?.requestSubmit();
  await vi.waitFor(() => expect(acessoPerdido).toHaveBeenCalledOnce());
  expect(raiz.childElementCount).toBe(0);
});

it('bloqueia escrita até reconhecer resultado pendente de outra sessão', async () => {
  const raiz = document.createElement('div');
  const pendente = {
    recibo_id: '40000000-0000-4000-8000-000000000001',
    reserva_id: '50000000-0000-4000-8000-000000000001',
    resultado: 'confirmada' as const,
    paciente_id: '20000000-0000-4000-8000-000000000001',
    tarefa_id: '30000000-0000-4000-8000-000000000001',
    versao_esperada: 0,
  };
  const ciclo = {
    consultar: vi
      .fn()
      .mockResolvedValueOnce({ epoca: 2, reserva: null, resultado_pendente: pendente })
      .mockResolvedValue({ epoca: 2, reserva: null, resultado_pendente: null }),
    encerrar: vi.fn(),
    reconhecer: vi.fn().mockResolvedValue('reconhecido'),
    liberar: vi.fn(),
    gravar: vi.fn(),
  };
  montarTarefasCuidado(
    raiz,
    pendente.paciente_id,
    {
      consultarTarefas: vi.fn().mockResolvedValue([]),
      criarTarefa: vi.fn(),
      ciclo,
    },
    vi.fn(),
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('Confirmar situação de escrita'));
  expect(raiz.querySelector('form')).toBeNull();
  raiz.querySelector('button')?.click();
  await vi.waitFor(() => expect(raiz.textContent).toContain(pendente.tarefa_id));
  expect(ciclo.reconhecer).not.toHaveBeenCalled();
  expect(raiz.querySelector('form')).toBeNull();
  raiz.querySelector('button')?.click();
  await vi.waitFor(() => expect(raiz.querySelector('form')).not.toBeNull());
  expect(ciclo.reconhecer).toHaveBeenCalledOnce();
  expect(ciclo.liberar).toHaveBeenCalledOnce();
});

it('retoma consulta após reconhecimento confirmado sem reconhecê-lo novamente', async () => {
  const raiz = document.createElement('div');
  const pendente = {
    recibo_id: '40000000-0000-4000-8000-000000000001',
    reserva_id: '50000000-0000-4000-8000-000000000001',
    resultado: 'confirmada' as const,
    paciente_id: '20000000-0000-4000-8000-000000000001',
    tarefa_id: '30000000-0000-4000-8000-000000000001',
    versao_esperada: 0,
  };
  const ciclo = {
    consultar: vi
      .fn()
      .mockResolvedValueOnce({ epoca: 2, reserva: null, resultado_pendente: pendente })
      .mockRejectedValueOnce(new Error('indisponível'))
      .mockResolvedValue({ epoca: 2, reserva: null, resultado_pendente: null }),
    encerrar: vi.fn(),
    reconhecer: vi.fn().mockResolvedValue('reconhecido'),
    liberar: vi.fn(),
    gravar: vi.fn(),
  };
  montarTarefasCuidado(
    raiz,
    pendente.paciente_id,
    { consultarTarefas: vi.fn().mockResolvedValue([]), criarTarefa: vi.fn(), ciclo },
    vi.fn(),
  );
  await vi.waitFor(() => expect(raiz.querySelector('button')).not.toBeNull());
  raiz.querySelector('button')?.click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Reconhecer resultado'));
  raiz.querySelector('button')?.click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Não foi possível confirmar'));
  raiz.querySelector('button')?.click();
  await vi.waitFor(() => expect(raiz.querySelector('form')).not.toBeNull());
  expect(ciclo.reconhecer).toHaveBeenCalledOnce();
  expect(ciclo.liberar).toHaveBeenCalledOnce();
});

it('apresenta novo resultado surgido após reconhecer o anterior', async () => {
  const raiz = document.createElement('div');
  const anterior = {
    recibo_id: '40000000-0000-4000-8000-000000000001',
    reserva_id: '50000000-0000-4000-8000-000000000001',
    resultado: 'confirmada' as const,
    paciente_id: '20000000-0000-4000-8000-000000000001',
    tarefa_id: '30000000-0000-4000-8000-000000000001',
    versao_esperada: 0,
  };
  const novo = {
    ...anterior,
    recibo_id: '40000000-0000-4000-8000-000000000002',
    tarefa_id: '30000000-0000-4000-8000-000000000002',
  };
  const ciclo = {
    consultar: vi
      .fn()
      .mockResolvedValueOnce({ epoca: 2, reserva: null, resultado_pendente: anterior })
      .mockResolvedValueOnce({ epoca: 3, reserva: null, resultado_pendente: novo })
      .mockResolvedValue({ epoca: 3, reserva: null, resultado_pendente: null }),
    encerrar: vi.fn(),
    reconhecer: vi.fn().mockResolvedValue('reconhecido'),
    liberar: vi.fn(),
    gravar: vi.fn(),
  };
  montarTarefasCuidado(
    raiz,
    anterior.paciente_id,
    { consultarTarefas: vi.fn().mockResolvedValue([]), criarTarefa: vi.fn(), ciclo },
    vi.fn(),
  );
  await vi.waitFor(() => expect(raiz.querySelector('button')).not.toBeNull());
  raiz.querySelector('button')?.click();
  await vi.waitFor(() => expect(raiz.textContent).toContain(anterior.tarefa_id));
  raiz.querySelector('button')?.click();
  await vi.waitFor(() => expect(raiz.textContent).toContain(novo.tarefa_id));
  expect(ciclo.reconhecer).toHaveBeenCalledTimes(1);
  expect(ciclo.liberar).not.toHaveBeenCalled();
  raiz.querySelector('button')?.click();
  await vi.waitFor(() => expect(raiz.querySelector('form')).not.toBeNull());
  expect(ciclo.reconhecer).toHaveBeenCalledTimes(2);
  expect(ciclo.liberar).toHaveBeenCalledOnce();
});
