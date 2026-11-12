import { z } from 'zod';
import { uuidSchema } from './comum.ts';
import { relatoTextualSchema } from './relato-textual.ts';
import { campoCifradoSchema } from './rpc.ts';

/** Diário e evolução: FR-008 (relato), FR-009 (síntese profissional), FR-012 (rascunho,
 * publicação e retificação justificada), FR-013 (envio, consulta e retorno) e FR-014
 * (atenção e conversão em tarefa).
 *
 * O que está aqui em claro é o que a autorização e a consulta precisam ver sem decifrar:
 * tipo, estado, audiência, atenção, solicitação de retorno, origem do texto e as duas
 * referências operacionais (registro respondido e tarefa gerada). O acontecimento em si —
 * data, categoria, descrição, contexto, ação tomada, síntese e a justificativa da
 * retificação — só existe cifrado. */

export const tipoRegistroDiarioSchema = z.enum(['relato_familiar', 'evolucao_profissional']);
export type TipoRegistroDiario = z.output<typeof tipoRegistroDiarioSchema>;

/** FR-012. `retificado` só sucede algo já publicado, e exige justificativa. */
export const estadoRegistroDiarioSchema = z.enum(['rascunho', 'publicado', 'retificado']);
export type EstadoRegistroDiario = z.output<typeof estadoRegistroDiarioSchema>;

/** `equipe` = autor e colaboradores vinculados. `equipe_e_familia` acrescenta a família com
 * acesso vigente. Nenhuma audiência torna um relato visível a outro familiar. */
export const audienciaDiarioSchema = z.enum(['equipe', 'equipe_e_familia']);
export type AudienciaDiario = z.output<typeof audienciaDiarioSchema>;

/** Preparado para FR-010 sem implementá-lo: texto vindo de transcrição não pode ser
 * apresentado como digitado pelo autor. A transcrição em si é outra fatia. */
export const origemConteudoDiarioSchema = z.enum(['texto', 'audio_transcrito']);
export type OrigemConteudoDiario = z.output<typeof origemConteudoDiarioSchema>;

const texto = (limite: number) => z.string().trim().min(1).max(limite);

/** FR-008. Reaproveita o contrato já revisado em `relato-textual.ts`; `solicitacaoRetorno`
 * sai do conteúdo porque virou coluna em claro — FR-013 exige localizar o que pediu retorno
 * sem decifrar. Data e descrição continuam sendo as únicas obrigatórias. */
export const conteudoRelatoDiarioSchema = relatoTextualSchema.omit({ solicitacaoRetorno: true });
export type ConteudoRelatoDiario = z.output<typeof conteudoRelatoDiarioSchema>;

/** FR-009: modelo curto por área. Os campos são os do requisito; a lista de áreas é
 * configuração da equipe (`ffcm.diario.areas_sintese`), não constante de código. */
export const conteudoEvolucaoDiarioSchema = z
  .object({
    data: z.iso.date(),
    area: texto(120),
    atividade: texto(2000).optional(),
    observacoesCompartilhaveis: texto(4000).optional(),
    progresso: texto(2000).optional(),
    orientacao: texto(2000).optional(),
    proximoPasso: texto(2000).optional(),
    objetivoRelacionado: texto(200).optional(),
  })
  .strict();
export type ConteudoEvolucaoDiario = z.output<typeof conteudoEvolucaoDiarioSchema>;

export const conteudoDiarioSchema = z.union([
  conteudoRelatoDiarioSchema,
  conteudoEvolucaoDiarioSchema,
]);

export const justificativaDiarioSchema = texto(2000);

const versaoSchema = z.number().int().min(0).max(2_147_483_647);

/** Projeção para a interface, já decifrada no servidor. `consultas` responde FR-013 ao
 * remetente; para quem não é o autor ela só reflete a própria marca de leitura. */
export const registroDiarioSchema = z
  .object({
    diario_registro_id: uuidSchema,
    registro_id: uuidSchema,
    versao: versaoSchema.min(1),
    tipo: tipoRegistroDiarioSchema,
    autor_usuario_id: uuidSchema,
    estado: estadoRegistroDiarioSchema,
    audiencia: audienciaDiarioSchema,
    atencao: z.boolean(),
    retorno_solicitado: z.boolean(),
    origem_conteudo: origemConteudoDiarioSchema,
    responde_registro_id: uuidSchema.nullable(),
    tarefa_id: uuidSchema.nullable(),
    criado_em: z.iso.datetime({ offset: true }),
    consultas: z.number().int().min(0),
    conteudo: conteudoDiarioSchema,
    justificativa: justificativaDiarioSchema.optional(),
  })
  .strict()
  .refine(
    (registro) => (registro.estado === 'retificado') === (registro.justificativa !== undefined),
    'Retificação exige justificativa; o que não é retificação não tem justificativa.',
  );
export type RegistroDiario = z.output<typeof registroDiarioSchema>;

/** `diario_registro_id` ausente cria; presente exige a versão vigente, como nas demais
 * fatias versionadas. A publicação de uma evolução exige síntese (FR-009) — o banco não pode
 * conferir isso porque o conteúdo é cifrado, então a fronteira confere aqui e no servidor. */
export const salvarRegistroDiarioSchema = z
  .object({
    diario_registro_id: uuidSchema.optional(),
    versao_esperada: versaoSchema.max(2_147_483_646),
    tipo: tipoRegistroDiarioSchema,
    estado: estadoRegistroDiarioSchema,
    audiencia: audienciaDiarioSchema,
    atencao: z.boolean(),
    retorno_solicitado: z.boolean(),
    origem_conteudo: origemConteudoDiarioSchema,
    responde_registro_id: uuidSchema.optional(),
    tarefa_id: uuidSchema.optional(),
    conteudo: conteudoDiarioSchema,
    justificativa: justificativaDiarioSchema.optional(),
  })
  .strict()
  .refine(
    (valor) => (valor.versao_esperada === 0) === (valor.diario_registro_id === undefined),
    'Versão esperada e identificador devem concordar sobre criação ou revisão.',
  )
  .refine(
    (valor) => (valor.estado === 'retificado') === (valor.justificativa !== undefined),
    'Retificar exige justificativa; publicar ou rascunhar não a aceita.',
  )
  .refine(
    (valor) => valor.estado !== 'rascunho' || valor.responde_registro_id === undefined,
    'Rascunho é privado do autor e por isso não responde ninguém.',
  )
  .refine(
    (valor) =>
      valor.tipo !== 'relato_familiar' ||
      (valor.audiencia === 'equipe' &&
        valor.responde_registro_id === undefined &&
        conteudoRelatoDiarioSchema.safeParse(valor.conteudo).success),
    'Relato familiar tem audiência de equipe e o conteúdo do relato.',
  )
  .refine(
    (valor) =>
      valor.tipo !== 'evolucao_profissional' ||
      conteudoEvolucaoDiarioSchema.safeParse(valor.conteudo).success,
    'Evolução profissional usa o modelo de síntese da área.',
  )
  .refine(
    (valor) =>
      valor.tipo !== 'evolucao_profissional' ||
      valor.estado === 'rascunho' ||
      conteudoEvolucaoDiarioSchema.safeParse(valor.conteudo).data?.atividade !== undefined,
    'Publicar evolução exige data, autor identificado e síntese (FR-009).',
  );
export type SalvarRegistroDiario = z.output<typeof salvarRegistroDiarioSchema>;

export const consultarDiarioSchema = z.object({}).strict();

/** Disponibilidade da rota e as áreas configuradas pela equipe (FR-009). */
export const disponibilidadeDiarioSchema = z
  .object({ disponivel: z.boolean(), areas: z.array(texto(120)).max(50) })
  .strict();

const registroPrivadoSchema = z
  .object({
    registro_id: uuidSchema,
    diario_registro_id: uuidSchema,
    paciente_id: uuidSchema,
    tipo: tipoRegistroDiarioSchema,
    autor_usuario_id: uuidSchema,
    versao: versaoSchema.min(1),
    estado: estadoRegistroDiarioSchema,
    audiencia: audienciaDiarioSchema,
    atencao: z.boolean(),
    retorno_solicitado: z.boolean(),
    origem_conteudo: origemConteudoDiarioSchema,
    responde_registro_id: uuidSchema.nullable(),
    tarefa_id: uuidSchema.nullable(),
    conteudo: campoCifradoSchema,
    justificativa: campoCifradoSchema.nullable(),
    criado_em: z.iso.datetime({ offset: true }),
    consultas: z.number().int().min(0),
  })
  .strict();

/** Resposta privada do banco; não constitui rota HTTP pública. */
export const respostaDiarioPrivadaSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      repeticao: z.boolean(),
      dados: z.union([registroPrivadoSchema, z.array(registroPrivadoSchema)]),
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
