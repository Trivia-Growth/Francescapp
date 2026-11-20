import { z } from 'zod';
import { uuidSchema } from './comum.ts';

/** FR-079 (diario-de-plantao, D4). Papel declarado do profissional: rótulo de registro,
 * administrado pelo Administrador. NÃO concede, amplia, restringe nem substitui
 * autorização — perfil e vínculo com o caso continuam sendo os únicos controles, e o
 * enum `usuario.perfil` não é tocado. Espelha a migration
 * `20261127130000_papel_declarado_catalogo.sql`. */
const nome = z.string().trim().min(1).max(120);

export const papelDeclaradoSchema = z
  .object({
    papel_id: uuidSchema,
    nome,
    ativo: z.boolean(),
    /** Semeado pela migration (Acompanhante terapêutico e Enfermeira). Desativável e
     * renomeável como qualquer outro; ficha já gravada guarda o papel da época. */
    de_fabrica: z.boolean(),
    versao: z.number().int().min(1).max(2147483647),
  })
  .strict();
export type PapelDeclarado = z.output<typeof papelDeclaradoSchema>;

export const gravarPapelDeclaradoSchema = z
  .object({
    papel_id: uuidSchema,
    nome,
    ativo: z.boolean(),
    versao_esperada: z.number().int().min(0).max(2147483646),
  })
  .strict();
export type GravarPapelDeclarado = z.input<typeof gravarPapelDeclaradoSchema>;

/** Espelha `api.papel_declarado_privado`. */
export const respostaPapelDeclaradoPrivadaSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      dados: z.union([papelDeclaradoSchema, z.array(papelDeclaradoSchema)]),
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
