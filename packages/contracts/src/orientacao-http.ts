import { z } from 'zod';
import {
  consultarOrientacoesSchema,
  orientacaoSchema,
  salvarOrientacaoSchema,
} from './orientacao.ts';

/** Contrato HTTP isolado da fatia de orientações (FR-019); a exposição depende da
 * flag própria e das provas de autorização, como nas demais fatias. */
export const orientacaoHttp = {
  consultar: {
    metodo: 'GET',
    caminho: '/api/pacientes/:paciente_id/orientacoes',
    entrada: consultarOrientacoesSchema,
    saida: z.array(orientacaoSchema),
  },
  salvar: {
    metodo: 'POST',
    caminho: '/api/pacientes/:paciente_id/orientacoes',
    entrada: salvarOrientacaoSchema,
    saida: orientacaoSchema,
  },
} as const;
