import { z } from 'zod';
import { uuidSchema } from './comum.ts';
import { atestadoOperacaoSchema, resultadoAtestacaoSchema } from './rpc.ts';

const texto = z.string().trim().min(1).max(2000);
export const converterDiarioTarefaSchema = z
  .object({
    origem_versao: z.number().int().positive().max(2147483647),
    tarefa_id: uuidSchema,
    reserva_id: uuidSchema,
    geracao_reserva: z.number().int().positive().safe(),
    motivo: texto,
    data_atencao: z.iso.date(),
    encaminhamento: texto,
    responsavel: texto,
    prazo: z.iso.date(),
    prioridade: z.enum(['baixa', 'media', 'alta']),
    area: z.string().trim().min(1).max(120),
  })
  .strict();
export type ConverterDiarioTarefa = z.infer<typeof converterDiarioTarefaSchema>;
export const reciboConversaoDiarioTarefaSchema = z
  .object({
    conversao_id: uuidSchema,
    paciente_id: uuidSchema,
    origem_id: uuidSchema,
    origem_versao: z.number().int().positive().max(2147483647),
    tarefa_id: uuidSchema,
    evolucao_id: uuidSchema,
    ator_usuario_id: uuidSchema,
    registrado_em: z.iso.datetime({ offset: true }),
  })
  .strict();
export type ReciboConversaoDiarioTarefa = z.infer<typeof reciboConversaoDiarioTarefaSchema>;
export const respostaConversaoDiarioTarefaPrivadaSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      repeticao: z.boolean(),
      dados: reciboConversaoDiarioTarefaSchema.nullable(),
      request_id: uuidSchema,
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      erro: z
        .object({
          codigo: z.enum([
            'sem_permissao',
            'conflito',
            'conflito_idempotencia',
            'servico_indisponivel',
          ]),
        })
        .strict(),
      request_id: uuidSchema,
    })
    .strict(),
]);
/** Transporte interno: nunca enviado ao navegador. Cada filha conserva seu próprio atestado. */
export const transporteFilhoConversaoSchema = z
  .object({
    entrada: z.record(z.string(), z.unknown()),
    entrada_canonica: resultadoAtestacaoSchema.shape.entradaCanonica,
    dados_canonicos: resultadoAtestacaoSchema.shape.dadosCanonicos,
  })
  .strict();
export const entradaConversaoDiarioTarefaSchema = z
  .object({
    request_id: uuidSchema,
    paciente_id: uuidSchema,
    origem_id: uuidSchema,
    origem_versao: z.number().int().positive().max(2147483647).optional(),
    chave_idempotencia: z.string().min(16).max(200).optional(),
    digest_idempotencia: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .optional(),
    autorizacao_tarefa: transporteFilhoConversaoSchema,
    tarefa: transporteFilhoConversaoSchema.optional(),
    diario: transporteFilhoConversaoSchema.optional(),
    atestado: atestadoOperacaoSchema,
  })
  .strict()
  .refine((v) => {
    if (v.atestado.operacao === 'api.consultar_conversao_diario_tarefa')
      return (
        v.origem_versao === undefined &&
        v.tarefa === undefined &&
        v.diario === undefined &&
        v.chave_idempotencia === undefined &&
        v.digest_idempotencia === undefined
      );
    return (
      v.atestado.operacao === 'api.converter_diario_tarefa' &&
      v.origem_versao !== undefined &&
      v.tarefa !== undefined &&
      v.diario !== undefined &&
      v.chave_idempotencia !== undefined &&
      v.digest_idempotencia !== undefined
    );
  }, 'Comando agregado incompleto.');
export const transporteConversaoDiarioTarefaSchema = z
  .object({
    p_transporte: transporteFilhoConversaoSchema
      .extend({ entrada: entradaConversaoDiarioTarefaSchema })
      .strict(),
  })
  .strict();
