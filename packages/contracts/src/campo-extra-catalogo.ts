import { z } from 'zod';
import { uuidSchema } from './comum.ts';

/** FR-078 (diario-de-plantao). O catálogo de campos extras deixou de ser só do Plano de
 * cuidado: `escopo` diz de qual formulário o campo é. A ação literal do Plano continua
 * existindo, com o formato antigo, em `plano-cuidado.ts`; o que está aqui é a forma
 * generalizada, com ordem, obrigatoriedade, origem de fábrica e visibilidade.
 * Espelha a migration `20261127100000_campo_extra_catalogo_generalizado.sql`. */
export const escopoCampoExtraSchema = z.enum(['plano_cuidado', 'ficha_plantao']);
export type EscopoCampoExtra = z.output<typeof escopoCampoExtraSchema>;

/** `interna` é nota da equipe; `compartilhavel` é o que a família pode alcançar — sempre
 * sob o fundamento de autorização vigente de FR-062, que esta marca não substitui. */
export const visibilidadeCampoExtraSchema = z.enum(['interna', 'compartilhavel']);
export type VisibilidadeCampoExtra = z.output<typeof visibilidadeCampoExtraSchema>;

export const tipoCampoExtraSchema = z.enum([
  'texto',
  'numero',
  'data',
  'lista',
  'booleano',
  'texto_longo',
]);
export type TipoCampoExtra = z.output<typeof tipoCampoExtraSchema>;

const nome = z.string().trim().min(1).max(120);
const ordemSchema = z.number().int().min(0).max(999999999);
const versaoEsperadaSchema = z.number().int().min(0).max(2147483646);

export const campoExtraCatalogoGeneralizadoSchema = z
  .object({
    campo_id: uuidSchema,
    escopo: escopoCampoExtraSchema,
    nome,
    tipo: tipoCampoExtraSchema,
    opcoes: z.array(nome).min(1).max(20).nullable(),
    ativo: z.boolean(),
    ordem: ordemSchema,
    obrigatorio: z.boolean(),
    /** Campo semeado pela migration. É administrável como qualquer outro — pode ser
     * desativado, reordenado e marcado obrigatório —, mas nunca é apagado. */
    de_fabrica: z.boolean(),
    visibilidade: visibilidadeCampoExtraSchema,
    versao: z.number().int().min(1).max(2147483647),
  })
  .strict();
export type CampoExtraCatalogoGeneralizado = z.output<typeof campoExtraCatalogoGeneralizadoSchema>;

/** Entrada da ação `api.gravar_campo_extra`. `de_fabrica` não entra: é decisão da
 * semeadura, não do Administrador. */
export const gravarCampoExtraEscopoSchema = z
  .object({
    campo_id: uuidSchema,
    escopo: escopoCampoExtraSchema,
    nome,
    tipo: tipoCampoExtraSchema,
    opcoes: z.array(nome).min(1).max(20).nullable(),
    ativo: z.boolean(),
    ordem: ordemSchema,
    obrigatorio: z.boolean(),
    visibilidade: visibilidadeCampoExtraSchema,
    versao_esperada: versaoEsperadaSchema,
  })
  .strict()
  .refine(
    (valor) => (valor.tipo === 'lista') === (valor.opcoes !== null),
    'Só o tipo lista tem opções, e ele exige pelo menos uma.',
  );
export type GravarCampoExtraEscopo = z.input<typeof gravarCampoExtraEscopoSchema>;

export const listarCampoExtraEscopoSchema = z.object({ escopo: escopoCampoExtraSchema }).strict();

/** Espelha `api.campo_extra_plano_privado` nas ações com escopo. */
export const respostaCampoExtraEscopoPrivadaSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      dados: z.union([
        campoExtraCatalogoGeneralizadoSchema,
        z.array(campoExtraCatalogoGeneralizadoSchema),
      ]),
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

/** Ordem de apresentação do modelo: `ordem` primeiro, empate desfeito pelo nome e pelo
 * identificador, para que duas telas nunca mostrem a mesma lista em ordens diferentes. */
export function ordenarModelo(
  campos: readonly CampoExtraCatalogoGeneralizado[],
): CampoExtraCatalogoGeneralizado[] {
  return [...campos].sort(
    (a, b) =>
      a.ordem - b.ordem ||
      a.nome.localeCompare(b.nome, 'pt-BR') ||
      a.campo_id.localeCompare(b.campo_id),
  );
}
