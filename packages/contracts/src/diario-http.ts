import { z } from 'zod';
import {
  consultarDiarioSchema,
  registroDiarioSchema,
  salvarRegistroDiarioSchema,
} from './diario.ts';

/** Contrato HTTP isolado da fatia de diário (FR-008, FR-009, FR-012, FR-013, FR-014). A
 * exposição depende da chave `ffcm.diario.ativo` e das provas de autorização no banco. */
export const diarioHttp = {
  consultar: {
    metodo: 'GET',
    caminho: '/api/pacientes/:paciente_id/diario',
    entrada: consultarDiarioSchema,
    saida: z.array(registroDiarioSchema),
  },
  salvar: {
    metodo: 'POST',
    caminho: '/api/pacientes/:paciente_id/diario',
    entrada: salvarRegistroDiarioSchema,
    saida: registroDiarioSchema,
  },
} as const;
