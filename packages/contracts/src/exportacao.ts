import { z } from 'zod';
import { uuidSchema } from './comum.ts';
import { fonteLinhaTempoSchema, tipoEventoLinhaTempoSchema } from './linha-tempo.ts';
import { campoCifradoSchema } from './rpc.ts';

/** FR-032 cobre a exportação de acompanhamento; `portabilidade_titular` atende pedido do
 * titular (FR-040) e `encerramento_uso` é o caso de FR-033, que exige entrega e conferência. */
export const finalidadeExportacaoSchema = z.enum([
  'acompanhamento',
  'portabilidade_titular',
  'encerramento_uso',
]);

/** Vocabulário fechado, e nenhum valor dele é "sem audiência": o que a pessoa não pode ver
 * não entra no manifesto e não é contado. Indisponível é o documento marcado indisponível
 * (FR-029) ou o anexo que não pôde ser recuperado. */
export const motivoIndisponibilidadeSchema = z.enum([
  'documento_indisponivel',
  'anexo_nao_recuperado',
]);

export const itemExportacaoSchema = z
  .object({
    fonte: fonteLinhaTempoSchema,
    registro_id: uuidSchema,
    versao: z.number().int().positive(),
    tipo_evento: tipoEventoLinhaTempoSchema,
    autor_usuario_id: uuidSchema.nullable(),
    registrado_em: z.string().min(1),
    aconteceu_em: z.string().min(1).nullable(),
    disponibilidade: z.enum(['incluido', 'indisponivel']),
    motivo_indisponibilidade: motivoIndisponibilidadeSchema.nullable(),
  })
  .strict();

export const entregaExportacaoSchema = z
  .object({
    ato: z.enum(['entregue', 'conferida']),
    criado_em: z.string().min(1),
    ator_usuario_id: uuidSchema,
  })
  .strict();

export const exportacaoSchema = z
  .object({
    id: uuidSchema,
    finalidade: finalidadeExportacaoSchema,
    criado_em: z.string().min(1),
    ator_usuario_id: uuidSchema,
    itens: z.array(itemExportacaoSchema),
    entregas: z.array(entregaExportacaoSchema),
  })
  .strict();

export const registroExportacoesSchema = z
  .object({ paciente_id: uuidSchema, exportacoes: z.array(exportacaoSchema) })
  .strict();

/** Destinatário e propósito são dados de terceiro: a tela envia TEXTO CLARO e quem cifra é
 * o servidor, com a chave do Vault, como nas demais fatias. O navegador não tem a chave, e
 * o banco guarda só o envelope mais a finalidade, que precisa ser pesquisável. */
export const registrarExportacaoSchema = z
  .object({
    finalidade: finalidadeExportacaoSchema,
    destinatario: z.string().min(1).max(500),
    proposito: z.string().min(1).max(2000),
    periodo_de: z.string().min(1).optional(),
    periodo_ate: z.string().min(1).optional(),
  })
  .strict();

export const confirmarEntregaSchema = z
  .object({
    exportacao_id: uuidSchema,
    ato: z.enum(['entregue', 'conferida']),
    observacao: z.string().min(1).max(2000).optional(),
  })
  .strict();

/** Envelope como ele chega ao banco; usado só na fronteira interna. */
export const envelopeExportacaoSchema = campoCifradoSchema;

export const respostaExportacaoPrivadaSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      dados: registroExportacoesSchema,
      request_id: uuidSchema,
      repeticao: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      erro: z.object({ codigo: z.enum(['sem_permissao', 'conflito', 'conflito_idempotencia']) }),
      request_id: uuidSchema,
    })
    .strict(),
]);

export type Exportacao = z.infer<typeof exportacaoSchema>;
export type ItemExportacao = z.infer<typeof itemExportacaoSchema>;
export type RegistrarExportacao = z.infer<typeof registrarExportacaoSchema>;

export type RegistroExportacoes = z.infer<typeof registroExportacoesSchema>;
export type ConfirmarEntrega = z.infer<typeof confirmarEntregaSchema>;
