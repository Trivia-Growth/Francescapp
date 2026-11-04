import { z } from 'zod';
import { uuidSchema } from './comum.ts';
import { atualizarPacienteSchema, pacienteAdministrativoSchema } from './cadastro.ts';
import {
  consultaBarreiraEdicaoPacienteResultadoSchema,
  estadoReservaEdicaoPacienteSchema,
  estadoEncerramentoEdicaoPacienteSchema,
  estadoReconhecimentoEdicaoPacienteSchema,
} from './barreira-edicao-paciente.ts';

const epoca = z.number().int().positive().safe();
const vazio = z.object({}).strict();
/** Contrato preparado para composição futura; não registra rotas. */
export const edicaoPacienteHttp = {
  consultarPaciente: {
    metodo: 'GET',
    caminho: '/api/pacientes/:paciente_id',
    entrada: vazio,
    saida: pacienteAdministrativoSchema,
  },
  editar: {
    metodo: 'PATCH',
    caminho: '/api/pacientes/:paciente_id',
    entrada: z
      .object({ entrada: atualizarPacienteSchema, reserva_id: uuidSchema, geracao_reserva: epoca })
      .strict(),
    saida: z
      .object({ paciente_id: uuidSchema, versao: z.number().int().positive().max(2147483647) })
      .strict(),
  },
  consultarReserva: {
    metodo: 'POST',
    caminho: '/api/pacientes/edicao/reserva/consultar',
    entrada: vazio,
    saida: consultaBarreiraEdicaoPacienteResultadoSchema,
  },
  reservar: {
    metodo: 'POST',
    caminho: '/api/pacientes/edicao/reserva',
    entrada: z.object({ epoca, reserva_id: uuidSchema, paciente_id: uuidSchema }).strict(),
    saida: z.object({ estado: estadoReservaEdicaoPacienteSchema }).strict(),
  },
  encerrar: {
    metodo: 'POST',
    caminho: '/api/pacientes/edicao/reserva/encerrar',
    entrada: z
      .object({ epoca, reserva_id: uuidSchema.nullable(), comando_id: uuidSchema })
      .strict(),
    saida: z.object({ estado: estadoEncerramentoEdicaoPacienteSchema }).strict(),
  },
  reconhecer: {
    metodo: 'POST',
    caminho: '/api/pacientes/edicao/reserva/reconhecer',
    entrada: z.object({ comando_id: uuidSchema }).strict(),
    saida: z.object({ estado: estadoReconhecimentoEdicaoPacienteSchema }).strict(),
  },
} as const;
