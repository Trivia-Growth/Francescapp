import { z } from 'zod';
import { uuidSchema } from './comum.ts';
import {
  estadoEncerramentoCadastroSchema,
  estadoReconhecimentoCadastroSchema,
  estadoReservaCadastroSchema,
} from './barreira-cadastro.ts';

const epoca = z.number().int().positive().safe();
export const consultaBarreiraContatoSchema = z
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
            paciente_id: uuidSchema,
            contato_id: uuidSchema,
          })
          .strict(),
        z
          .object({
            recibo_id: uuidSchema,
            reserva_id: uuidSchema,
            resultado: z.literal('cancelada'),
            paciente_id: uuidSchema,
            contato_id: z.null(),
          })
          .strict(),
      ])
      .nullable(),
  })
  .strict()
  .refine(({ reserva, resultado_pendente }) => reserva === null || resultado_pendente === null);
export const reservarContatoSchema = z
  .object({ epoca, reserva_id: uuidSchema, paciente_id: uuidSchema })
  .strict();
export const encerrarContatoSchema = z
  .object({ epoca, reserva_id: uuidSchema.nullable(), comando_id: uuidSchema })
  .strict();
export const reconhecerContatoSchema = z.object({ comando_id: uuidSchema }).strict();
export {
  estadoReservaCadastroSchema,
  estadoEncerramentoCadastroSchema,
  estadoReconhecimentoCadastroSchema,
};
