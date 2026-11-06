import { describe, expect, it } from 'vitest';
import { entradaBarreiraPlanoSchema, respostaBarreiraPlanoSchema } from '../src/barreira-plano.js';

const id = '10000000-0000-4000-8000-000000000001';
const atestado = {
  key_id: 'chave',
  usuario_id: id,
  session_id: id,
  request_id: id,
  operacao: 'api.reservar_plano',
  emitido_em: '2026-11-01T12:00:00Z',
  expira_em: '2026-11-01T12:00:30Z',
  digest_entrada: 'abc',
  mac: 'abc',
};

describe('contrato privado da barreira de plano', () => {
  it('vincula reserva a paciente e metadados do atestado', () => {
    const entrada = {
      request_id: id,
      atestado,
      operacao: 'api.reservar_plano',
      epoca: 1,
      reserva_id: id,
      paciente_id: id,
    };
    expect(entradaBarreiraPlanoSchema.safeParse(entrada).success).toBe(true);
    expect(entradaBarreiraPlanoSchema.safeParse({ ...entrada, paciente_id: null }).success).toBe(
      false,
    );
    expect(
      entradaBarreiraPlanoSchema.safeParse({
        ...entrada,
        atestado: { ...atestado, operacao: 'api.encerrar_plano' },
      }).success,
    ).toBe(false);
    expect(entradaBarreiraPlanoSchema.safeParse({ ...entrada, comando_id: id }).success).toBe(
      false,
    );
  });
  it('valida o paciente e objetivo do resultado pendente', () => {
    const pendente = {
      recibo_id: id,
      reserva_id: id,
      resultado: 'confirmada',
      paciente_id: id,
      objetivo_id: id,
    };
    const resposta = {
      ok: true,
      request_id: id,
      dados: { epoca: 2, reserva: null, resultado_pendente: pendente },
    };
    expect(respostaBarreiraPlanoSchema.safeParse(resposta).success).toBe(true);
    expect(
      respostaBarreiraPlanoSchema.safeParse({
        ...resposta,
        dados: { ...resposta.dados, resultado_pendente: { ...pendente, objetivo_id: null } },
      }).success,
    ).toBe(false);
    expect(
      respostaBarreiraPlanoSchema.safeParse({
        ...resposta,
        dados: {
          ...resposta.dados,
          resultado_pendente: { ...pendente, resultado: 'cancelada', objetivo_id: null },
        },
      }).success,
    ).toBe(true);
  });
});
