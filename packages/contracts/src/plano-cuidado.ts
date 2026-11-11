import { z } from 'zod';
import { uuidSchema } from './comum.ts';
import { campoCifradoSchema } from './rpc.ts';

const texto = z.string().trim().min(1);
const data = z.iso.date().refine((valor) => {
  const instante = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(instante.getTime()) && instante.toISOString().slice(0, 10) === valor;
});

/** Chave é o campo_id do catálogo administrado por Administrador (ver
 * `campo_extra_plano_catalogo`); valor sempre serializado como string (número e
 * data formatados, opção de lista como uma das `opcoes`). A validação por tipo
 * contra o catálogo corrente é dinâmica (não cabe no schema estático) — ver
 * `validarCamposExtras`. */
const camposExtrasSchema = z.record(uuidSchema, z.string()).optional();

export const objetivoSchema = z
  .object({
    descricao: texto,
    area: texto,
    responsavel: texto,
    situacaoInicial: texto,
    observacaoProgresso: texto,
    dataRevisao: data,
    estado: z.enum(['proposto', 'em andamento', 'atingido', 'pausado', 'revisar', 'encerrado']),
    camposExtras: camposExtrasSchema,
  })
  .strict();

const revisaoSchema = z
  .object({
    objetivo: objetivoSchema,
    motivo: texto,
  })
  .strict();

export type Objetivo = z.output<typeof objetivoSchema>;
export type RevisaoObjetivo = z.output<typeof revisaoSchema>;
export type MetadadosRevisao = { responsavel: string; data: string };
export type VersaoObjetivo = RevisaoObjetivo & MetadadosRevisao & { versao: number };

const metadadosSchema = z.object({ responsavel: texto, data }).strict();

/** Metadados devem vir da fronteira autenticada e relógio confiável; autorização e transação ficam fora desta regra local. */
export function revisarObjetivo(
  historico: readonly VersaoObjetivo[],
  versaoEsperada: number,
  entrada: unknown,
  metadadosConfiaveis: MetadadosRevisao,
): { ok: true; versoes: VersaoObjetivo[] } | { ok: false; erro: 'conflito' } {
  const ultima = historico.at(-1);
  if (!ultima || ultima.versao !== versaoEsperada) return { ok: false, erro: 'conflito' };
  const revisao = revisaoSchema.parse(entrada);
  const metadados = metadadosSchema.parse(metadadosConfiaveis);
  return {
    ok: true,
    versoes: [
      ...structuredClone(historico),
      { ...revisao, ...metadados, versao: ultima.versao + 1 },
    ],
  };
}

/** Espelha a saída de `api.campo_extra_plano_privado` (ação `listar_campo_extra_plano`),
 * ver `supabase/migrations/20261116140000_campo_extra_plano_operacoes_privadas.sql`. */
export const campoExtraCatalogoSchema = z
  .object({
    campo_id: uuidSchema,
    nome: texto,
    tipo: z.enum(['texto', 'numero', 'data', 'lista']),
    opcoes: z.array(texto).min(1).max(20).nullable(),
    ativo: z.boolean(),
    versao: z.number().int().min(1).max(2147483647),
  })
  .strict();
export type CampoExtraCatalogo = z.output<typeof campoExtraCatalogoSchema>;

const numeroTextoRegex = /^-?\d+(\.\d+)?$/;

/** Valida os valores de campos extras de um objetivo contra o catálogo corrente, antes
 * de cifrar. Campo desconhecido ou desativado nega entrada NOVA (não afeta valor antigo
 * já gravado em versão anterior do histórico). Campos extras são sempre opcionais: não
 * exige que todo campo ativo do catálogo esteja preenchido. */
export function validarCamposExtras(
  valores: Record<string, string> | undefined,
  catalogo: readonly CampoExtraCatalogo[],
): { ok: true } | { ok: false; erro: 'campo_desconhecido' | 'campo_inativo' | 'valor_invalido' } {
  if (!valores) return { ok: true };
  const porId = new Map(catalogo.map((campo) => [campo.campo_id, campo] as const));
  for (const [campoId, valor] of Object.entries(valores)) {
    const campo = porId.get(campoId);
    if (!campo) return { ok: false, erro: 'campo_desconhecido' };
    if (!campo.ativo) return { ok: false, erro: 'campo_inativo' };
    if (campo.tipo === 'texto') {
      if (valor.trim().length === 0) return { ok: false, erro: 'valor_invalido' };
    } else if (campo.tipo === 'numero') {
      if (!numeroTextoRegex.test(valor) || !Number.isFinite(Number(valor)))
        return { ok: false, erro: 'valor_invalido' };
    } else if (campo.tipo === 'data') {
      if (!data.safeParse(valor).success) return { ok: false, erro: 'valor_invalido' };
    } else if (!campo.opcoes?.includes(valor)) {
      return { ok: false, erro: 'valor_invalido' };
    }
  }
  return { ok: true };
}

export const motivoPlanoSchema = z.string().trim().min(1);
export const conteudoPlanoSchema = z
  .object({
    objetivo: objetivoSchema,
    motivo: motivoPlanoSchema.optional(),
    ator_usuario_id: uuidSchema,
    data: z.iso.datetime(),
  })
  .strict();
const registroPlanoSchema = z
  .object({
    registro_id: uuidSchema,
    objetivo_id: uuidSchema,
    paciente_id: uuidSchema,
    versao: z.number().int().min(1).max(2147483647),
    conteudo: campoCifradoSchema,
  })
  .strict();
export const respostaPlanoPrivadaSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      dados: z.union([
        registroPlanoSchema,
        z
          .object({
            itens: z.array(registroPlanoSchema).max(20),
            proximo_cursor: z
              .union([uuidSchema, z.number().int().positive().max(2147483647)])
              .nullable(),
          })
          .strict(),
      ]),
      request_id: uuidSchema,
      repeticao: z.boolean().optional().default(false),
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
