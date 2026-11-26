import { z } from 'zod';
import { uuidSchema } from './comum.ts';

/** Fontes agregadas pela linha do tempo (FR-007). A lista é fechada e igual à do derivador
 * no banco: filtro por fonte inexistente é entrada inválida, nunca lista vazia silenciosa. */
export const fonteLinhaTempoSchema = z.enum([
  'diario',
  'documento',
  'anamnese',
  'saude',
  'contexto',
  'rede',
  'situacao',
  'objetivo',
  'tarefa',
  'encaminhamento',
  'orientacao',
  'pendencia',
]);

/** FR-007 manda distinguir acontecimento, registro e retificação. `rascunho` existe porque
 * a versão privada do autor aparece só para ele e não pode ser confundida com publicação. */
export const tipoEventoLinhaTempoSchema = z.enum([
  'registro',
  'atualizacao',
  'retificacao',
  'rascunho',
]);

export const itemLinhaTempoSchema = z
  .object({
    id: uuidSchema,
    fonte: fonteLinhaTempoSchema,
    subtipo: z.string().min(1).max(120).nullable(),
    tipo_evento: tipoEventoLinhaTempoSchema,
    /** Quando foi registrado. Existe em claro em todas as fontes. */
    registrado_em: z.string().min(1),
    /** Quando aconteceu. Em claro no documento e, desde 12/11/2026, também no diário.
     * Nulo significa que aquele registro não tem data de acontecimento informada — não que
     * ela esteja escondida. A tela diz isso em vez de apresentar a data de registro. */
    aconteceu_em: z.string().min(1).nullable(),
    autor_usuario_id: uuidSchema.nullable(),
    audiencia: z.enum(['equipe', 'equipe_e_familia']),
    versao: z.number().int().positive(),
    registro_id: uuidSchema,
    objetivo_id: uuidSchema.nullable(),
    /** Eixo de área em claro: a categoria do documento e, desde 12/11/2026, a área do
     * diário. Nulo nas fatias que não têm área. */
    area: z.string().min(1).max(120).nullable(),
    detalhe: z.record(z.string(), z.unknown()),
  })
  .strict();

export const cursorLinhaTempoSchema = z
  .object({ registrado_em: z.string().min(1), id: uuidSchema })
  .strict();

export const linhaTempoSchema = z
  .object({
    paciente_id: uuidSchema,
    papel: z.enum(['colaborador', 'familia']),
    itens: z.array(itemLinhaTempoSchema),
    proximo_cursor: cursorLinhaTempoSchema.nullable(),
  })
  .strict();

/** Filtros aceitos pela consulta. Todos opcionais; período recorta pela data de registro,
 * que é a única comparável no banco em todas as fontes. */
export const consultarLinhaTempoSchema = z
  .object({
    de: z.string().min(1).optional(),
    ate: z.string().min(1).optional(),
    fontes: z.array(fonteLinhaTempoSchema).min(1).max(12).optional(),
    autor_usuario_id: uuidSchema.optional(),
    /** Vocabulário configurado pela equipe, não lista fechada: rótulo inexistente devolve
     * lista vazia, rótulo malformado é entrada inválida. */
    areas: z.array(z.string().min(1).max(120)).min(1).max(20).optional(),
    objetivo_id: uuidSchema.optional(),
    cursor_em: z.string().min(1).optional(),
    cursor_id: uuidSchema.optional(),
    limite: z.number().int().min(1).max(200).optional(),
  })
  .strict();

export const respostaLinhaTempoPrivadaSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), dados: linhaTempoSchema, request_id: uuidSchema }).strict(),
  z
    .object({
      ok: z.literal(false),
      erro: z.object({ codigo: z.enum(['sem_permissao', 'conflito', 'conflito_idempotencia']) }),
      request_id: uuidSchema,
    })
    .strict(),
]);

export type ItemLinhaTempo = z.infer<typeof itemLinhaTempoSchema>;
export type LinhaTempo = z.infer<typeof linhaTempoSchema>;
export type FiltrosLinhaTempo = z.infer<typeof consultarLinhaTempoSchema>;
