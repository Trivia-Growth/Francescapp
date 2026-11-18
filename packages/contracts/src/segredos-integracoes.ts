import { z } from 'zod';
import { uuidSchema } from './comum.ts';

export const chaveSegredoSchema = z.enum([
  'ffcmapp.integracao.google_drive',
  'ffcmapp.integracao.openrouter',
  'ffcmapp.integracao.google_calendar_client_id',
  'ffcmapp.integracao.google_calendar_client_secret',
]);
export const valorSegredoSchema = z
  .string()
  .min(1)
  .max(48_000)
  .refine((v) => v.trim().length > 0);
export type ValorSegredo = z.output<typeof valorSegredoSchema>;
export const segredosIntegracoesSchema = z
  .object({
    chave: chaveSegredoSchema,
    cadastrado: z.boolean(),
    versao: z.number().int().min(0).max(2147483647),
    atualizado_por_usuario_id: uuidSchema.nullable(),
    atualizado_em: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
export type SegredosIntegracoes = z.output<typeof segredosIntegracoesSchema>;
export const gravarSegredosIntegracoesSchema = z
  .object({
    segredo_chave: chaveSegredoSchema,
    valor: valorSegredoSchema,
    versao_esperada: z.number().int().min(0).max(2147483646),
  })
  .strict();
export const estadoExpurgoAudioSchema = z
  .object({
    ativo: z.boolean(),
    ultima_execucao: z
      .object({
        executado_em: z.iso.datetime({ offset: true }),
        falhas: z.number().int().nonnegative(),
        apagados: z.number().int().nonnegative(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type EstadoExpurgoAudio = z.output<typeof estadoExpurgoAudioSchema>;
export const respostaSegredosIntegracoesPrivadaSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      dados: z.union([
        segredosIntegracoesSchema,
        z.array(segredosIntegracoesSchema),
        estadoExpurgoAudioSchema,
      ]),
      request_id: uuidSchema,
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      erro: z
        .object({ codigo: z.enum(['sem_permissao', 'conflito', 'conflito_idempotencia']) })
        .strict(),
      request_id: uuidSchema,
    })
    .strict(),
]);
export const contratosSegredos = {
  consultarExpurgoAudio: {
    metodo: 'GET',
    caminho: '/api/admin/segredos-integracoes?operacao=expurgo',
    entrada: z.object({}).strict(),
    saida: estadoExpurgoAudioSchema,
  },
  listarSegredosIntegracoes: {
    metodo: 'GET',
    caminho: '/api/admin/segredos-integracoes',
    entrada: z.object({}).strict(),
    saida: z.array(segredosIntegracoesSchema),
  },
  gravarSegredosIntegracoes: {
    metodo: 'POST',
    caminho: '/api/admin/segredos-integracoes',
    entrada: gravarSegredosIntegracoesSchema,
    saida: segredosIntegracoesSchema,
  },
} as const;
