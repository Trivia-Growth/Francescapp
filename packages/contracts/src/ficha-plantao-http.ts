import { z } from 'zod';
import { uuidSchema } from './comum.ts';
import {
  conteudoFichaPlantaoSchema,
  fonteInformacaoSchema,
  papelDeclaradoSchema,
  periodoPlantaoSchema,
  rascunhoFichaPlantaoSchema,
  resolucaoPendenciaEscritaSchema,
  respostaPlantaoSchema,
  submissaoFichaPlantaoSchema,
  visibilidadeRespostaSchema,
} from './ficha-plantao.ts';

/** FR-078/FR-081. Resposta JÁ DECIFRADA de campo acrescentado pelo Administrador. O nome e
 * o estado do campo vêm junto porque a resposta precisa ser legível mesmo depois de o campo
 * ser desativado: a ficha antiga continua mostrando o que foi respondido, e a quem. */
export const respostaCampoPlantaoProjetadaSchema = z
  .object({
    campo_id: uuidSchema,
    campo_nome: z.string().trim().min(1).max(120).nullable(),
    campo_ativo: z.boolean(),
    texto: z.string().min(1).max(4000),
    fonte: fonteInformacaoSchema,
    visibilidade: visibilidadeRespostaSchema,
  })
  .strict();
export type RespostaCampoPlantaoProjetada = z.infer<typeof respostaCampoPlantaoProjetadaSchema>;

const vazio = z.object({}).strict();
const instante = z.iso.datetime({ offset: true });

/** Projeção já decifrada no servidor. A segregação de FR-081 é aplicada ANTES: o conteúdo
 * interno não é decifrado para a audiência familiar, em vez de ser decifrado e escondido,
 * e a omissão não indica o teor do omitido. */
export const fichaPlantaoProjetadaSchema = z
  .object({
    registro_id: uuidSchema,
    turno_id: uuidSchema,
    versao: z.number().int().min(1).max(2147483647),
    periodo: periodoPlantaoSchema.nullable(),
    papel_declarado: papelDeclaradoSchema.nullable(),
    atividades: respostaPlantaoSchema.nullable(),
    observacoes: respostaPlantaoSchema.nullable(),
    respostas: z.array(respostaCampoPlantaoProjetadaSchema).max(50),
    autor_usuario_id: uuidSchema,
    registrado_em: instante,
    /** Abertura retroativa declarada (0.7): visível para quem lê o relatório. */
    retroativo: z.boolean(),
  })
  .strict();
export type FichaPlantaoProjetada = z.infer<typeof fichaPlantaoProjetadaSchema>;

/** `origem` sempre `declarada`: FR-077 exige que a pendência escrita nunca se confunda com
 * as quatro derivadas de FR-027/FR-028 em superfície nenhuma. */
export const pendenciaPlantaoHttpSchema = z
  .object({
    pendencia_id: uuidSchema,
    turno_id: uuidSchema,
    versao: z.number().int().min(1).max(2147483647),
    origem: z.literal('declarada'),
    situacao: z.enum(['aberta', 'resolvida']),
    texto: z.string().min(1).max(4000),
    fonte: fonteInformacaoSchema,
    visibilidade: visibilidadeRespostaSchema,
    declarado_por_usuario_id: uuidSchema,
    registrado_em: instante,
    resolvido_por_usuario_id: uuidSchema.nullable(),
    resolvido_em: instante.nullable(),
  })
  .strict();
export type PendenciaPlantaoHttp = z.infer<typeof pendenciaPlantaoHttpSchema>;

export const resultadoFichaPlantaoSchema = z
  .object({
    ficha: fichaPlantaoProjetadaSchema.nullable(),
    pendencias: z.array(pendenciaPlantaoHttpSchema).max(200),
  })
  .strict();
export type ResultadoFichaPlantao = z.infer<typeof resultadoFichaPlantaoSchema>;

export const rascunhoFichaPlantaoProjetadoSchema = z
  .object({
    turno_id: uuidSchema,
    conteudo: conteudoFichaPlantaoSchema,
    atualizado_em: instante,
    publicado: z.literal(false),
  })
  .strict()
  .nullable();
export type RascunhoFichaPlantaoProjetado = z.infer<typeof rascunhoFichaPlantaoProjetadoSchema>;

/** Contrato HTTP isolado da ficha de plantão (FR-073 a FR-077, FR-081). Não registra rota
 * em `rotas.ts`: a exposição depende da flag do turno e das provas de autorização, como nas
 * demais fatias. Uma submissão, uma transação: ou toda a ficha grava, ou nada grava. */
export const fichaPlantaoHttp = {
  /** Leitura da ficha do plantão pelo turno. A ficha é uma por plantão, e por isso o
   * `registro_id` dela É o `turno_id`: sem essa convenção a ficha publicada deixaria de ser
   * recuperável depois de um recarregamento, porque a projeção do banco é chaveada pelo
   * registro. Família não passa por aqui — a audiência familiar continua sendo a de FR-062. */
  consultar: {
    metodo: 'GET',
    caminho: '/api/pacientes/:paciente_id/turnos/:turno_id/ficha-plantao',
    entrada: vazio,
    saida: resultadoFichaPlantaoSchema,
  },
  submeter: {
    metodo: 'POST',
    caminho: '/api/pacientes/:paciente_id/ficha-plantao',
    entrada: submissaoFichaPlantaoSchema,
    saida: resultadoFichaPlantaoSchema,
  },
  consultarRascunho: {
    metodo: 'GET',
    caminho: '/api/pacientes/:paciente_id/turnos/:turno_id/ficha-plantao/rascunho',
    entrada: vazio,
    saida: rascunhoFichaPlantaoProjetadoSchema,
  },
  salvarRascunho: {
    metodo: 'PUT',
    caminho: '/api/pacientes/:paciente_id/turnos/:turno_id/ficha-plantao/rascunho',
    entrada: rascunhoFichaPlantaoSchema,
    saida: rascunhoFichaPlantaoProjetadoSchema,
  },
  /** FR-077 / decisão 0.5 de 20/11/2026. Pendências ESCRITAS do caso, de todos os plantões,
   * para que a carteira as mostre ao lado das quatro derivadas com a origem visível. Reusa a
   * MESMA projeção autorizada da ficha, sem consulta nova e sem caminho de leitura próprio:
   * é a rota de consulta com o turno em aberto, não um segundo acesso ao conteúdo. */
  listarPendencias: {
    metodo: 'GET',
    caminho: '/api/pacientes/:paciente_id/ficha-plantao/pendencias',
    entrada: vazio,
    saida: z.object({ pendencias: z.array(pendenciaPlantaoHttpSchema).max(200) }).strict(),
  },
  resolverPendencia: {
    metodo: 'POST',
    caminho: '/api/pacientes/:paciente_id/ficha-plantao/pendencias/resolucao',
    entrada: resolucaoPendenciaEscritaSchema,
    saida: resultadoFichaPlantaoSchema,
  },
} as const;
