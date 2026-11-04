import { z } from 'zod';

import { perfilSchema, uuidSchema, versaoSchema } from './comum.ts';

const emailSchema = z.string().trim().email().max(254);
const motivoSchema = z.string().trim().min(1).max(500);

export const entradaVinculoFamiliarPrivadoSchema = z
  .object({
    operacao_id: uuidSchema,
    request_id: uuidSchema,
    paciente_id: uuidSchema,
    familiar_id: uuidSchema,
    motivo: motivoSchema,
  })
  .strict();

export const metodoConcessaoSchema = z.literal('google_workspace');
export const estadoConcessaoSchema = z.enum(['pendente', 'vinculada', 'revogada']);
export type EstadoConcessao = z.infer<typeof estadoConcessaoSchema>;

export const criarConcessaoEquipeSchema = z
  .object({
    email: emailSchema,
    perfil: perfilSchema.exclude(['familia']),
    metodo: metodoConcessaoSchema,
    motivo: motivoSchema,
  })
  .strict();

export const revogarConcessaoEquipeSchema = z
  .object({
    versao_esperada: versaoSchema,
    motivo: motivoSchema,
  })
  .strict();

export const atualizarAcessoUsuarioSchema = z
  .object({
    perfil: perfilSchema.exclude(['familia']).optional(),
    ativo: z.boolean().optional(),
    versao_esperada: versaoSchema,
    motivo: motivoSchema,
  })
  .strict()
  .refine(({ perfil, ativo }) => perfil !== undefined || ativo !== undefined, {
    message: 'Informe perfil ou estado ativo para alterar.',
  });

export const concessaoEquipeSchema = z
  .object({
    id: uuidSchema,
    perfil: perfilSchema.exclude(['familia']),
    metodo: metodoConcessaoSchema,
    estado: estadoConcessaoSchema,
    usuario_id: uuidSchema.nullable(),
    versao: versaoSchema,
  })
  .strict();

export const usuarioSessaoSchema = z
  .object({
    id: uuidSchema,
    perfil: perfilSchema,
    ativo: z.boolean(),
    versao: versaoSchema,
  })
  .strict();

export const capacidadeSchema = z.enum([
  'administrar_concessoes',
  'administrar_cadastro',
  'consultar_carteira_integral',
  'consultar_pacientes_vinculados',
  'consultar_auditoria',
]);

export const sessaoAtualSchema = z
  .object({
    usuario: usuarioSessaoSchema,
    capacidades: z.array(capacidadeSchema),
  })
  .strict();

/** Contexto nativo, não credencial: permite rejeitar mutações/saída de uma aba
 * antiga quando os cookies já pertencem a outro login. Autoridade fica no banco. */
export const sessaoNativaSchema = sessaoAtualSchema.extend({ session_id: uuidSchema }).strict();

export const entradaSessaoRespostaSchema = z
  .object({
    sessao: sessaoAtualSchema,
    access_token: z.string().min(1).max(16_384),
    csrf: z.string().min(32).max(512),
    seletor_sessao: z
      .string()
      .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
  })
  .strict();

/** A prova é credencial temporária: só em memória, jamais em URL/cookie/log. */
export const entradaSessaoComProvaRespostaSchema = entradaSessaoRespostaSchema
  .extend({
    prova_sessao: z.string().regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/),
    geracao_sessao: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export const desafioGoogleRespostaSchema = z
  .object({
    desafio_id: uuidSchema,
    nonce_hash: z.string().min(32).max(256),
    csrf: z.string().min(32).max(512),
    seletor_desafio: z
      .string()
      .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
    expira_em: z.string().datetime({ offset: true }),
  })
  .strict();

export const entrarGoogleSchema = z
  .object({
    desafio_id: uuidSchema,
    credencial: z.string().min(1).max(16_384),
  })
  .strict();

export const solicitarRecuperacaoSchema = z.object({ email: emailSchema }).strict();

export const entrarTecnicoSchema = z
  .object({
    email: emailSchema,
    senha: z.string().min(1).max(1_024),
  })
  .strict();

export const entrarFamiliarSchema = entrarTecnicoSchema;

export const csrfSchema = z.string().min(32).max(512);

// CSRF via cabeçalho x-csrf, comparado com o cookie selado no servidor.
export const comandoSessaoSchema = z.object({}).strict();

export const saidaSessaoSchema = z
  .object({
    encerrada_localmente: z.literal(true),
    pendencia_externa: z.boolean(),
  })
  .strict();

/**
 * Fonte de autoridade: `usuario` determina o perfil atual. A concessão
 * vinculada espelha esse perfil na mesma transação e preserva a trilha.
 */
export const transicoesConcessao = {
  criar: { de: [], para: 'pendente' },
  vincular: { de: ['pendente'], para: 'vinculada' },
  alterarAcesso: { de: ['vinculada'], para: 'vinculada' },
  revogar: { de: ['pendente', 'vinculada'], para: 'revogada' },
  reconceder: { de: ['revogada'], para: 'pendente' },
} as const;

export type CriarConcessaoEquipe = z.infer<typeof criarConcessaoEquipeSchema>;
export type AtualizarAcessoUsuario = z.infer<typeof atualizarAcessoUsuarioSchema>;
