import { z } from 'zod';
import { uuidSchema } from './comum.ts';

/** Financeiro do cuidado — FR-068 (valor acordado), FR-069 (despesa) e FR-070 (apuração).
 *
 * Decisões de contrato registradas aqui porque o `design.md — Open Questions` as deixou
 * para a implementação:
 *
 * - **Moeda e precisão**: inteiro em centavos de BRL (`*_centavos`). Evita ponto flutuante
 *   e dispensa `numeric` no transporte JSON, onde escala não sobrevive. Não há campo de
 *   moeda porque o produto opera em uma só; abrir multimoeda depois é campo novo, aditivo.
 * - **Nenhum campo de duração ou valor-hora** aparece em qualquer schema deste arquivo.
 *   FR-068 e `design.md — Non-Goals` proíbem derivar remuneração da duração do turno, e a
 *   ausência é verificada por teste de contrato, não por convenção.
 * - **Apuração é consulta aberta** (`origem: 'consulta_aberta'`) modelada como união
 *   discriminada de um membro só. Um fechamento travado futuro entra como membro novo da
 *   união, sem quebrar quem já lê o membro atual (design D3).
 */

/** Teto de R$ 10.000.000,00 por lançamento. Não é alçada de aprovação — FR-069 proíbe teto
 * e etapa de aprovação —, é limite de sanidade de entrada, para que um erro de digitação
 * não vire número que nenhuma tela consegue apresentar. Recusa é `entrada_invalida`. */
export const VALOR_MAXIMO_CENTAVOS = 1_000_000_000;

export const valorCentavosSchema = z
  .number()
  .int()
  .positive()
  .max(VALOR_MAXIMO_CENTAVOS)
  .describe('Valor em centavos de BRL. Nunca valor-hora.');

export const motivoSchema = z.string().trim().min(1).max(2000);
const descricao = z.string().trim().min(1).max(2000);

// --- FR-068: valor acordado de repasse por turno realizado ---------------------------------

/** Vigência por data civil: `fim` nulo significa vigência aberta. A não sobreposição é
 * garantida no banco (design D4); aqui só se verifica a ordem das pontas. */
export const vigenciaValorAcordadoSchema = z
  .object({ inicio: z.iso.date(), fim: z.iso.date().nullable() })
  .strict()
  .refine(({ inicio, fim }) => fim === null || fim > inicio, {
    message: 'O fim da vigência precisa ser posterior ao início.',
  });

export const registrarValorAcordadoSchema = z
  .object({
    valor_id: uuidSchema,
    profissional_usuario_id: uuidSchema,
    valor_turno_centavos: valorCentavosSchema,
    vigencia: vigenciaValorAcordadoSchema,
    motivo: motivoSchema,
  })
  .strict();
export type RegistrarValorAcordado = z.infer<typeof registrarValorAcordadoSchema>;

export const valorAcordadoSchema = z
  .object({
    valor_id: uuidSchema,
    profissional_usuario_id: uuidSchema,
    valor_turno_centavos: valorCentavosSchema,
    vigencia: vigenciaValorAcordadoSchema,
    motivo: motivoSchema,
    autor_usuario_id: uuidSchema,
    registrado_em: z.iso.datetime(),
  })
  .strict();
export type ValorAcordado = z.infer<typeof valorAcordadoSchema>;

/** Alterar valor é registrar nova vigência; a anterior permanece consultável (FR-068).
 * Por isso não existe schema de "editar valor": `encerrar_em` fecha a vigência corrente e
 * o novo valor entra como registro próprio, na mesma transação da RPC. */
export const alterarValorAcordadoSchema = z
  .object({
    valor_id: uuidSchema,
    profissional_usuario_id: uuidSchema,
    valor_turno_centavos: valorCentavosSchema,
    vigencia_anterior_id: uuidSchema,
    vigente_a_partir_de: z.iso.date(),
    motivo: motivoSchema,
  })
  .strict();

export const consultarValorAcordadoSchema = z
  .object({ profissional_usuario_id: uuidSchema })
  .strict();

// --- FR-069: despesa do cuidado ------------------------------------------------------------

/** O comprovante é objeto de repositório privado. O contrato transporta o nome do objeto e
 * os metadados que a política do bucket confere; nunca uma URL, pública ou assinada, porque
 * uma URL sobrevive à revogação da concessão (FR-069, design D5).
 *
 * Formato e limite não foram decididos pelo solicitante: adotados JPEG/PNG/WebP/PDF e 5 MiB,
 * dentro do que FR-029 a FR-031 admitem para anexo. */
export const MIMES_COMPROVANTE = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;
export const TAMANHO_MAXIMO_COMPROVANTE_BYTES = 5_242_880;

export const comprovanteDespesaSchema = z
  .object({
    objeto_nome: z.string().trim().min(1).max(512),
    mime_type: z.enum(MIMES_COMPROVANTE),
    tamanho_bytes: z.number().int().positive().max(TAMANHO_MAXIMO_COMPROVANTE_BYTES),
    digest: z.string().min(1).max(512),
  })
  .strict();

export const registrarDespesaSchema = z
  .object({
    despesa_id: uuidSchema,
    paciente_id: uuidSchema,
    descricao,
    valor_centavos: valorCentavosSchema,
    data: z.iso.date(),
    responsavel_usuario_id: uuidSchema,
    autorizacao: z.string().trim().min(1).max(512),
    comprovante: comprovanteDespesaSchema,
  })
  .strict();
export type RegistrarDespesa = z.infer<typeof registrarDespesaSchema>;

export const retificarDespesaSchema = z
  .object({
    despesa_id: uuidSchema,
    retificacao_id: uuidSchema,
    descricao,
    valor_centavos: valorCentavosSchema,
    data: z.iso.date(),
    responsavel_usuario_id: uuidSchema,
    autorizacao: z.string().trim().min(1).max(512),
    motivo: motivoSchema,
  })
  .strict();

export const despesaSchema = z
  .object({
    despesa_id: uuidSchema,
    paciente_id: uuidSchema,
    descricao,
    valor_centavos: valorCentavosSchema,
    data: z.iso.date(),
    responsavel_usuario_id: uuidSchema,
    autorizacao: z.string().trim().min(1).max(512),
    comprovante: comprovanteDespesaSchema,
    autor_usuario_id: uuidSchema,
    registrado_em: z.iso.datetime(),
    /** Versão 1 é o lançamento original; retificação cria versão nova e nada é apagado. */
    versao: z.number().int().positive().max(2147483647),
    retificacao_de_versao: z.number().int().positive().max(2147483647).nullable(),
    motivo_retificacao: motivoSchema.nullable(),
  })
  .strict();
export type Despesa = z.infer<typeof despesaSchema>;

// --- FR-070: apuração de repasse -----------------------------------------------------------

/** Uma linha por turno do período. `apurada` carrega valor e a vigência aplicada, de modo
 * que o total seja reconstituível; as duas pendências carregam o turno identificado e
 * valor nulo, sem presumir nada (FR-070).
 *
 * O que NÃO entra aqui é tão parte do contrato quanto o que entra: nenhuma passagem,
 * aferição, medicação, rotina, ocorrência, `paciente_id` ou `parametros` do turno
 * (design D6). `.strict()` transforma qualquer vazamento desses em falha de schema. */
export const linhaApuracaoSchema = z.discriminatedUnion('situacao', [
  z
    .object({
      situacao: z.literal('apurada'),
      turno_id: uuidSchema,
      profissional_usuario_id: uuidSchema,
      data: z.iso.datetime(),
      valor_centavos: valorCentavosSchema,
      vigencia_id: uuidSchema,
    })
    .strict(),
  z
    .object({
      situacao: z.literal('pendente_resolucao'),
      turno_id: uuidSchema,
      profissional_usuario_id: uuidSchema,
      data: z.null(),
      valor_centavos: z.null(),
      vigencia_id: z.null(),
    })
    .strict(),
  z
    .object({
      situacao: z.literal('pendente_valor'),
      turno_id: uuidSchema,
      profissional_usuario_id: uuidSchema,
      data: z.iso.datetime(),
      valor_centavos: z.null(),
      vigencia_id: z.null(),
    })
    .strict(),
]);
export type LinhaApuracao = z.infer<typeof linhaApuracaoSchema>;

export const consultarApuracaoSchema = z
  .object({
    profissional_usuario_id: uuidSchema,
    periodo_inicio: z.iso.date(),
    periodo_fim: z.iso.date(),
  })
  .strict()
  .refine(({ periodo_inicio, periodo_fim }) => periodo_fim >= periodo_inicio, {
    message: 'O fim do período não pode anteceder o início.',
  });
export type ConsultarApuracao = z.infer<typeof consultarApuracaoSchema>;

/** `origem` é o ponto de extensão de D3: enquanto não houver ciclo travado existe um único
 * membro, `consulta_aberta`, sempre com o instante da consulta. Um fechamento gravado entra
 * depois como membro novo da união — aditivo, sem quebrar este. */
export const apuracaoRepasseSchema = z.discriminatedUnion('origem', [
  z
    .object({
      origem: z.literal('consulta_aberta'),
      /** Instante da consulta: duas apurações do mesmo período após uma retificação
       * precisam ser distinguíveis (FR-070). Nunca opcional. */
      consultado_em: z.iso.datetime(),
      profissional_usuario_id: uuidSchema,
      periodo_inicio: z.iso.date(),
      periodo_fim: z.iso.date(),
      linhas: z.array(linhaApuracaoSchema).max(1000),
      total_centavos: z.number().int().min(0).max(VALOR_MAXIMO_CENTAVOS),
      pendentes: z.number().int().min(0).max(1000),
    })
    .strict(),
]);
export type ApuracaoRepasse = z.infer<typeof apuracaoRepasseSchema>;

// --- Superfície HTTP: listagem e audiência --------------------------------------------------

/** Uma versão da despesa como ela sai da listagem. Difere de `despesaSchema` porque a
 * retificação (versão > 1) NÃO carrega comprovante — o CHECK
 * `despesa_original_tem_comprovante_chk` prende o comprovante à versão 1 —, e porque a
 * listagem devolve apenas o nome do objeto, sem mime, tamanho nem digest. Em vez de
 * inventar metadados que o banco não devolveu, a listagem informa somente se existe
 * comprovante a buscar; os bytes continuam vindo por leitura autorizada própria. */
export const despesaVersaoSchema = despesaSchema
  .omit({ comprovante: true })
  .extend({ tem_comprovante: z.boolean() })
  .strict();
export type DespesaVersao = z.infer<typeof despesaVersaoSchema>;

/** Resposta da sondagem de audiência. Booleano e nada mais: a tela usa isto apenas para não
 * apresentar superfície financeira a quem não tem audiência. Esconder não é autorizar — cada
 * operação financeira continua sendo autorizada no servidor e no banco. */
export const audienciaFinanceiraSchema = z.object({ permitida: z.boolean() }).strict();
export type AudienciaFinanceira = z.infer<typeof audienciaFinanceiraSchema>;

/** Bytes do comprovante em base64, enviados depois que o lançamento já existe: a política do
 * repositório confere o nome do objeto contra a despesa gravada. O limite é o mesmo do balde
 * e do CHECK da tabela, conferido aqui só para recusar o corpo antes de decodificá-lo. */
export const envioComprovanteSchema = z
  .object({
    arquivo_base64: z
      .string()
      .min(1)
      .max(Math.ceil(TAMANHO_MAXIMO_COMPROVANTE_BYTES / 3) * 4)
      .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
    mime_type: z.enum(MIMES_COMPROVANTE),
    tamanho_bytes: z.number().int().positive().max(TAMANHO_MAXIMO_COMPROVANTE_BYTES),
  })
  .strict();
export type EnvioComprovante = z.infer<typeof envioComprovanteSchema>;
