import { z } from 'zod';
import { uuidSchema } from './comum.ts';
import { campoCifradoSchema } from './rpc.ts';

const dataSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((valor) => new Date(`${valor}T00:00:00Z`).toISOString().slice(0, 10) === valor);

/** FR-019: a orientação superada continua identificada como anterior, nunca como atual. */
export const situacaoOrientacaoSchema = z.enum(['vigente', 'superada']);
export type SituacaoOrientacao = z.output<typeof situacaoOrientacaoSchema>;

/** Conteúdo clínico: viaja cifrado, o banco nunca vê em claro. O autor declarado é quem
 * assinou a orientação, que pode não ser quem a registrou no sistema. */
export const conteudoOrientacaoSchema = z
  .object({
    texto: z.string().trim().min(1).max(5000),
    autor: z.string().trim().min(1).max(200),
    data: dataSchema,
    destinatarios: z.string().trim().min(1).max(200),
    validade: dataSchema.nullable(),
  })
  .strict();
export type ConteudoOrientacao = z.output<typeof conteudoOrientacaoSchema>;

const versaoSchema = z.number().int().min(0).max(2_147_483_647);

/** Projeção para a interface: situação em claro, demais campos decifrados no servidor. */
export const orientacaoSchema = conteudoOrientacaoSchema
  .extend({
    orientacao_id: uuidSchema,
    versao: versaoSchema.min(1),
    situacao: situacaoOrientacaoSchema,
    registrado_em: z.iso.datetime({ offset: true }),
  })
  .strict();
export type Orientacao = z.output<typeof orientacaoSchema>;

/** `orientacao_id` ausente cria uma nova, que nasce vigente; presente exige a versão atual. */
export const salvarOrientacaoSchema = conteudoOrientacaoSchema
  .extend({
    orientacao_id: uuidSchema.optional(),
    versao_esperada: versaoSchema.max(2_147_483_646),
    situacao: situacaoOrientacaoSchema,
  })
  .strict()
  .refine(
    (valor) => (valor.versao_esperada === 0) === (valor.orientacao_id === undefined),
    'Versão esperada e identificador devem concordar sobre criação ou revisão.',
  )
  .refine(
    (valor) => valor.versao_esperada > 0 || valor.situacao === 'vigente',
    'Uma orientação nova nasce vigente; superada é sempre revisão.',
  );
export type SalvarOrientacao = z.output<typeof salvarOrientacaoSchema>;

/** Filtro resolvido no banco: mostrar só o que ainda vale (FR-019). */
export const consultarOrientacoesSchema = z
  .object({ apenas_vigentes: z.boolean().optional() })
  .strict();

const registroSchema = z
  .object({
    registro_id: uuidSchema,
    orientacao_id: uuidSchema,
    paciente_id: uuidSchema,
    versao: versaoSchema.min(1),
    situacao: situacaoOrientacaoSchema,
    conteudo: campoCifradoSchema,
    criado_em: z.iso.datetime({ offset: true }),
  })
  .strict();

/** Resposta privada do banco; não constitui rota HTTP pública. */
export const respostaOrientacaoPrivadaSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      dados: z.union([registroSchema, z.array(registroSchema)]),
      request_id: uuidSchema,
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      erro: z.object({ codigo: z.enum(['sem_permissao', 'conflito']) }).strict(),
      request_id: uuidSchema,
    })
    .strict(),
]);
