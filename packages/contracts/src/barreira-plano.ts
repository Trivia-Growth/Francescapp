import { z } from 'zod';

import { uuidSchema } from './comum.ts';
import { atestadoOperacaoSchema, resultadoAtestacaoSchema } from './rpc.ts';

const epocaSchema = z.number().int().positive().safe();
const contexto = { request_id: uuidSchema, atestado: atestadoOperacaoSchema };

/** Contrato interno estrutural: não autentica, autoriza nem verifica assinatura. */
export const entradaBarreiraPlanoSchema = z
  .discriminatedUnion('operacao', [
    z
      .object({
        ...contexto,
        operacao: z.literal('api.reservar_plano'),
        epoca: epocaSchema,
        reserva_id: uuidSchema,
        paciente_id: uuidSchema,
      })
      .strict(),
    z
      .object({
        ...contexto,
        operacao: z.literal('api.encerrar_plano'),
        epoca: epocaSchema,
        reserva_id: uuidSchema.nullable(),
        comando_id: uuidSchema,
      })
      .strict(),
    z.object({ ...contexto, operacao: z.literal('api.consultar_barreira_plano') }).strict(),
    z
      .object({
        ...contexto,
        operacao: z.literal('api.reconhecer_barreira_plano'),
        comando_id: uuidSchema,
      })
      .strict(),
  ])
  .refine(
    (entrada) =>
      entrada.atestado.operacao === entrada.operacao &&
      entrada.atestado.request_id === entrada.request_id,
  );

export const transporteBarreiraPlanoSchema = z
  .object({
    p_transporte: z
      .object({
        entrada: entradaBarreiraPlanoSchema,
        entrada_canonica: resultadoAtestacaoSchema.shape.entradaCanonica,
        dados_canonicos: resultadoAtestacaoSchema.shape.dadosCanonicos,
      })
      .strict(),
  })
  .strict();

const reservaSchema = z
  .object({ id: uuidSchema, estado: z.enum(['aberta', 'confirmada', 'cancelada']) })
  .strict();
const resultadoPendenteSchema = z.discriminatedUnion('resultado', [
  z
    .object({
      recibo_id: uuidSchema,
      reserva_id: uuidSchema,
      resultado: z.literal('confirmada'),
      paciente_id: uuidSchema,
      objetivo_id: uuidSchema,
    })
    .strict(),
  z
    .object({
      recibo_id: uuidSchema,
      reserva_id: uuidSchema,
      resultado: z.literal('cancelada'),
      paciente_id: uuidSchema,
      objetivo_id: z.null(),
    })
    .strict(),
]);

export const consultaBarreiraPlanoResultadoSchema = z
  .object({
    epoca: epocaSchema,
    reserva: reservaSchema.nullable(),
    resultado_pendente: resultadoPendenteSchema.nullable(),
  })
  .strict()
  .refine(({ reserva, resultado_pendente }) => reserva === null || resultado_pendente === null);

export const estadoReservaPlanoSchema = z.enum([
  'aberta',
  'confirmada',
  'cancelada',
  'negada',
  'id_reutilizado',
  'epoca_antiga',
  'bloqueada',
]);
export const estadoEncerramentoPlanoSchema = z.enum([
  'vazia',
  'cancelada',
  'confirmada',
  'negada',
  'id_reutilizado',
  'conflito',
]);
export const estadoReconhecimentoPlanoSchema = z.enum(['reconhecido', 'conflito']);

/** Resposta interna da composição, sem interpretação de falhas de transporte. */
export const respostaBarreiraPlanoSchema = z.discriminatedUnion('ok', [
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
        consultaBarreiraPlanoResultadoSchema,
        z
          .object({
            estado: z.union([
              estadoReservaPlanoSchema,
              estadoEncerramentoPlanoSchema,
              estadoReconhecimentoPlanoSchema,
            ]),
          })
          .strict(),
      ]),
      request_id: uuidSchema,
    })
    .strict(),
]);

export type EntradaBarreiraPlano = z.infer<typeof entradaBarreiraPlanoSchema>;
export type RespostaBarreiraPlano = z.infer<typeof respostaBarreiraPlanoSchema>;
