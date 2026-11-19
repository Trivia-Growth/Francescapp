import { z } from 'zod';
import { uuidSchema } from './comum.ts';

/** FR-037 / DF-024 (19/11/2026): durante o período declarado a substituta é a case manager
 * atual DAQUELE caso, inclusive para agir. Nunca alcança a carteira nem outro caso, e não
 * concede acesso ao conteúdo. Fora do período o titular volta sozinho.
 *
 * Este arquivo descreve só o transporte: a autorização vive no servidor e no banco
 * (`cadastro.case_manager_atual` e `api.substituicao_case_manager_privado`). */
const instanteSchema = z.string().datetime({ offset: true });

export const substituicaoCaseManagerSchema = z
  .object({
    id: uuidSchema,
    versao: z.number().int().min(1).max(2_147_483_647),
    substituto_usuario_id: uuidSchema,
    responsavel_usuario_id: uuidSchema,
    inicio: instanteSchema,
    fim: instanteSchema,
    encerrada_em: instanteSchema.nullable(),
    registrada_por_usuario_id: uuidSchema,
    criado_em: instanteSchema,
  })
  .strict();

export const vigenciaSubstituicaoSchema = z
  .object({
    id: uuidSchema,
    substituto_usuario_id: uuidSchema,
    inicio: instanteSchema,
    fim: instanteSchema,
  })
  .strict();

/** Tudo o que a tela precisa dizer de uma vez: quem é o titular, quem substitui, até
 * quando, e o histórico do caso. `case_manager_atual_id` é a resposta da regra, não um
 * cálculo do navegador. */
export const painelSubstituicaoSchema = z
  .object({
    paciente_id: uuidSchema,
    titular_usuario_id: uuidSchema.nullable(),
    case_manager_atual_id: uuidSchema.nullable(),
    vigente: vigenciaSubstituicaoSchema.nullable(),
    substituicoes: z.array(substituicaoCaseManagerSchema).max(50),
  })
  .strict();

export const registrarSubstituicaoSchema = z
  .object({
    substituto_usuario_id: uuidSchema,
    inicio: instanteSchema,
    fim: instanteSchema,
  })
  .strict()
  .superRefine((valor, ctx) => {
    if (Date.parse(valor.fim) <= Date.parse(valor.inicio))
      ctx.addIssue({ code: 'custom', message: 'O fim precisa ser posterior ao início.' });
  });

export const encerrarSubstituicaoSchema = z.object({ substituicao_id: uuidSchema }).strict();

export type SubstituicaoCaseManager = z.output<typeof substituicaoCaseManagerSchema>;
export type PainelSubstituicao = z.output<typeof painelSubstituicaoSchema>;
export type RegistrarSubstituicao = z.output<typeof registrarSubstituicaoSchema>;
export type EncerrarSubstituicao = z.output<typeof encerrarSubstituicaoSchema>;

/** Resposta privada do banco. `responsavel_invalido` cobre titular ausente, substituta
 * igual ao titular, pessoa sem concessão vigente e período inválido ou já vencido: o
 * erro público não diz qual das condições faltou. */
export const respostaSubstituicaoPrivadaSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      dados: painelSubstituicaoSchema,
      request_id: uuidSchema,
      repeticao: z.boolean().optional(),
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
            'responsavel_invalido',
          ]),
        })
        .strict(),
      request_id: uuidSchema,
    })
    .strict(),
]);
