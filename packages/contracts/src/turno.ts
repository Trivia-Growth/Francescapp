import { z } from 'zod';
import { cursorSchema, limitePaginaSchema, uuidSchema } from './comum.ts';

export const reservaTurnoSchema = z
  .object({
    reserva_id: uuidSchema,
    geracao_reserva: z.number().int().positive().safe(),
  })
  .strict();
export const versaoTurnoSchema = z.number().int().positive().max(2_147_483_647);
export const parametrosTurnoSchema = z
  .object({
    duracao_padrao_minutos: z.number().int().positive().safe(),
    tolerancia_atraso_minutos: z.number().int().nonnegative().safe(),
    // Política administrada; nunca autoriza encerramento automático.
    tratamento_nao_encerrado: z.literal('sinalizar_pendencia'),
  })
  .strict();
export const turnoSchema = z
  .object({
    turno_id: uuidSchema,
    paciente_id: uuidSchema,
    profissional_usuario_id: uuidSchema,
    aberto_em: z.iso.datetime({ offset: true }),
    encerrado_em: z.iso.datetime({ offset: true }).nullable(),
    situacao: z.enum(['aberto', 'encerrado']),
    versao: versaoTurnoSchema,
    parametros: parametrosTurnoSchema,
  })
  .strict()
  .refine(
    (v) => (v.situacao === 'aberto') === (v.encerrado_em === null),
    'Situação e encerramento incompatíveis.',
  )
  .refine(
    (v) => !v.encerrado_em || Date.parse(v.encerrado_em) >= Date.parse(v.aberto_em),
    'Encerramento anterior à abertura.',
  );
/** Identidade e relógio nunca são aceitos como autoridade da entrada. */
export const aberturaTurnoSchema = reservaTurnoSchema.extend({ turno_id: uuidSchema }).strict();
export const encerramentoTurnoSchema = aberturaTurnoSchema
  .extend({
    versao_esperada: versaoTurnoSchema.max(2_147_483_646),
    sintese_registro_id: uuidSchema,
  })
  .strict();
export const consultaTurnosSchema = z
  .object({
    situacao: z.enum(['aberto', 'encerrado']).optional(),
    cursor: cursorSchema.optional(),
    limite: limitePaginaSchema,
  })
  .strict();
export const respostaTurnoPrivadaSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      repeticao: z.boolean(),
      dados: turnoSchema.nullable(),
      request_id: uuidSchema,
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      erro: z
        .object({ codigo: z.enum(['sem_permissao', 'conflito', 'conflito_idempotencia']) })
        .strict(),
      request_id: uuidSchema,
    })
    .strict(),
]);
export type Turno = z.infer<typeof turnoSchema>;
export type AberturaTurno = z.infer<typeof aberturaTurnoSchema>;
export type EncerramentoTurno = z.infer<typeof encerramentoTurnoSchema>;
export type ParametrosTurno = z.infer<typeof parametrosTurnoSchema>;

export const consultaTurnoSchema = z.object({ turno_id: uuidSchema }).strict();
