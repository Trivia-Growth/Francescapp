import { z } from 'zod';
import { uuidSchema } from './comum.ts';

const epoca = z.number().int().positive().safe();
const versao = z.number().int().nonnegative().max(2147483646);
export const consultaBarreiraTarefaSchema = z
  .object({
    epoca,
    reserva: z
      .object({ id: uuidSchema, estado: z.enum(['aberta', 'confirmada', 'cancelada']) })
      .strict()
      .nullable(),
    resultado_pendente: z
      .object({
        recibo_id: uuidSchema,
        reserva_id: uuidSchema,
        resultado: z.enum(['confirmada', 'cancelada']),
        paciente_id: uuidSchema,
        tarefa_id: uuidSchema,
        versao_esperada: versao,
      })
      .strict()
      .nullable(),
  })
  .strict()
  .refine(({ reserva, resultado_pendente }) => !reserva || !resultado_pendente);
export const reservarTarefaSchema = z
  .object({
    epoca,
    reserva_id: uuidSchema,
    paciente_id: uuidSchema,
    tarefa_id: uuidSchema,
    versao_esperada: versao,
  })
  .strict();
export const encerrarTarefaSchema = z
  .object({ epoca, reserva_id: uuidSchema.nullable(), comando_id: uuidSchema })
  .strict();
export const reconhecerTarefaSchema = z.object({ comando_id: uuidSchema }).strict();
