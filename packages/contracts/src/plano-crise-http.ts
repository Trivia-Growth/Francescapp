import { z } from 'zod';
import {
  aprovarPlanoCriseSchema,
  planoCriseSchema,
  salvarPlanoCriseSchema,
} from './plano-crise.ts';

const vazio = z.object({}).strict();

/** Contrato HTTP isolado do plano de crise (FR-020); a exposição depende da flag própria
 * e das provas de autorização, como nas demais fatias.
 *
 * Aprovar é rota separada de salvar porque são decisões diferentes e com permissões
 * diferentes: qualquer colaborador do caso redige, só quem tem a marca de habilitação aprova. */
export const planoCriseHttp = {
  consultar: {
    metodo: 'GET',
    caminho: '/api/pacientes/:paciente_id/plano-crise',
    entrada: vazio,
    saida: planoCriseSchema.nullable(),
  },
  salvar: {
    metodo: 'PATCH',
    caminho: '/api/pacientes/:paciente_id/plano-crise',
    entrada: salvarPlanoCriseSchema,
    saida: planoCriseSchema,
  },
  aprovar: {
    metodo: 'POST',
    caminho: '/api/pacientes/:paciente_id/plano-crise/aprovacao',
    entrada: aprovarPlanoCriseSchema,
    saida: planoCriseSchema,
  },
} as const;
