import { z } from 'zod';
import { uuidSchema } from './comum.ts';

// Metadados operacionais próprios; nenhum conteúdo clínico ou identidade de terceiro.
export const epocaExecucaoTurnoSchema = z.number().int().positive().max(2147483647);
export const reciboExecucaoTurnoSchema = z
  .object({
    recibo_id: uuidSchema,
    paciente_id: uuidSchema,
    classe: z.enum(['afericao', 'prescricao', 'administracao', 'ocorrencia', 'rotina']),
    registro_id: uuidSchema,
    versao: z.number().int().positive(),
    registrado_em: z.iso.datetime({ offset: true }),
  })
  .strict();
export const estadoBarreiraExecucaoTurnoSchema = z
  .object({
    epoca: epocaExecucaoTurnoSchema,
    resultado_pendente: reciboExecucaoTurnoSchema.nullable(),
  })
  .strict();
export const reconciliarExecucaoTurnoSchema = z.object({ comando_id: uuidSchema }).strict();
export const reconhecerExecucaoTurnoSchema = z
  .object({
    epoca: epocaExecucaoTurnoSchema,
    recibo_id: uuidSchema,
  })
  .strict();
export type EstadoBarreiraExecucaoTurno = z.output<typeof estadoBarreiraExecucaoTurnoSchema>;
export type ReciboExecucaoTurno = z.output<typeof reciboExecucaoTurnoSchema>;
