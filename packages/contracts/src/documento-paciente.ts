import { z } from 'zod';
import { uuidSchema } from './comum.ts';
import { campoCifradoSchema } from './rpc.ts';

/** Resposta privada do banco para documento versionado e cifrado por paciente
 * (FR-005 contexto de cuidado, FR-002 rede de cuidado). A forma é a mesma nas duas
 * features de propósito: uma cópia por feature divergiria num controle de segurança.
 * Não constitui rota HTTP pública. */
export const respostaDocumentoPacientePrivadaSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      repeticao: z.boolean(),
      dados: z
        .object({
          registro_id: uuidSchema,
          paciente_id: uuidSchema,
          versao: z.number().int().min(1).max(2_147_483_647),
          conteudo: campoCifradoSchema,
        })
        .strict()
        .nullable(),
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
