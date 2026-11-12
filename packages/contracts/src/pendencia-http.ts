import { z } from 'zod';
import { salvarAcordoSchema, sinalOperacionalSchema, tratarPendenciaSchema } from './pendencia.ts';

const vazio = z.object({}).strict();

/** Contrato HTTP isolado das pendências do caso (FR-027/FR-028); a exposição depende da
 * flag própria e das provas de autorização, como nas demais fatias.
 *
 * As três rotas devolvem o mesmo sinal recalculado: depois de acordar a periodicidade ou
 * de tratar uma pendência, a tela recebe o estado novo sem uma segunda consulta, e não
 * fica desenhando um estado que ela mesma inferiu. */
export const pendenciaHttp = {
  consultar: {
    metodo: 'GET',
    caminho: '/api/pacientes/:paciente_id/pendencias',
    entrada: vazio,
    saida: sinalOperacionalSchema,
  },
  acordar: {
    metodo: 'PUT',
    caminho: '/api/pacientes/:paciente_id/pendencias/acordo',
    entrada: salvarAcordoSchema,
    saida: sinalOperacionalSchema,
  },
  tratar: {
    metodo: 'POST',
    caminho: '/api/pacientes/:paciente_id/pendencias/tratativa',
    entrada: tratarPendenciaSchema,
    saida: sinalOperacionalSchema,
  },
} as const;
