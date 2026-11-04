import { z } from 'zod';
import { uuidSchema } from './comum.ts';
import { conteudoPlanoSchema, objetivoSchema, motivoPlanoSchema } from './plano-cuidado.ts';
import {
  consultaBarreiraPlanoResultadoSchema,
  estadoReservaPlanoSchema,
  estadoEncerramentoPlanoSchema,
  estadoReconhecimentoPlanoSchema,
} from './barreira-plano.ts';

const epoca = z.number().int().positive().safe();
const registro = conteudoPlanoSchema
  .extend({ objetivo_id: uuidSchema, versao: z.number().int().positive().max(2147483647) })
  .strict();
const vazio = z.object({}).strict();
/** Contrato preparado, sem registrar rota pública. */
export const planoHttp = {
  consultar: {
    metodo: 'GET',
    caminho: '/api/pacientes/:paciente_id/plano',
    entrada: vazio,
    saida: z.array(registro),
  },
  historico: {
    metodo: 'GET',
    caminho: '/api/pacientes/:paciente_id/plano/:objetivo_id/historico',
    entrada: vazio,
    saida: z.array(registro),
  },
  criar: {
    metodo: 'POST',
    caminho: '/api/pacientes/:paciente_id/plano',
    entrada: z
      .object({
        objetivo_id: uuidSchema,
        objetivo: objetivoSchema,
        reserva_id: uuidSchema,
        geracao_reserva: epoca,
      })
      .strict(),
    saida: registro,
  },
  revisar: {
    metodo: 'PATCH',
    caminho: '/api/pacientes/:paciente_id/plano/:objetivo_id',
    entrada: z
      .object({
        versao_esperada: z.number().int().positive().max(2147483646),
        objetivo: objetivoSchema,
        motivo: motivoPlanoSchema,
      })
      .strict(),
    saida: registro,
  },
  consultarReserva: {
    metodo: 'POST',
    caminho: '/api/plano/reserva/consultar',
    entrada: vazio,
    saida: consultaBarreiraPlanoResultadoSchema,
  },
  reservar: {
    metodo: 'POST',
    caminho: '/api/plano/reserva',
    entrada: z.object({ epoca, reserva_id: uuidSchema, paciente_id: uuidSchema }).strict(),
    saida: z.object({ estado: estadoReservaPlanoSchema }).strict(),
  },
  encerrar: {
    metodo: 'POST',
    caminho: '/api/plano/reserva/encerrar',
    entrada: z
      .object({ epoca, reserva_id: uuidSchema.nullable(), comando_id: uuidSchema })
      .strict(),
    saida: z.object({ estado: estadoEncerramentoPlanoSchema }).strict(),
  },
  reconhecer: {
    metodo: 'POST',
    caminho: '/api/plano/reserva/reconhecer',
    entrada: z.object({ comando_id: uuidSchema }).strict(),
    saida: z.object({ estado: estadoReconhecimentoPlanoSchema }).strict(),
  },
} as const;
