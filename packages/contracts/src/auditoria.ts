import { z } from 'zod';
import { uuidSchema } from './comum.ts';

/** A auditoria deve identificar uma pessoa ou um operador restrito, nunca ambos. */
export const eventoAuditoriaSchema = z
  .object({
    id: uuidSchema,
    instante: z.string().datetime({ offset: true }),
    ator_usuario_id: uuidSchema.nullable(),
    operador_restrito: z
      .string()
      .refine((valor) => valor.trim().length > 0)
      .nullable(),
    acao: z.string().min(1).max(120),
    tipo_objeto: z.string().min(1).max(120),
    objeto_id: uuidSchema.nullable(),
    resultado: z.enum(['permitido', 'negado', 'falhou']),
  })
  .strict()
  .refine((evento) => (evento.ator_usuario_id === null) !== (evento.operador_restrito === null));
