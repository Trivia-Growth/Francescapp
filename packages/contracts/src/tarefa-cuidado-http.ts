import { z } from 'zod';

/** Informação vigente para montar controles. Nunca substitui autorização de escrita. */
export const disponibilidadeTarefaCuidadoSchema = z
  .object({ escrita_disponivel: z.boolean() })
  .strict();

export const disponibilidadeTarefaCuidadoHttp = {
  metodo: 'GET',
  caminho: '/api/pacientes/:paciente_id/tarefas/disponibilidade',
  saida: disponibilidadeTarefaCuidadoSchema,
} as const;
