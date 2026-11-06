import { z } from 'zod';
import { uuidSchema } from './comum.ts';
export const consultaVinculosProfissionaisSchema = z
  .object({ cursor: uuidSchema.optional() })
  .strict();
export const paginaVinculosProfissionaisSchema = z
  .object({
    itens: z
      .array(
        z
          .object({
            id: uuidSchema,
            usuario_id: uuidSchema,
            revogado: z.boolean(),
            versao: z.number().int().positive(),
          })
          .strict(),
      )
      .max(50),
    proximo_cursor: uuidSchema.nullable(),
  })
  .strict();
