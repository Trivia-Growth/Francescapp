import { z } from 'zod';
import { campoCifradoSchema, uuidSchema } from './comum.ts';
import { reservaTurnoSchema, versaoTurnoSchema } from './turno.ts';

const turnoPrevistoBaseSchema = z
  .object({
    escala_id: uuidSchema,
    paciente_id: uuidSchema,
    profissional_previsto_usuario_id: uuidSchema,
    inicio_previsto: z.iso.datetime({ offset: true }),
    fim_previsto: z.iso.datetime({ offset: true }),
    versao: versaoTurnoSchema,
  })
  .strict();
const janelaOrdenada = (v: { inicio_previsto: string; fim_previsto: string }) =>
  Date.parse(v.fim_previsto) > Date.parse(v.inicio_previsto);
export const turnoPrevistoSchema = turnoPrevistoBaseSchema.refine(
  janelaOrdenada,
  'Janela inválida.',
);
export const criacaoTurnoPrevistoSchema = reservaTurnoSchema
  .extend({
    escala: turnoPrevistoBaseSchema
      .omit({ versao: true })
      .refine(janelaOrdenada, 'Janela inválida.'),
  })
  .strict();
export const substituicaoTurnoSchema = reservaTurnoSchema
  .extend({
    escala_id: uuidSchema,
    profissional_assumiu_usuario_id: uuidSchema,
    motivo: campoCifradoSchema,
    versao_esperada: versaoTurnoSchema.max(2_147_483_646),
    tipo: z.enum(['substituicao', 'cobertura']),
  })
  .strict();
/** Histórico append-only: autor e instante são produzidos pelo servidor. */
export const registroSubstituicaoTurnoSchema = z
  .object({
    registro_id: uuidSchema,
    escala_id: uuidSchema,
    profissional_previsto_usuario_id: uuidSchema,
    profissional_assumiu_usuario_id: uuidSchema,
    tipo: z.enum(['substituicao', 'cobertura']),
    motivo: campoCifradoSchema,
    autor_usuario_id: uuidSchema,
    registrado_em: z.iso.datetime({ offset: true }),
    versao: versaoTurnoSchema,
  })
  .strict();
export const coberturaTurnoSchema = substituicaoTurnoSchema
  .extend({ tipo: z.literal('cobertura') })
  .strict();
export type TurnoPrevisto = z.infer<typeof turnoPrevistoSchema>;
export type SubstituicaoTurno = z.infer<typeof substituicaoTurnoSchema>;
