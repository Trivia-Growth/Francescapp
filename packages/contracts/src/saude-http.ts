import { z } from 'zod';
import { salvarSaudeSchema, saudeSchema } from './saude.ts';

const vazio = z.object({}).strict();

/** Contrato HTTP isolado da fatia de saúde (FR-004); a exposição depende da
 * flag própria e das provas de autorização, como nas demais fatias. */
export const saudeHttp = {
  consultar: {
    metodo: 'GET',
    caminho: '/api/pacientes/:paciente_id/saude',
    entrada: vazio,
    saida: saudeSchema.nullable(),
  },
  salvar: {
    metodo: 'PATCH',
    caminho: '/api/pacientes/:paciente_id/saude',
    entrada: salvarSaudeSchema,
    saida: saudeSchema,
  },
} as const;
