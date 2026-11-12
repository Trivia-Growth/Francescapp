import { z } from 'zod';
import { uuidSchema } from './comum.ts';
import { campoCifradoSchema } from './rpc.ts';

/** FR-029 a FR-031: anexos do caso guardados no Google Drive institucional.
 *
 * Três decisões do requisito estão no modelo, não na interface:
 * - a classificação (`categoria`) e a `audiencia` são obrigatórias para concluir o envio
 *   (FR-030), então faltam no tipo e o contrato recusa — não há caminho para anexo sem
 *   classificar;
 * - `estado` distingue o anexo disponível do indisponível (FR-029 e cenário 2 da User
 *   Story 8): arquivo que sumiu do Drive continua listado, marcado, com orientação — nunca
 *   apresentado como disponível nem apagado em silêncio;
 * - `versao` cresce a cada registro do mesmo documento, e a relação devolve sempre a versão
 *   atual de cada um.
 *
 * O vocabulário de audiência é o mesmo do diário (`audienciaDiarioSchema`) de propósito: é a
 * mesma pergunta de negócio, e um segundo vocabulário para ela seria dívida. */
export const audienciaDocumentoSchema = z.enum(['equipe', 'equipe_e_familia']);
export type AudienciaDocumento = z.output<typeof audienciaDocumentoSchema>;

export const estadoDocumentoSchema = z.enum(['disponivel', 'indisponivel', 'removido']);
export type EstadoDocumento = z.output<typeof estadoDocumentoSchema>;

const dataDocumentoSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((valor) => {
    const instante = new Date(`${valor}T00:00:00Z`);
    return !Number.isNaN(instante.getTime()) && instante.toISOString().slice(0, 10) === valor;
  }, 'Data inexistente.');

/** O que viaja cifrado: o que identifica o arquivo e o descreve.
 *
 * `drive_file_id` é cifrado de propósito. Ele é uma capacidade: quem o tiver e tenha acesso à
 * pasta abre o arquivo direto no Drive, sem passar por esta autorização. Guardá-lo em claro
 * transformaria uma leitura do banco em acesso ao conteúdo. */
export const conteudoDocumentoSchema = z
  .object({
    nome_visivel: z.string().trim().min(1).max(240),
    drive_file_id: z.string().trim().min(1).max(256),
    descricao: z.string().trim().max(2000).optional(),
  })
  .strict();
export type ConteudoDocumento = z.output<typeof conteudoDocumentoSchema>;

/** Metadado de organização que o banco mantém legível para poder filtrar e ordenar
 * (FR-029 exige busca por categoria, origem, data e audiência). */
export const metadadoDocumentoSchema = z
  .object({
    categoria: z.string().trim().min(1).max(120),
    origem: z.string().trim().min(1).max(120).optional(),
    data_documento: dataDocumentoSchema.optional(),
    audiencia: audienciaDocumentoSchema,
    estado: estadoDocumentoSchema,
  })
  .strict();
export type MetadadoDocumento = z.output<typeof metadadoDocumentoSchema>;

/** Um anexo como a tela o recebe, já decifrado. */
export const documentoCasoSchema = metadadoDocumentoSchema
  .extend({
    documento_id: uuidSchema,
    registro_id: uuidSchema,
    versao: z.number().int().min(1),
    criado_por_usuario_id: uuidSchema.optional(),
    criado_em: z.iso.datetime({ offset: true }).optional(),
  })
  .extend(conteudoDocumentoSchema.shape);
export type DocumentoCaso = z.output<typeof documentoCasoSchema>;

/** Resposta privada do banco; não constitui rota HTTP pública. */
export const respostaDocumentoPrivadaSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      repeticao: z.boolean(),
      dados: z
        .object({
          documentos: z.array(
            metadadoDocumentoSchema
              .extend({
                documento_id: uuidSchema,
                registro_id: uuidSchema,
                paciente_id: uuidSchema,
                versao: z.number().int().min(1),
                conteudo: campoCifradoSchema,
                criado_por_usuario_id: uuidSchema.optional(),
                criado_em: z.iso.datetime({ offset: true }).optional(),
              })
              .strict(),
          ),
        })
        .strict(),
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
