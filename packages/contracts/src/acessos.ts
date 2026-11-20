import { z } from 'zod';
import { campoCifradoSchema, uuidSchema, sucessoRespostaSchema } from './comum.ts';

export const funcaoContaSchema = z.enum([
  'administrador',
  'case_manager',
  'familia',
  'profissional',
]);
export const metodoAcessoSchema = z.enum(['google_workspace', 'interno']);
export const estadoAcessoSchema = z.enum([
  'reservado',
  'aguardando_confirmacao_email',
  'aguardando_google',
  'ativo',
  'conflito',
  'falha_confirmada',
]);
export const criarAcessoSchema = z.discriminatedUnion('metodo', [
  z
    .object({
      nome: z.string().trim().min(1).max(200),
      email: z.string().trim().email().max(254),
      funcao: funcaoContaSchema,
      metodo: z.literal('interno'),
      senha: z.string().min(12).max(1024),
      motivo: z.string().trim().min(1).max(500),
      operacao_id: uuidSchema,
    })
    .strict(),
  z
    .object({
      nome: z.string().trim().min(1).max(200),
      email: z.string().trim().email().max(254),
      funcao: funcaoContaSchema,
      metodo: z.literal('google_workspace'),
      motivo: z.string().trim().min(1).max(500),
      operacao_id: uuidSchema,
    })
    .strict(),
]);
export const acessoSchema = z
  .object({
    operacao_id: uuidSchema,
    usuario_id: uuidSchema.nullable(),
    nome: z.string().min(1).max(200),
    email: z.string().email().max(254),
    funcao: funcaoContaSchema,
    metodo: metodoAcessoSchema,
    estado: estadoAcessoSchema,
    criado_em: z.string().datetime({ offset: true }),
    criado_por_usuario_id: uuidSchema,
  })
  .strict();
export const acessoPrivadoSchema = acessoSchema
  .omit({ nome: true, email: true })
  .extend({ nome_cifrado: campoCifradoSchema, email_cifrado: campoCifradoSchema });
export const listaAcessosSchema = z
  .object({ itens: z.array(acessoSchema).max(50), proximo_cursor: uuidSchema.nullable() })
  .strict();
export const listaAcessosPrivadaSchema = z
  .object({ itens: z.array(acessoPrivadoSchema).max(50), proximo_cursor: uuidSchema.nullable() })
  .strict();
export const respostaAcessoSchema = sucessoRespostaSchema(acessoSchema);
export const respostaListaAcessosSchema = sucessoRespostaSchema(listaAcessosSchema);
export const entrarInternoSchema = z
  .object({ email: z.string().trim().email().max(254), senha: z.string().min(1).max(1024) })
  .strict();
export const solicitarConfirmacaoInternaSchema = z
  .object({ email: z.string().trim().email().max(254) })
  .strict();
export const verificarConfirmacaoInternaSchema = solicitarConfirmacaoInternaSchema
  .extend({ codigo: z.string().regex(/^[0-9]{6,10}$/) })
  .strict();
export type FuncaoConta = z.infer<typeof funcaoContaSchema>;
export type CriarAcesso = z.infer<typeof criarAcessoSchema>;
export type Acesso = z.infer<typeof acessoSchema>;
export type ListaAcessos = z.infer<typeof listaAcessosSchema>;
