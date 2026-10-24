import { z } from 'zod';

import { perfilSchema, uuidSchema, versaoSchema } from './comum.js';

const emailSchema = z.string().trim().email().max(254);
const motivoSchema = z.string().trim().min(1).max(500);

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
    perfil: perfilSchema.optional(),
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

export const entradaSessaoRespostaSchema = z
  .object({
    sessao: sessaoAtualSchema,
    access_token: z.string().min(1).max(16_384),
    csrf: z.string().min(32).max(512),
  })
  .strict();

export const desafioGoogleRespostaSchema = z
  .object({
    desafio_id: uuidSchema,
    nonce_hash: z.string().min(32).max(256),
    csrf: z.string().min(32).max(512),
    expira_em: z.string().datetime({ offset: true }),
  })
  .strict();

export const entrarGoogleSchema = z
  .object({
    desafio_id: uuidSchema,
    credencial: z.string().min(1).max(16_384),
  })
  .strict();

export const entrarTecnicoSchema = z
  .object({
    email: emailSchema,
    senha: z.string().min(1).max(1_024),
  })
  .strict();

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
