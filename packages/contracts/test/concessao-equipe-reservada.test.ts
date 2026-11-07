import { describe, expect, it } from 'vitest';
import {
  assinaturasRpc,
  criarConcessaoEquipeReservadaSchema,
  criarConcessaoEquipeSchema,
} from '../src/index.ts';

const id = '31a7e0e6-8b2f-4c85-8baf-9422b39a4175';
const dados = {
  email: 'pessoa@example.test',
  perfil: 'profissional',
  metodo: 'google_workspace',
  motivo: 'Admissão fictícia',
};
const envelope = { entrada: dados, reserva_id: id, geracao_reserva: 1 };

describe('concessão de equipe reservada', () => {
  it('separa dados públicos da reserva e rejeita gerações inválidas', () => {
    expect(criarConcessaoEquipeSchema.safeParse(dados).success).toBe(true);
    expect(criarConcessaoEquipeSchema.safeParse(envelope).success).toBe(false);
    expect(criarConcessaoEquipeReservadaSchema.safeParse(envelope).success).toBe(true);
    for (const geracao_reserva of [undefined, 0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(
        criarConcessaoEquipeReservadaSchema.safeParse({ ...envelope, geracao_reserva }).success,
      ).toBe(false);
    }
    expect(
      criarConcessaoEquipeReservadaSchema.safeParse({ ...envelope, reserva_id: 'inválido' })
        .success,
    ).toBe(false);
  });

  it('exige reserva e geração também no contrato interno da RPC', () => {
    const schema = assinaturasRpc.criarConcessao.entrada.pick({
      reserva_id: true,
      geracao_reserva: true,
    });
    expect(schema.safeParse({ reserva_id: id, geracao_reserva: 1 }).success).toBe(true);
    expect(schema.safeParse({ geracao_reserva: 1 }).success).toBe(false);
    expect(schema.safeParse({ reserva_id: id }).success).toBe(false);
    expect(schema.safeParse({ reserva_id: id, geracao_reserva: 0 }).success).toBe(false);
  });
});
