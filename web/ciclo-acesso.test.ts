import { expect, it } from 'vitest';
import { criarCicloAcesso } from './ciclo-acesso.ts';

it('mantém nova concessão bloqueada após recarga e resposta incerta até reconciliar', async () => {
  const id = 'a0000000-0000-4000-8000-000000000001';
  let epoca = 1;
  let reserva: string | null = null;
  let recibo: string | null = null;
  const portas = {
    identidadeAtual: () => ({ usuario_id: id, session_id: id }),
    consultar: async () => ({
      epoca,
      reserva: reserva ? { id: reserva, estado: 'aberta' } : null,
      resultado_pendente: recibo
        ? {
            recibo_id: recibo,
            reserva_id: id,
            resultado: 'cancelada',
            acao: 'conceder',
            versao_esperada: null,
            paciente_id: id,
            acesso_id: null,
          }
        : null,
    }),
    reservar: async (entrada: { reserva_id: string }) => {
      reserva = entrada.reserva_id;
      return 'aberta';
    },
    criar: async () => {
      throw new Error('resposta perdida');
    },
    revogar: async () => {
      throw new Error('resposta perdida');
    },
    encerrar: async (entrada: { comando_id: string }) => {
      if (!reserva) {
        epoca++;
        return 'vazia';
      }
      reserva = null;
      recibo = entrada.comando_id;
      epoca++;
      return 'cancelada';
    },
    reconhecer: async () => {
      recibo = null;
      return 'reconhecido';
    },
  };
  const primeiro = criarCicloAcesso(portas, () => id);
  await primeiro.consultar();
  await primeiro.encerrar();
  await primeiro.consultar();
  primeiro.liberar();
  await expect(primeiro.criar(id, { usuario_id: id, motivo: 'Motivo fictício' })).rejects.toThrow();
  const recarregado = criarCicloAcesso(portas, () => id);
  await recarregado.consultar();
  await expect(
    recarregado.criar(id, { usuario_id: id, motivo: 'Motivo fictício' }),
  ).rejects.toThrow('Acesso bloqueado');
  await recarregado.encerrar();
  await recarregado.consultar();
  await recarregado.reconhecer();
  await recarregado.consultar();
  expect(() => recarregado.liberar()).not.toThrow();
});

it('bloqueia revogação após recarga até encerramento e reconhecimento', async () => {
  const id = 'a0000000-0000-4000-8000-000000000001';
  let epoca = 1;
  let reserva = false;
  let recibo = false;
  const portas = {
    identidadeAtual: () => ({ usuario_id: id, session_id: id }),
    consultar: async () => ({
      epoca,
      reserva: reserva ? { id, estado: 'aberta' } : null,
      resultado_pendente: recibo
        ? {
            recibo_id: id,
            reserva_id: id,
            resultado: 'cancelada',
            acao: 'revogar',
            paciente_id: id,
            acesso_id: id,
            versao_esperada: 1,
          }
        : null,
    }),
    reservar: async () => {
      reserva = true;
      return 'aberta';
    },
    criar: async () => ({}),
    revogar: async () => {
      throw new Error('resposta perdida');
    },
    encerrar: async () => {
      epoca++;
      if (!reserva) return 'vazia';
      reserva = false;
      recibo = true;
      return 'cancelada';
    },
    reconhecer: async () => {
      recibo = false;
      return 'reconhecido';
    },
  };
  const primeiro = criarCicloAcesso(portas, () => id);
  await primeiro.consultar();
  await primeiro.encerrar();
  await primeiro.consultar();
  primeiro.liberar();
  await expect(
    primeiro.revogar(id, id, { motivo: 'Motivo fictício', versao_esperada: 1 }),
  ).rejects.toThrow();
  const recarregado = criarCicloAcesso(portas, () => id);
  await recarregado.consultar();
  await expect(
    recarregado.revogar(id, id, { motivo: 'Motivo fictício', versao_esperada: 1 }),
  ).rejects.toThrow('Acesso bloqueado');
  await recarregado.encerrar();
  await recarregado.consultar();
  await recarregado.reconhecer();
  await recarregado.consultar();
  expect(() => recarregado.liberar()).not.toThrow();
});
