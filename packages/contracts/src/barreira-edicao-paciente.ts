import { z } from 'zod';
import { uuidSchema } from './comum.ts';

const epoca = z.number().int().positive().safe();
const reserva = z
  .object({ id: uuidSchema, estado: z.enum(['aberta', 'confirmada', 'cancelada']) })
  .strict();
const pendente = z.discriminatedUnion('resultado', [
  z
    .object({
      recibo_id: uuidSchema,
      reserva_id: uuidSchema,
      resultado: z.literal('confirmada'),
      paciente_id: uuidSchema,
      versao: z.number().int().positive().max(2147483647),
    })
    .strict(),
  z
    .object({
      recibo_id: uuidSchema,
      reserva_id: uuidSchema,
      resultado: z.literal('cancelada'),
      paciente_id: uuidSchema,
      versao: z.null(),
    })
    .strict(),
]);
export const consultaBarreiraEdicaoPacienteResultadoSchema = z
  .object({ epoca, reserva: reserva.nullable(), resultado_pendente: pendente.nullable() })
  .strict()
  .refine((x) => x.reserva === null || x.resultado_pendente === null);
export const estadoReservaEdicaoPacienteSchema = z.enum([
  'aberta',
  'confirmada',
  'cancelada',
  'negada',
  'id_reutilizado',
  'epoca_antiga',
  'bloqueada',
]);
export const estadoEncerramentoEdicaoPacienteSchema = z.enum([
  'vazia',
  'cancelada',
  'confirmada',
  'negada',
  'id_reutilizado',
  'conflito',
]);
export const estadoReconhecimentoEdicaoPacienteSchema = z.enum(['reconhecido', 'conflito']);
export const respostaBarreiraEdicaoPacienteSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(false),
      erro: z.object({ codigo: z.literal('sem_permissao') }).strict(),
      request_id: uuidSchema,
    })
    .strict(),
  z
    .object({
      ok: z.literal(true),
      dados: z.union([
        consultaBarreiraEdicaoPacienteResultadoSchema,
        z
          .object({
            estado: z.union([
              estadoReservaEdicaoPacienteSchema,
              estadoEncerramentoEdicaoPacienteSchema,
              estadoReconhecimentoEdicaoPacienteSchema,
            ]),
          })
          .strict(),
      ]),
      request_id: uuidSchema,
    })
    .strict(),
]);

export const comandoBarreiraEdicaoPacienteSchema = z.discriminatedUnion('operacao', [
  z.object({ operacao: z.literal('api.consultar_barreira_edicao_paciente') }).strict(),
  z
    .object({
      operacao: z.literal('api.reservar_edicao_paciente'),
      epoca,
      reserva_id: uuidSchema,
      paciente_id: uuidSchema,
    })
    .strict(),
  z
    .object({
      operacao: z.literal('api.encerrar_edicao_paciente'),
      epoca,
      reserva_id: uuidSchema.nullable(),
      comando_id: uuidSchema,
    })
    .strict(),
  z
    .object({
      operacao: z.literal('api.reconhecer_barreira_edicao_paciente'),
      comando_id: uuidSchema,
    })
    .strict(),
]);
