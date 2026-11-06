import { describe, expect, it } from 'vitest';
import {
  entradaBarreiraCadastroSchema,
  respostaBarreiraCadastroSchema,
} from '../src/barreira-cadastro.js';

const id = '10000000-0000-4000-8000-000000000001';
const atestado = {
  key_id: 'chave',
  usuario_id: id,
  session_id: id,
  request_id: id,
  operacao: 'api.reservar_cadastro',
  emitido_em: '2026-11-01T12:00:00Z',
  expira_em: '2026-11-01T12:00:30Z',
  digest_entrada: 'abc',
  mac: 'abc',
};

describe('contratos internos da barreira de cadastro', () => {
  it('distingue operações e rejeita campos extras ou reserva ausente na reserva', () => {
    const entrada = {
      request_id: id,
      atestado,
      operacao: 'api.reservar_cadastro',
      epoca: 1,
      reserva_id: id,
    };
    expect(entradaBarreiraCadastroSchema.safeParse(entrada).success).toBe(true);
    expect(entradaBarreiraCadastroSchema.safeParse({ ...entrada, reserva_id: null }).success).toBe(
      false,
    );
    expect(entradaBarreiraCadastroSchema.safeParse({ ...entrada, comando_id: id }).success).toBe(
      false,
    );
    expect(
      entradaBarreiraCadastroSchema.safeParse({
        request_id: id,
        atestado,
        operacao: 'api.encerrar_cadastro',
        epoca: 1,
        reserva_id: null,
        comando_id: id,
      }).success,
    ).toBe(true);
  });

  it('rejeita resultados contraditórios e campos pessoais extras', () => {
    const dados = {
      epoca: 2,
      reserva: null,
      resultado_pendente: {
        recibo_id: id,
        reserva_id: id,
        resultado: 'confirmada',
        paciente_id: id,
      },
    };
    expect(
      respostaBarreiraCadastroSchema.safeParse({ ok: true, request_id: id, dados }).success,
    ).toBe(true);
    expect(
      respostaBarreiraCadastroSchema.safeParse({
        ok: true,
        request_id: id,
        dados: { ...dados, reserva: { id, estado: 'aberta' } },
      }).success,
    ).toBe(false);
    expect(
      respostaBarreiraCadastroSchema.safeParse({
        ok: true,
        request_id: id,
        dados: { ...dados, resultado_pendente: { ...dados.resultado_pendente, paciente_id: null } },
      }).success,
    ).toBe(false);
    expect(
      respostaBarreiraCadastroSchema.safeParse({
        ok: true,
        request_id: id,
        dados: { ...dados, nome: 'Fictício' },
      }).success,
    ).toBe(false);
  });
});
