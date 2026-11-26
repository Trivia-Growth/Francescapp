import { expect, it, vi } from 'vitest';
import { processarBarreiraTurnoNativa } from './turno-barreira-handler-nativo.ts';
const id = 'a0000000-0000-4000-8000-000000000001';
it('nega origem não autorizada antes de assinar ou reservar', async () => {
  const executar = vi.fn();
  const atestarEntrada = vi.fn();
  const resposta = await processarBarreiraTurnoNativa(
    new Request('https://example.test/api/turnos/barreira/reservar', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sessao': id,
        origin: 'https://outro.example.test',
      },
      body: JSON.stringify({
        epoca: 1,
        reserva_id: id,
        paciente_id: id,
        turno_id: id,
        versao_esperada: 0,
      }),
    }),
    'reservar',
    {
      autorizar: async () => ({
        estado: 'autorizado',
        identidade: { usuario_id: id, session_id: id },
      }),
      revalidar: async () => ({ estado: 'sem_permissao' }),
      validarOrigem: async () => false,
      metadados: (request_id) => ({
        key_id: 'teste',
        emitido_em: '2026-11-18T12:00:00Z',
        expira_em: '2026-11-18T12:00:30Z',
        request_id,
      }),
      atestador: { atestarEntrada },
      executar,
    },
  );
  expect(resposta.status).toBe(403);
  expect(atestarEntrada).not.toHaveBeenCalled();
  expect(executar).not.toHaveBeenCalled();
});
