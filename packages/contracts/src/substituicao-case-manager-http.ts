import { z } from 'zod';
import {
  encerrarSubstituicaoSchema,
  painelSubstituicaoSchema,
  registrarSubstituicaoSchema,
} from './substituicao-case-manager.ts';

const vazio = z.object({}).strict();

/** Contrato HTTP isolado da substituição temporária (FR-037); a exposição depende da flag
 * própria e das provas de autorização, como nas demais fatias. Encerrar é rota separada de
 * registrar porque são decisões distintas e o encerramento nomeia um registro existente. */
export const substituicaoCaseManagerHttp = {
  consultar: {
    metodo: 'GET',
    caminho: '/api/pacientes/:paciente_id/substituicao-case-manager',
    entrada: vazio,
    saida: painelSubstituicaoSchema,
  },
  registrar: {
    metodo: 'POST',
    caminho: '/api/pacientes/:paciente_id/substituicao-case-manager',
    entrada: registrarSubstituicaoSchema,
    saida: painelSubstituicaoSchema,
  },
  encerrar: {
    metodo: 'POST',
    caminho: '/api/pacientes/:paciente_id/substituicao-case-manager/encerramento',
    entrada: encerrarSubstituicaoSchema,
    saida: painelSubstituicaoSchema,
  },
} as const;
