import { z } from 'zod';
import { uuidSchema } from './comum.ts';
import { campoCifradoSchema } from './rpc.ts';

/** FR-020: plano de crise aprovado pelo profissional habilitado.
 *
 * O requisito nomeia quatro conteúdos obrigatórios — responsáveis, contatos, limites do
 * serviço e data de revisão — e duas afirmações que precisam aparecer para quem lê:
 * o diário não garante resposta imediata, e a case manager não emite conduta clínica por
 * assumir a coordenação. As duas afirmações são texto fixo da interface (ver `web/plano-crise.ts`),
 * não campo editável: não dependem do que alguém digitou e não podem ser removidas por engano.
 *
 * A aprovação não é um campo do conteúdo. Ela é um carimbo à parte, preso a uma VERSÃO
 * específica do plano, para que editar o plano não carregue junto a aprovação anterior.
 * Quem pode aprovar é decidido no banco pela marca de habilitação da concessão
 * (ver `habilitacao-plano-crise.ts`); este contrato não concede nem verifica permissão. */
export type ResponsavelCrise = {
  id: string;
  nome: string;
  papel: string;
  contato: string;
};

export type ContatoCrise = {
  id: string;
  descricao: string;
  telefone: string;
};

export type PlanoCriseConteudo = {
  responsaveis: ResponsavelCrise[];
  contatos: ContatoCrise[];
  limites_servico: string;
  data_revisao: string;
};

/** Valida dados externos sem avaliar adequação clínica nem completude do cuidado. */
export function validarPlanoCrise(entrada: unknown): PlanoCriseConteudo {
  const invalida = (): never => {
    throw new Error('Plano de crise inválido.');
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
  const lista = <T>(
    valor: unknown,
    chaves: readonly string[],
    montar: (registro: Record<string, unknown>, id: string) => T,
  ): T[] => {
    if (!Array.isArray(valor) || valor.length > 50) return invalida();
    const ids = new Set<string>();
    return valor.map((item) => {
      const registro = objeto(item);
      if (Object.keys(registro).some((chave) => !chaves.includes(chave))) return invalida();
      const id = texto(registro.id, 64);
      if (ids.has(id)) return invalida();
      ids.add(id);
      return montar(registro, id);
    });
  };
  const plano = objeto(entrada);
  if (
    Object.keys(plano).some(
      (chave) => !['responsaveis', 'contatos', 'limites_servico', 'data_revisao'].includes(chave),
    )
  )
    return invalida();
  return {
    responsaveis: lista(
      plano.responsaveis,
      ['id', 'nome', 'papel', 'contato'],
      (registro, id): ResponsavelCrise => ({
        id,
        nome: texto(registro.nome, 200),
        papel: texto(registro.papel, 200),
        contato: texto(registro.contato, 200),
      }),
    ),
    contatos: lista(
      plano.contatos,
      ['id', 'descricao', 'telefone'],
      (registro, id): ContatoCrise => ({
        id,
        descricao: texto(registro.descricao, 200),
        telefone: texto(registro.telefone, 100),
      }),
    ),
    limites_servico: texto(plano.limites_servico, 4000),
    data_revisao: data(plano.data_revisao),
  };
}

/** Aplica a mesma validação do domínio na fronteira HTTP. */
export const planoCriseConteudoSchema = z.unknown().transform((entrada, ctx) => {
  try {
    return validarPlanoCrise(entrada);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Plano de crise inválido.' });
    return z.NEVER;
  }
});

const versaoPlanoCriseSchema = z.number().int().min(0).max(2_147_483_647);

const aprovacaoSchema = z
  .object({
    aprovador_usuario_id: uuidSchema,
    aprovado_em: z.iso.datetime({ offset: true }),
  })
  .strict();

export const salvarPlanoCriseSchema = z
  .object({
    versao_esperada: versaoPlanoCriseSchema.max(2_147_483_646),
    conteudo: planoCriseConteudoSchema,
  })
  .strict();

/** Aprovar nomeia a versão exata que foi lida: aprovar “o plano” sem versão aprovaria
 * um texto que já pode ter mudado entre a leitura e o clique. */
export const aprovarPlanoCriseSchema = z
  .object({
    registro_id: uuidSchema,
    versao: versaoPlanoCriseSchema.min(1),
  })
  .strict();

export const planoCriseSchema = z
  .object({
    registro_id: uuidSchema,
    versao: versaoPlanoCriseSchema.min(1),
    conteudo: planoCriseConteudoSchema,
    aprovacao: aprovacaoSchema.nullable(),
  })
  .strict();

export type SalvarPlanoCrise = z.output<typeof salvarPlanoCriseSchema>;
export type AprovarPlanoCrise = z.output<typeof aprovarPlanoCriseSchema>;
export type PlanoCrise = z.output<typeof planoCriseSchema>;

/** Resposta privada do banco; não constitui rota HTTP pública. */
export const respostaPlanoCrisePrivadaSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      repeticao: z.boolean(),
      dados: z
        .object({
          registro_id: uuidSchema,
          paciente_id: uuidSchema,
          versao: versaoPlanoCriseSchema.min(1),
          conteudo: campoCifradoSchema,
          aprovacao: aprovacaoSchema.nullable(),
        })
        .strict()
        .nullable(),
      request_id: uuidSchema,
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      // Aprovar sem a marca de habilitação devolve `sem_permissao`, como qualquer outra
      // falta de autorização: o erro não revela se faltou vínculo, sessão ou habilitação.
      erro: z
        .object({ codigo: z.enum(['sem_permissao', 'conflito', 'conflito_idempotencia']) })
        .strict(),
      request_id: uuidSchema,
    })
    .strict(),
]);
