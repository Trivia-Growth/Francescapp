import { z } from 'zod';
import { uuidSchema } from './comum.ts';

/** FR-076/FR-081 (diario-de-plantao). Estado emocional OBSERVADO na ficha de plantão:
 * vocabulário administrado pelo Administrador, nunca nota, escala ou gravidade. O termo é
 * rótulo de observação — não concede, amplia nem restringe autorização, e o registro
 * canônico correspondente continua sem `valor`, `unidade` ou `contagem`, para que derivar
 * risco a partir dele seja inviável por esquema. Espelha a migration
 * `20261128210000_estado_emocional_catalogo.sql`. */

/** 80 é o teto da própria coluna `cadastro.turno_estado_emocional_catalogo.estado`
 * (`20261127200000:57`), o mesmo que a ficha aceita em `qualidade`. */
const estado = z.string().trim().min(1).max(80);

export const estadoEmocionalSchema = z
  .object({
    estado_id: uuidSchema,
    estado,
    ativo: z.boolean(),
    /** Semeado pela migration: agitado, apático, choroso, comunicativo, irritado, retraído,
     * sonolento e tranquilo. Termos de partida, desativáveis e renomeáveis como qualquer
     * outro; ficha já gravada guarda o rótulo da época. */
    de_fabrica: z.boolean(),
    versao: z.number().int().min(1).max(2147483647),
  })
  .strict();
export type EstadoEmocional = z.output<typeof estadoEmocionalSchema>;

export const gravarEstadoEmocionalSchema = z
  .object({
    estado_id: uuidSchema,
    estado,
    ativo: z.boolean(),
    versao_esperada: z.number().int().min(0).max(2147483646),
  })
  .strict();
export type GravarEstadoEmocional = z.input<typeof gravarEstadoEmocionalSchema>;

/** Espelha `api.estado_emocional_privado`. */
export const respostaEstadoEmocionalPrivadaSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      dados: z.union([estadoEmocionalSchema, z.array(estadoEmocionalSchema)]),
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
