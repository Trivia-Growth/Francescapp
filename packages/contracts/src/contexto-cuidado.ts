import { z } from 'zod';
import { uuidSchema } from './comum.ts';
import { campoCifradoSchema } from './rpc.ts';

/** Categorias de FR-005, preservadas exatamente como o requisito as enumera.
 * Não acrescentar categoria: o requisito lista rotina, recursos, barreiras,
 * preferências, pontos fortes e o que o paciente considera importante. */
export const CATEGORIAS_CONTEXTO = [
  'rotina',
  'recursos',
  'barreiras',
  'preferencias',
  'pontos_fortes',
  'importante_para_paciente',
] as const;

export type CategoriaContexto = (typeof CATEGORIAS_CONTEXTO)[number];

/** Um elemento de contexto pode apontar para objetivos do plano (FR-005), sem
 * que isso conceda acesso: vínculo é descritivo, autorização continua do caso. */
export type ElementoContexto = {
  id: string;
  categoria: CategoriaContexto;
  descricao: string;
  objetivos: readonly string[];
};

/** Valida dados externos antes de persistir; não avalia conteúdo clínico. */
export function validarContextoCuidado(entrada: unknown): ElementoContexto[] {
  const invalido = (): never => {
    throw new Error('Contexto de cuidado inválido.');
  };
  const objeto = (valor: unknown): Record<string, unknown> => {
    if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return invalido();
    return valor as Record<string, unknown>;
  };
  const texto = (valor: unknown, limite: number): string => {
    if (typeof valor !== 'string') return invalido();
    const limpo = valor.trim();
    if (limpo.length === 0 || limpo.length > limite) return invalido();
    return limpo;
  };
  if (!Array.isArray(entrada)) return invalido();
  if (entrada.length > 200) return invalido();
  const ids = new Set<string>();
  return entrada.map((item): ElementoContexto => {
    const elemento = objeto(item);
    if (
      Object.keys(elemento).some(
        (chave) => !['id', 'categoria', 'descricao', 'objetivos'].includes(chave),
      )
    )
      return invalido();
    const id = texto(elemento.id, 64);
    if (ids.has(id)) return invalido();
    ids.add(id);
    const categoria = elemento.categoria;
    if (
      typeof categoria !== 'string' ||
      !(CATEGORIAS_CONTEXTO as readonly string[]).includes(categoria)
    )
      return invalido();
    const descricao = texto(elemento.descricao, 2000);
    const objetivos = elemento.objetivos === undefined ? [] : elemento.objetivos;
    if (!Array.isArray(objetivos) || objetivos.length > 20) return invalido();
    const vinculados = objetivos.map((objetivo) => {
      const analisado = uuidSchema.safeParse(objetivo);
      if (!analisado.success) return invalido();
      return analisado.data.toLowerCase();
    });
    if (new Set(vinculados).size !== vinculados.length) return invalido();
    return { id, categoria: categoria as CategoriaContexto, descricao, objetivos: vinculados };
  });
}

/** Aplica a mesma validação do domínio na fronteira HTTP. */
export const contextoCuidadoSchema = z.unknown().transform((entrada, ctx) => {
  try {
    return validarContextoCuidado(entrada);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Contexto de cuidado inválido.' });
    return z.NEVER;
  }
});

const versaoContextoSchema = z.number().int().min(0).max(2_147_483_647);

export const salvarContextoCuidadoSchema = z
  .object({
    versao_esperada: versaoContextoSchema.max(2_147_483_646),
    elementos: contextoCuidadoSchema,
  })
  .strict();

export type SalvarContextoCuidado = z.output<typeof salvarContextoCuidadoSchema>;

/** Saída da rota: documento corrente do paciente, ou nulo quando nada foi registrado. */
export const documentoContextoCuidadoSchema = z
  .object({ versao: versaoContextoSchema.min(1), conteudo: contextoCuidadoSchema })
  .strict()
  .nullable();

export type DocumentoContextoCuidado = z.output<typeof documentoContextoCuidadoSchema>;
