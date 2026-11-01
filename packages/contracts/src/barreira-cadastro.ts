import { z } from 'zod';

import { uuidSchema } from './comum.ts';
import { atestadoOperacaoSchema, resultadoAtestacaoSchema } from './rpc.ts';

const epocaSchema = z.number().int().positive().safe();
const contexto = { request_id: uuidSchema, atestado: atestadoOperacaoSchema };

/** Contrato interno estrutural: não autentica, autoriza nem verifica assinatura. */
export const entradaBarreiraCadastroSchema = z.discriminatedUnion('operacao', [
  z
    .object({
      ...contexto,
      operacao: z.literal('api.reservar_cadastro'),
      epoca: epocaSchema,
      reserva_id: uuidSchema,
    })
    .strict(),
  z
    .object({
      ...contexto,
      operacao: z.literal('api.encerrar_cadastro'),
      epoca: epocaSchema,
      reserva_id: uuidSchema.nullable(),
      comando_id: uuidSchema,
    })
    .strict(),
  z.object({ ...contexto, operacao: z.literal('api.consultar_barreira_cadastro') }).strict(),
  z
    .object({
      ...contexto,
      operacao: z.literal('api.reconhecer_barreira_cadastro'),
      comando_id: uuidSchema,
    })
    .strict(),
]);

export const transporteBarreiraCadastroSchema = z
  .object({
    p_transporte: z
      .object({
        entrada: entradaBarreiraCadastroSchema,
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
    })
    .strict(),
  z
    .object({
      recibo_id: uuidSchema,
      reserva_id: uuidSchema,
      resultado: z.literal('cancelada'),
      paciente_id: z.null(),
    })
    .strict(),
]);

export const consultaBarreiraCadastroResultadoSchema = z
  .object({
    epoca: epocaSchema,
    reserva: reservaSchema.nullable(),
    resultado_pendente: resultadoPendenteSchema.nullable(),
  })
  .strict()
  .refine(({ reserva, resultado_pendente }) => reserva === null || resultado_pendente === null);

export const estadoReservaCadastroSchema = z.enum([
  'aberta',
  'confirmada',
  'cancelada',
  'negada',
  'id_reutilizado',
  'epoca_antiga',
  'bloqueada',
]);
export const estadoEncerramentoCadastroSchema = z.enum([
  'vazia',
  'cancelada',
  'confirmada',
  'negada',
  'id_reutilizado',
  'conflito',
]);
export const estadoReconhecimentoCadastroSchema = z.enum(['reconhecido', 'conflito']);

/** Resposta interna da composição, sem interpretação de falhas de transporte. */
export const respostaBarreiraCadastroSchema = z.discriminatedUnion('ok', [
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
        consultaBarreiraCadastroResultadoSchema,
        z
          .object({
            estado: z.union([
              estadoReservaCadastroSchema,
              estadoEncerramentoCadastroSchema,
              estadoReconhecimentoCadastroSchema,
            ]),
          })
          .strict(),
      ]),
      request_id: uuidSchema,
    })
    .strict(),
]);

export type EntradaBarreiraCadastro = z.infer<typeof entradaBarreiraCadastroSchema>;
export type RespostaBarreiraCadastro = z.infer<typeof respostaBarreiraCadastroSchema>;
