// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { montarEdicaoPaciente, type ServicoEdicaoPaciente } from './editar-paciente.js';

const id = '00000000-0000-4000-8000-000000000001';
const paciente = {
  id,
  nome: 'Paciente fictício',
  nome_preferencia: null,
  data_nascimento: null,
  versao: 2,
  contatos: [],
};
const vazio = { epoca: 1, reserva: null, resultado_pendente: null };

it('reconcilia edição após recarga antes de permitir novo envio, sem persistir rascunho', async () => {
  const ciclo = {
    consultar: vi
      .fn()
      .mockResolvedValueOnce({
        epoca: 2,
        reserva: null,
        resultado_pendente: {
          recibo_id: id,
          reserva_id: id,
          resultado: 'confirmada',
          paciente_id: id,
          versao: 3,
        },
      })
      .mockResolvedValue(vazio),
    encerrar: vi.fn(),
    reconhecer: vi.fn().mockResolvedValue('reconhecido'),
    liberar: vi.fn(),
    editar: vi.fn(),
  };
  const servico = {
    ciclo,
    consultarPaciente: vi.fn().mockResolvedValue(paciente),
  } as unknown as ServicoEdicaoPaciente;
  const raiz = document.createElement('div');
  montarEdicaoPaciente(raiz, id, servico, vi.fn());
  expect(raiz.querySelector('form')).toBeNull();
  raiz.querySelector('button')?.click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('foi confirmada'));
  expect(servico.consultarPaciente).toHaveBeenCalledOnce();
  expect(raiz.textContent).toContain(`Cadastro atual: ${paciente.nome}`);
  expect(raiz.textContent).toContain('confirmada na versão 3');
  expect(raiz.textContent).toContain('O cadastro atual está em outra versão');
  raiz.querySelector('button')?.click();
  await vi.waitFor(() => expect(raiz.querySelector('form')).not.toBeNull());
  expect(ciclo.reconhecer).toHaveBeenCalledOnce();
  expect(ciclo.liberar).toHaveBeenCalledOnce();
  expect(sessionStorage.length).toBe(0);
});

it('preserva rascunho após falha incerta até recarga explícita', async () => {
  const ciclo = {
    consultar: vi
      .fn()
      .mockResolvedValueOnce(vazio)
      .mockResolvedValueOnce(vazio)
      .mockResolvedValue({
        epoca: 2,
        reserva: null,
        resultado_pendente: {
          recibo_id: id,
          reserva_id: id,
          resultado: 'cancelada',
          paciente_id: id,
          versao: null,
        },
      }),
    encerrar: vi.fn().mockResolvedValue('vazia'),
    reconhecer: vi.fn().mockResolvedValue('reconhecido'),
    liberar: vi.fn(),
    editar: vi.fn().mockRejectedValue(new Error()),
  };
  const raiz = document.createElement('div');
  montarEdicaoPaciente(
    raiz,
    id,
    {
      ciclo,
      consultarPaciente: vi.fn().mockResolvedValue(paciente),
    } as unknown as ServicoEdicaoPaciente,
    vi.fn(),
  );
  raiz.querySelector('button')?.click();
  await vi.waitFor(() => expect(raiz.querySelector('form')).not.toBeNull());
  const nome = raiz.querySelector('input');
  const motivo = raiz.querySelector('textarea');
  if (!nome || !motivo) throw new Error('Campos ausentes');
  nome.value = 'Nome fictício alterado';
  motivo.value = 'Correção';
  raiz.querySelector('form')?.requestSubmit();
  await vi.waitFor(() => expect(raiz.textContent).toContain('rascunho permanece'));
  [...raiz.querySelectorAll('button')]
    .find((b) => b.textContent === 'Confirmar situação da edição')
    ?.click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('foi cancelada'));
  [...raiz.querySelectorAll('button')]
    .find((b) => b.textContent === 'Reconhecer resultado e liberar edição')
    ?.click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Copie o rascunho'));
  expect(raiz.querySelector('input')?.value).toBe('Nome fictício alterado');
});

it('preserva rascunho copiável quando reserva falha e barreira está vazia', async () => {
  const ciclo = {
    consultar: vi.fn().mockResolvedValue(vazio),
    encerrar: vi.fn().mockResolvedValue('vazia'),
    reconhecer: vi.fn(),
    liberar: vi.fn(),
    editar: vi.fn().mockRejectedValue(new Error()),
  };
  const raiz = document.createElement('div');
  montarEdicaoPaciente(
    raiz,
    id,
    {
      ciclo,
      consultarPaciente: vi.fn().mockResolvedValue(paciente),
    } as unknown as ServicoEdicaoPaciente,
    vi.fn(),
  );
  raiz.querySelector('button')?.click();
  await vi.waitFor(() => expect(raiz.querySelector('form')).not.toBeNull());
  const nome = raiz.querySelector('input');
  const motivo = raiz.querySelector('textarea');
  if (!nome || !motivo) throw new Error('Campos ausentes');
  nome.value = 'Rascunho fictício';
  motivo.value = 'Correção';
  raiz.querySelector('form')?.requestSubmit();
  await vi.waitFor(() => expect(raiz.textContent).toContain('rascunho permanece'));
  [...raiz.querySelectorAll('button')]
    .find((b) => b.textContent === 'Confirmar situação da edição')
    ?.click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Copie o rascunho'));
  expect(nome.value).toBe('Rascunho fictício');
  expect(raiz.querySelector('fieldset')?.disabled).toBe(false);
  expect(raiz.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
});

it('impede reconhecimento de resultado de outro paciente', async () => {
  const outro = '00000000-0000-4000-8000-000000000002';
  const ciclo = {
    consultar: vi.fn().mockResolvedValue({
      epoca: 2,
      reserva: null,
      resultado_pendente: {
        recibo_id: id,
        reserva_id: id,
        resultado: 'confirmada',
        paciente_id: outro,
        versao: 3,
      },
    }),
    encerrar: vi.fn(),
    reconhecer: vi.fn(),
    liberar: vi.fn(),
    editar: vi.fn(),
  };
  const raiz = document.createElement('div');
  montarEdicaoPaciente(
    raiz,
    id,
    { ciclo, consultarPaciente: vi.fn() } as unknown as ServicoEdicaoPaciente,
    vi.fn(),
  );
  raiz.querySelector('button')?.click();
  await vi.waitFor(() => expect(raiz.textContent).toContain(outro));
  expect(ciclo.reconhecer).not.toHaveBeenCalled();
  expect(raiz.querySelector('button')?.hidden).toBe(true);
});

it('não permite reconhecer quando consulta autorizada para conferência falha', async () => {
  const ciclo = {
    consultar: vi.fn().mockResolvedValue({
      epoca: 2,
      reserva: null,
      resultado_pendente: {
        recibo_id: id,
        reserva_id: id,
        resultado: 'confirmada',
        paciente_id: id,
        versao: 3,
      },
    }),
    encerrar: vi.fn(),
    reconhecer: vi.fn(),
    liberar: vi.fn(),
    editar: vi.fn(),
  };
  const raiz = document.createElement('div');
  montarEdicaoPaciente(
    raiz,
    id,
    {
      ciclo,
      consultarPaciente: vi.fn().mockRejectedValue(new Error()),
    } as unknown as ServicoEdicaoPaciente,
    vi.fn(),
  );
  raiz.querySelector('button')?.click();
  await vi.waitFor(() =>
    expect(raiz.textContent).toContain('Não foi possível confirmar a situação'),
  );
  expect(ciclo.reconhecer).not.toHaveBeenCalled();
  expect(raiz.textContent).not.toContain('Reconhecer resultado e liberar edição');
});
