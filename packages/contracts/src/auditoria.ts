import { z } from 'zod';
import { uuidSchema } from './comum.ts';

/** Cada evento identifica um usuário, identidade Auth não admitida ou operador restrito. */
export const eventoAuditoriaSchema = z
  .object({
    id: uuidSchema,
    instante: z.string().datetime({ offset: true }),
    ator_usuario_id: uuidSchema.nullable(),
    ator_auth_id: uuidSchema.nullable().optional(),
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
  .refine(
    (evento) =>
      [evento.ator_usuario_id, evento.ator_auth_id ?? null, evento.operador_restrito].filter(
        (autor) => autor !== null,
      ).length === 1,
  );
