import { z } from 'zod';
import { uuidSchema } from './comum.ts';
import {
  estadoEncerramentoCadastroSchema,
  estadoReconhecimentoCadastroSchema,
  estadoReservaCadastroSchema,
} from './barreira-cadastro.ts';

const epoca = z.number().int().positive().safe();
export const consultaBarreiraAcessoSchema = z
  .object({
    epoca,
    reserva: z
      .object({ id: uuidSchema, estado: z.enum(['aberta', 'confirmada', 'cancelada']) })
      .strict()
      .nullable(),
    resultado_pendente: z
      .union([
        z
          .object({
            recibo_id: uuidSchema,
            reserva_id: uuidSchema,
            acao: z.literal('conceder'),
            resultado: z.literal('confirmada'),
            paciente_id: uuidSchema,
            acesso_id: uuidSchema,
            versao_esperada: z.null(),
          })
          .strict(),
        z
          .object({
            recibo_id: uuidSchema,
            reserva_id: uuidSchema,
            acao: z.literal('conceder'),
            resultado: z.literal('cancelada'),
            paciente_id: uuidSchema,
            acesso_id: z.null(),
            versao_esperada: z.null(),
          })
          .strict(),
        z
          .object({
            recibo_id: uuidSchema,
            reserva_id: uuidSchema,
            acao: z.literal('revogar'),
            resultado: z.enum(['confirmada', 'cancelada']),
            paciente_id: uuidSchema,
            acesso_id: uuidSchema,
            versao_esperada: z.number().int().positive().safe(),
          })
          .strict(),
      ])
      .nullable(),
  })
  .strict()
  .refine(({ reserva, resultado_pendente }) => reserva === null || resultado_pendente === null);
export const reservaConcessaoAcessoSchema = z
  .object({ acao: z.literal('conceder'), epoca, reserva_id: uuidSchema, paciente_id: uuidSchema })
  .strict();
export const reservaRevogacaoAcessoSchema = z
  .object({
    acao: z.literal('revogar'),
    epoca,
    reserva_id: uuidSchema,
    paciente_id: uuidSchema,
    acesso_id: uuidSchema,
    versao_esperada: z.number().int().positive().safe(),
  })
  .strict();
export const reservarAcessoSchema = z.discriminatedUnion('acao', [
  reservaConcessaoAcessoSchema,
  reservaRevogacaoAcessoSchema,
]);
export const encerrarAcessoSchema = z
  .object({ epoca, reserva_id: uuidSchema.nullable(), comando_id: uuidSchema })
  .strict();
export const reconhecerAcessoSchema = z.object({ comando_id: uuidSchema }).strict();
export {
  estadoReservaCadastroSchema,
  estadoEncerramentoCadastroSchema,
  estadoReconhecimentoCadastroSchema,
};
