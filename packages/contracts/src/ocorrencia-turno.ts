import { z } from 'zod';
import { campoCifradoSchema, uuidSchema } from './comum.ts';
import { reservaTurnoSchema } from './turno.ts';

export const ocorrenciaTurnoSchema = z
  .object({
    turno_id: uuidSchema,
    descricao: campoCifradoSchema,
    instante_ocorrencia: z.iso.datetime({ offset: true }),
    providencia: campoCifradoSchema,
    // Somente referência privada; autorização do documento é verificada no servidor.
    anexo_documento_id: uuidSchema.optional(),
  })
  .strict();
export const criacaoOcorrenciaTurnoSchema = reservaTurnoSchema
  .extend({ ocorrencia_id: uuidSchema, ocorrencia: ocorrenciaTurnoSchema })
  .strict();
export type OcorrenciaTurno = z.infer<typeof ocorrenciaTurnoSchema>;
