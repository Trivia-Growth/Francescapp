import { z } from 'zod';
import { uuidSchema } from './comum.ts';

const epoca = z.number().int().positive().safe();
export const consultaBarreiraEquipeSchema = z
  .object({
    epoca,
    reserva: z
      .object({ id: uuidSchema, estado: z.enum(['aberta', 'confirmada', 'cancelada']) })
      .strict()
      .nullable(),
    resultado_pendente: z
      .discriminatedUnion('resultado', [
        z
          .object({
            recibo_id: uuidSchema,
            reserva_id: uuidSchema,
            resultado: z.literal('confirmada'),
            concessao_id: uuidSchema,
          })
          .strict(),
        z
          .object({
            recibo_id: uuidSchema,
            reserva_id: uuidSchema,
            resultado: z.literal('cancelada'),
            concessao_id: z.null(),
          })
          .strict(),
      ])
      .nullable(),
  })
  .strict()
  .refine(({ reserva, resultado_pendente }) => !reserva || !resultado_pendente);
export const reservarEquipeSchema = z.object({ epoca, reserva_id: uuidSchema }).strict();
export const encerrarEquipeSchema = z
  .object({ epoca, reserva_id: uuidSchema.nullable(), comando_id: uuidSchema })
  .strict();
export const reconhecerEquipeSchema = z.object({ comando_id: uuidSchema }).strict();
