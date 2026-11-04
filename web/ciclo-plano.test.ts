import { expect, it, vi } from 'vitest';
import { criarCicloPlano } from './ciclo-plano.js';

const id = '10000000-0000-4000-8000-000000000001';
const objetivo = {
  descricao: 'Fictício',
  area: 'Área',
  responsavel: 'Equipe',
  situacaoInicial: 'Inicial',
  observacaoProgresso: 'Progresso',
  dataRevisao: '2026-12-01',
  estado: 'proposto' as const,
};
const vazio = { epoca: 1, reserva: null, resultado_pendente: null };

it('reserva vinculada ao paciente e mantém bloqueio após resposta perdida inclusive em novo ciclo', async () => {
  const portas = {
    identidadeAtual: () => ({ usuario_id: id, session_id: id }),
    consultar: vi.fn().mockResolvedValue(vazio),
    reservar: vi.fn().mockResolvedValue('aberta'),
    criar: vi.fn().mockRejectedValue(new Error('resposta perdida')),
    encerrar: vi.fn().mockResolvedValue('vazia'),
    reconhecer: vi.fn(),
  };
  const ciclo = criarCicloPlano(portas, () => id);
  await ciclo.consultar();
  await expect(ciclo.criar(id, objetivo)).rejects.toThrow('bloqueado');
  await ciclo.encerrar();
  await ciclo.consultar();
  ciclo.liberar();
  await expect(ciclo.criar(id, objetivo)).rejects.toThrow('resposta perdida');
  expect(portas.reservar).toHaveBeenCalledWith(
    { epoca: 1, reserva_id: id, paciente_id: id },
    expect.anything(),
  );
  expect(portas.criar).toHaveBeenCalledWith(
    { entrada: objetivo, paciente_id: id, chave: id, reserva_id: id, geracao_reserva: 1 },
    expect.anything(),
  );
  await ciclo.consultar();
  expect(() => ciclo.liberar()).toThrow('bloqueado');
  const recarregado = criarCicloPlano(portas, () => id);
  await recarregado.consultar();
  expect(() => recarregado.liberar()).toThrow('bloqueado');
});
