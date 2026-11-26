import { z } from 'zod';
import { linhaTempoSchema } from './linha-tempo.ts';

const vazio = z.object({}).strict();

/** Contrato HTTP isolado da linha do tempo do caso (FR-007). Só leitura: a linha do tempo
 * não grava nada, ela deriva das fatias a cada consulta. Os filtros viajam na query porque
 * a rota é GET e cacheável por nada — `Cache-Control: private, no-store` continua valendo. */
export const linhaTempoHttp = {
  consultar: {
    metodo: 'GET',
    caminho: '/api/pacientes/:paciente_id/linha-tempo',
    entrada: vazio,
    saida: linhaTempoSchema,
  },
} as const;
