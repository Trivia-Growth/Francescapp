import { z } from 'zod';
import { sucessoRespostaSchema, uuidSchema } from './comum.ts';
import { turnoSchema } from './turno.ts';

/** Consulta própria aberta; não é lista, histórico ou autorização de equipe. */
export const consultaTurnoAtualHttp = {
  metodo: 'GET',
  caminho: '/api/pacientes/:paciente_id/turnos/atual',
  parametros: z.object({ paciente_id: uuidSchema }).strict(),
  entrada: z.object({}).strict(),
  saida: sucessoRespostaSchema(turnoSchema.nullable()),
} as const;

/** Último turno próprio do caso; recupera recebimento após encerramento/recarga. */
export const consultaTurnoUltimoHttp = {
  ...consultaTurnoAtualHttp,
  caminho: '/api/pacientes/:paciente_id/turnos/ultimo',
} as const;
