import { z } from 'zod';
import { uuidSchema } from './comum.ts';
import { campoCifradoSchema } from './rpc.ts';

const texto = z.string().trim().min(1).max(2000);

/** Etapas confirmadas em FR-018; não presumir transições além das previstas. */
export const etapaEncaminhamentoSchema = z.enum([
  'sugerido',
  'agendado',
  'realizado',
  'retorno_pendente',
  'concluido',
]);
export type EtapaEncaminhamento = z.output<typeof etapaEncaminhamentoSchema>;

/** Conteúdo clínico: viaja cifrado, o banco nunca vê em claro. */
export const conteudoEncaminhamentoSchema = z
  .object({ destino: texto, motivo: texto, responsavel: texto, observacao: texto.optional() })
  .strict();
export type ConteudoEncaminhamento = z.output<typeof conteudoEncaminhamentoSchema>;

const versaoSchema = z.number().int().min(0).max(2_147_483_647);

/** Projeção para a interface: etapa em claro, demais campos decifrados no servidor. */
export const encaminhamentoSchema = conteudoEncaminhamentoSchema
  .extend({
    encaminhamento_id: uuidSchema,
    versao: versaoSchema.min(1),
    etapa: etapaEncaminhamentoSchema,
  })
  .strict();
export type Encaminhamento = z.output<typeof encaminhamentoSchema>;

/** `encaminhamento_id` ausente cria um novo; presente exige a versão vigente. */
export const salvarEncaminhamentoSchema = conteudoEncaminhamentoSchema
  .extend({
    encaminhamento_id: uuidSchema.optional(),
    versao_esperada: versaoSchema.max(2_147_483_646),
    etapa: etapaEncaminhamentoSchema,
  })
  .strict()
  .refine(
    (valor) => (valor.versao_esperada === 0) === (valor.encaminhamento_id === undefined),
    'Versão esperada e identificador devem concordar sobre criação ou revisão.',
  );
export type SalvarEncaminhamento = z.output<typeof salvarEncaminhamentoSchema>;

/** Filtro resolvido no banco: localizar encaminhamentos sem retorno (FR-018). */
export const consultarEncaminhamentosSchema = z
  .object({ apenas_sem_retorno: z.boolean().optional() })
  .strict();

const registroSchema = z
  .object({
    registro_id: uuidSchema,
    encaminhamento_id: uuidSchema,
    paciente_id: uuidSchema,
    versao: versaoSchema.min(1),
    etapa: etapaEncaminhamentoSchema,
    conteudo: campoCifradoSchema,
  })
  .strict();

/** Resposta privada do banco; não constitui rota HTTP pública. */
export const respostaEncaminhamentoPrivadaSchema = z.discriminatedUnion('ok', [
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
