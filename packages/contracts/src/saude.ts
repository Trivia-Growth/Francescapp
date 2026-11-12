import { z } from 'zod';
import { uuidSchema } from './comum.ts';
import { campoCifradoSchema } from './rpc.ts';

/** FR-004: histórico de saúde, avaliações e diagnósticos ou hipóteses.
 *
 * Três exigências do requisito estão no modelo, não na interface:
 * - `origem` guarda autor/origem como informado, sem normalizar nem inferir;
 * - `natureza` distingue quem originou a informação, para que um relato leigo
 *   continue identificado como relato e não vire diagnóstico por estar no sistema;
 * - `situacao` registra confirmação, preservando a diferença entre diagnóstico e hipótese.
 *
 * A coordenação organiza o registro; validação clínica pertence ao profissional
 * habilitado e não é decidida por este contrato. */
export type NaturezaOrigemSaude = 'profissional' | 'relato_leigo' | 'documento';
export type SituacaoConfirmacaoSaude = 'confirmado' | 'hipotese';
export type TipoRegistroSaude = 'historico' | 'avaliacao' | 'diagnostico';

export type RegistroSaude = {
  id: string;
  tipo: TipoRegistroSaude;
  descricao: string;
  origem: string;
  natureza: NaturezaOrigemSaude;
  data: string;
  situacao: SituacaoConfirmacaoSaude;
};

const TIPOS: readonly TipoRegistroSaude[] = ['historico', 'avaliacao', 'diagnostico'];
const NATUREZAS: readonly NaturezaOrigemSaude[] = ['profissional', 'relato_leigo', 'documento'];
const SITUACOES: readonly SituacaoConfirmacaoSaude[] = ['confirmado', 'hipotese'];

/** Valida dados externos sem avaliar conteúdo clínico nem completude. */
export function validarRegistrosSaude(entrada: unknown): RegistroSaude[] {
  const invalida = (): never => {
    throw new Error('Registro de saúde inválido.');
  };
  const objeto = (valor: unknown): Record<string, unknown> => {
    if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return invalida();
    return valor as Record<string, unknown>;
  };
  const texto = (valor: unknown, limite: number): string => {
    if (typeof valor !== 'string') return invalida();
    const limpo = valor.trim();
    if (limpo.length === 0 || limpo.length > limite) return invalida();
    return limpo;
  };
  const data = (valor: unknown): string => {
    const resultado = texto(valor, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(resultado)) return invalida();
    const instante = new Date(`${resultado}T00:00:00Z`);
    if (Number.isNaN(instante.getTime()) || instante.toISOString().slice(0, 10) !== resultado)
      return invalida();
    return resultado;
  };
  const dentre = <T extends string>(valor: unknown, aceitos: readonly T[]): T => {
    if (typeof valor !== 'string' || !aceitos.includes(valor as T)) return invalida();
    return valor as T;
  };
  if (!Array.isArray(entrada)) return invalida();
  if (entrada.length > 200) return invalida();
  const ids = new Set<string>();
  return entrada.map((item): RegistroSaude => {
    const registro = objeto(item);
    if (
      Object.keys(registro).some(
        (chave) =>
          !['id', 'tipo', 'descricao', 'origem', 'natureza', 'data', 'situacao'].includes(chave),
      )
    )
      return invalida();
    const id = texto(registro.id, 64);
    if (ids.has(id)) return invalida();
    ids.add(id);
    return {
      id,
      tipo: dentre(registro.tipo, TIPOS),
      descricao: texto(registro.descricao, 2000),
      origem: texto(registro.origem, 200),
      natureza: dentre(registro.natureza, NATUREZAS),
      data: data(registro.data),
      situacao: dentre(registro.situacao, SITUACOES),
    };
  });
}

/** Aplica a mesma validação do domínio na fronteira HTTP. */
export const registrosSaudeSchema = z.unknown().transform((entrada, ctx) => {
  try {
    return validarRegistrosSaude(entrada);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Registro de saúde inválido.' });
    return z.NEVER;
  }
});

const versaoSaudeSchema = z.number().int().min(0).max(2_147_483_647);

export const salvarSaudeSchema = z
  .object({
    versao_esperada: versaoSaudeSchema.max(2_147_483_646),
    registros: registrosSaudeSchema,
  })
  .strict();

export const saudeSchema = z
  .object({
    versao: versaoSaudeSchema,
    registros: registrosSaudeSchema,
    criado_por_usuario_id: uuidSchema.optional(),
    criado_em: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

export type SalvarSaude = z.output<typeof salvarSaudeSchema>;
export type Saude = z.output<typeof saudeSchema>;

/** Resposta privada do banco; não constitui rota HTTP pública. */
export const respostaSaudePrivadaSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      repeticao: z.boolean(),
      dados: z
        .object({
          registro_id: uuidSchema,
          paciente_id: uuidSchema,
          versao: versaoSaudeSchema.min(1),
          conteudo: campoCifradoSchema,
          criado_por_usuario_id: uuidSchema.optional(),
          criado_em: z.iso.datetime({ offset: true }).optional(),
        })
        .strict()
        .nullable(),
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
