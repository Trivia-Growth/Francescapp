import { z } from 'zod';

export const contextoAutorizacaoCurtaSchema = z
  .object({
    usuario_id: z.string().uuid(),
    session_id: z.string().uuid(),
    geracao: z.number().int().positive().safe(),
    operacao: z.string().min(1).max(120),
    audiencia: z.string().min(1).max(120),
  })
  .strict();
export const dadosAutorizacaoCurtaSchema = contextoAutorizacaoCurtaSchema
  .extend({
    key_id: z.string().min(1).max(120),
    id: z.string().uuid(),
    emitido_em: z.number().int().safe(),
    expira_em: z.number().int().safe(),
    digest_entrada: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();
export const autorizacaoCurtaSchema = dadosAutorizacaoCurtaSchema
  .extend({ mac: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  .strict();
export type ContextoAutorizacaoCurta = z.infer<typeof contextoAutorizacaoCurtaSchema>;
export type DadosAutorizacaoCurta = z.infer<typeof dadosAutorizacaoCurtaSchema>;
