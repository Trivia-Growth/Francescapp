import { z } from 'zod';
import { campoCifradoSchema, uuidSchema } from './comum.ts';

/** FR-037 / DF-024 (19/11/2026): durante o período declarado a substituta é a case manager
 * atual DAQUELE caso, inclusive para agir. Nunca alcança a carteira nem outro caso, e não
 * concede acesso ao conteúdo. Fora do período o titular volta sozinho.
 *
 * Este arquivo descreve só o transporte: a autorização vive no servidor e no banco
 * (`cadastro.case_manager_atual` e `api.substituicao_case_manager_privado`). */
const instanteSchema = z.string().datetime({ offset: true });

/** FR-037 exige motivo em TODA alteração de acesso, e tanto registrar quanto encerrar
 * antes da hora são alterações de acesso. Por isso o motivo é OBRIGATÓRIO nas duas, e não
 * opcional: um registro sem motivo não cumpriria o requisito, e um encerramento sem motivo
 * deixaria sem explicação exatamente a alteração que devolve a alçada ao titular. */
const motivoSchema = z.string().trim().min(1).max(500);

export const substituicaoCaseManagerSchema = z
  .object({
    id: uuidSchema,
    versao: z.number().int().min(1).max(2_147_483_647),
    substituto_usuario_id: uuidSchema,
    responsavel_usuario_id: uuidSchema,
    inicio: instanteSchema,
    fim: instanteSchema,
    encerrada_em: instanteSchema.nullable(),
    /** Já decifrado pelo servidor; o navegador nunca vê envelope nem AAD. */
    motivo: z.string().min(1).max(500),
    /** Só existe depois do encerramento antecipado; nulo enquanto a substituição corre. */
    motivo_encerramento: z.string().min(1).max(500).nullable(),
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
    motivo: motivoSchema,
  })
  .strict()
  .superRefine((valor, ctx) => {
    if (Date.parse(valor.fim) <= Date.parse(valor.inicio))
      ctx.addIssue({ code: 'custom', message: 'O fim precisa ser posterior ao início.' });
  });

export const encerrarSubstituicaoSchema = z
  .object({ substituicao_id: uuidSchema, motivo: motivoSchema })
  .strict();

export type SubstituicaoCaseManager = z.output<typeof substituicaoCaseManagerSchema>;
export type PainelSubstituicao = z.output<typeof painelSubstituicaoSchema>;
export type RegistrarSubstituicao = z.output<typeof registrarSubstituicaoSchema>;
export type EncerrarSubstituicao = z.output<typeof encerrarSubstituicaoSchema>;

/** O que o BANCO devolve: os motivos ainda em envelope. Só o servidor decifra, e o painel
 * público (`painelSubstituicaoSchema`) é montado a partir daqui. Separar as duas formas
 * impede que um envelope chegue ao navegador por descuido. */
export const substituicaoCaseManagerPrivadaSchema = substituicaoCaseManagerSchema
  .omit({ motivo: true, motivo_encerramento: true })
  .extend({
    motivo_cifrado: campoCifradoSchema,
    motivo_encerramento_cifrado: campoCifradoSchema.nullable(),
  })
  .strict();

export const painelSubstituicaoPrivadoSchema = painelSubstituicaoSchema
  .omit({ substituicoes: true })
  .extend({ substituicoes: z.array(substituicaoCaseManagerPrivadaSchema).max(50) })
  .strict();

export type SubstituicaoCaseManagerPrivada = z.output<typeof substituicaoCaseManagerPrivadaSchema>;
export type PainelSubstituicaoPrivado = z.output<typeof painelSubstituicaoPrivadoSchema>;

/** Resposta privada do banco. `responsavel_invalido` cobre titular ausente, substituta
 * igual ao titular, pessoa sem concessão vigente e período inválido ou já vencido: o
 * erro público não diz qual das condições faltou. */
export const respostaSubstituicaoPrivadaSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      dados: painelSubstituicaoPrivadoSchema,
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
