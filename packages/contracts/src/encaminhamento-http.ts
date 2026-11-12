import { z } from 'zod';
import {
  consultarEncaminhamentosSchema,
  encaminhamentoSchema,
  salvarEncaminhamentoSchema,
} from './encaminhamento.ts';

/** Contrato HTTP isolado da fatia de encaminhamentos (FR-018); a exposição depende da
 * flag própria e das provas de autorização, como nas demais fatias. */
export const encaminhamentoHttp = {
  consultar: {
    metodo: 'GET',
    caminho: '/api/pacientes/:paciente_id/encaminhamentos',
    entrada: consultarEncaminhamentosSchema,
    saida: z.array(encaminhamentoSchema),
  },
  salvar: {
    metodo: 'POST',
    caminho: '/api/pacientes/:paciente_id/encaminhamentos',
    entrada: salvarEncaminhamentoSchema,
    saida: encaminhamentoSchema,
  },
} as const;
