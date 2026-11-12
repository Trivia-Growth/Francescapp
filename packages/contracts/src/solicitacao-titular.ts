import { z } from 'zod';
import { campoCifradoSchema } from './rpc.ts';
import { paginaSchema, uuidSchema } from './comum.ts';

/** FR-040: solicitações de acesso, correção, portabilidade ou exclusão feitas pelo titular.
 *
 * É um livro de registro e acompanhamento, não um motor de eliminação. O próprio requisito diz
 * que "revogar consentimento não significa apagar automaticamente todos os registros": responder
 * uma solicitação de exclusão grava medida e fundamento, e não apaga dado de paciente.
 * Ver `supabase/migrations/20261119340000_solicitacao_titular.sql`. */
export const tipoSolicitacaoTitularSchema = z.enum([
  'acesso',
  'correcao',
  'portabilidade',
  'exclusao',
]);
export type TipoSolicitacaoTitular = z.output<typeof tipoSolicitacaoTitularSchema>;

/** "A resposta deve indicar medida adotada ou razão de guarda/restrição aplicável." A medida é
 * legível (a tela lista e filtra por ela); o fundamento vai cifrado. */
export const medidaSolicitacaoTitularSchema = z.enum([
  'atendida',
  'atendida_parcialmente',
  'recusada',
]);
export type MedidaSolicitacaoTitular = z.output<typeof medidaSolicitacaoTitularSchema>;

/** Resumo de uma solicitação. NÃO inclui a descrição nem a resposta: os dois são texto livre
 * sobre pessoa identificada e só saem cifrados, na leitura de uma solicitação específica. */
export const solicitacaoTitularSchema = z
  .object({
    solicitacao_id: uuidSchema,
    paciente_id: uuidSchema,
    tipo: tipoSolicitacaoTitularSchema,
    recebida_em: z.iso.datetime({ offset: true }),
    estado: z.enum(['recebida', 'respondida']),
    medida: medidaSolicitacaoTitularSchema.nullable(),
    versao: z.number().int().min(1).max(2147483647),
    registrada_por_usuario_id: uuidSchema,
    respondida_por_usuario_id: uuidSchema.nullable(),
    respondida_em: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict()
  .refine(
    (s) =>
      (s.estado === 'respondida') ===
      (s.medida !== null && s.respondida_por_usuario_id !== null && s.respondida_em !== null),
    'Solicitação respondida precisa de medida, autor e data da resposta.',
  );
export type SolicitacaoTitular = z.output<typeof solicitacaoTitularSchema>;

export const paginaSolicitacaoTitularSchema = paginaSchema(solicitacaoTitularSchema);
export type PaginaSolicitacaoTitular = z.output<typeof paginaSolicitacaoTitularSchema>;

export const registrarSolicitacaoTitularSchema = z
  .object({
    paciente_id: uuidSchema,
    tipo: tipoSolicitacaoTitularSchema,
    descricao: z.string().trim().min(1).max(4_000),
    recebida_em: z.iso.datetime({ offset: true }),
  })
  .strict();
export type RegistrarSolicitacaoTitular = z.output<typeof registrarSolicitacaoTitularSchema>;

export const responderSolicitacaoTitularSchema = z
  .object({
    solicitacao_id: uuidSchema,
    medida: medidaSolicitacaoTitularSchema,
    resposta: z.string().trim().min(1).max(4_000),
    versao_esperada: z.number().int().min(1).max(2147483646),
  })
  .strict();
export type ResponderSolicitacaoTitular = z.output<typeof responderSolicitacaoTitularSchema>;

export const consultaSolicitacaoTitularSchema = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    limite: z.number().int().min(1).max(100).default(25),
    paciente_id: uuidSchema.optional(),
  })
  .strict();

export const respostaSolicitacaoTitularPrivadaSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      dados: z.union([solicitacaoTitularSchema, paginaSolicitacaoTitularSchema]),
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

/** Envelope cifrado como ele viaja para a RPC, junto do AAD que o amarra à linha. */
export const envelopeSolicitacaoSchema = campoCifradoSchema;
