import { z } from 'zod';
import { paginaSchema, uuidSchema } from './comum.ts';

/** Cada evento identifica um usuário, identidade Auth não admitida ou operador restrito. */
export const eventoAuditoriaSchema = z
  .object({
    id: uuidSchema,
    instante: z.string().datetime({ offset: true }),
    ator_usuario_id: uuidSchema.nullable(),
    ator_auth_id: uuidSchema.nullable().optional(),
    operador_restrito: z
      .string()
      .refine((valor) => valor.trim().length > 0)
      .nullable(),
    acao: z.string().min(1).max(120),
    tipo_objeto: z.string().min(1).max(120),
    objeto_id: uuidSchema.nullable(),
    /** Caso ao qual o evento pertence. Nulo em evento institucional (sessão, configuração,
     * equipe, carteira) e em evento anterior a `20261120200000`, quando a coluna passou a
     * existir. É identificador, não conteúdo: o nome do caso não trafega por aqui. */
    paciente_id: uuidSchema.nullable(),
    resultado: z.enum(['permitido', 'negado', 'falhou']),
  })
  .strict()
  .refine(
    (evento) =>
      [evento.ator_usuario_id, evento.ator_auth_id ?? null, evento.operador_restrito].filter(
        (autor) => autor !== null,
      ).length === 1,
  );
export type EventoAuditoria = z.output<typeof eventoAuditoriaSchema>;

/** Página devolvida por `api.consultar_auditoria` (migration `20261119300000`).
 *
 * O schema é `.strict()` e NÃO tem `motivo_cifrado` nem `request_id`: FR-039 manda "evitar
 * repetir conteúdo clínico desnecessariamente". O controle de verdade é o grant de coluna no
 * banco — este schema é a segunda barreira, não a primeira. */
export const paginaAuditoriaSchema = paginaSchema(eventoAuditoriaSchema);
export type PaginaAuditoria = z.output<typeof paginaAuditoriaSchema>;

export const respostaConsultaAuditoriaPrivadaSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), dados: paginaAuditoriaSchema, request_id: uuidSchema }).strict(),
  z
    .object({
      ok: z.literal(false),
      erro: z.object({ codigo: z.literal('sem_permissao') }).strict(),
      request_id: uuidSchema,
    })
    .strict(),
]);
