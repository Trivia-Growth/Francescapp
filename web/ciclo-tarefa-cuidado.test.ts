import { expect, it, vi } from 'vitest';
import { criarCicloTarefaCuidado } from './ciclo-tarefa-cuidado.ts';

it('após resposta perdida e recarga exige cerca, reconhecimento e consulta antes de nova escrita', async () => {
  const ator = '10000000-0000-4000-8000-000000000001';
  const paciente = '20000000-0000-4000-8000-000000000001';
  const tarefa = '30000000-0000-4000-8000-000000000001';
  const recibo = '40000000-0000-4000-8000-000000000001';
  let epoca = 1;
  let reserva: { id: string; estado: 'aberta' | 'confirmada' } | null = null;
  let resultado: {
    recibo_id: string;
    reserva_id: string;
    resultado: 'confirmada';
    paciente_id: string;
    tarefa_id: string;
    versao_esperada: number;
  } | null = null;
  const portas = {
    identidadeAtual: () => ({ usuario_id: ator, session_id: ator }),
    consultar: async () => ({ epoca, reserva, resultado_pendente: resultado }),
    reservar: async (entrada: { reserva_id: string }) => {
      reserva = { id: entrada.reserva_id, estado: 'aberta' };
      return 'aberta';
    },
    gravar: vi.fn(async () => {
      if (!reserva) throw new Error();
      reserva.estado = 'confirmada';
      throw new Error('resposta perdida');
    }),
    encerrar: async () => {
      if (reserva)
        resultado = {
          recibo_id: recibo,
          reserva_id: reserva.id,
          resultado: 'confirmada',
          paciente_id: paciente,
          tarefa_id: tarefa,
          versao_esperada: 0,
        };
      reserva = null;
      epoca++;
      return resultado ? 'confirmada' : 'vazia';
    },
    reconhecer: async () => {
      resultado = null;
      return 'reconhecido';
    },
  };
  const primeiro = criarCicloTarefaCuidado(portas);
  await primeiro.consultar();
  await primeiro.encerrar();
  await primeiro.consultar();
  primeiro.liberar();
  await expect(primeiro.gravar(paciente, tarefa, 0)).rejects.toThrow();
  const recarregado = criarCicloTarefaCuidado(portas);
  await recarregado.consultar();
  await expect(recarregado.gravar(paciente, tarefa, 0)).rejects.toThrow('bloqueada');
  await recarregado.encerrar();
  expect((await recarregado.consultar()).resultado_pendente?.tarefa_id).toBe(tarefa);
  await expect(recarregado.gravar(paciente, tarefa, 0)).rejects.toThrow('bloqueada');
  await recarregado.reconhecer();
  await recarregado.consultar();
  recarregado.liberar();
  expect(portas.gravar).toHaveBeenCalledOnce();
});
