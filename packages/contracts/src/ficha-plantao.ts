import { z } from 'zod';
import { campoCifradoSchema, uuidSchema } from './comum.ts';

/** FR-073 a FR-077 e FR-081: ficha de plantão do Acompanhante Terapêutico e da enfermagem.
 *
 * A ficha é SUPERFÍCIE DE ENTRADA, não armazenamento novo. Alimentação, medicação e
 * intercorrência continuam vivendo nas tabelas canônicas de FR-059/FR-060/FR-061/FR-064 e
 * são gravadas pelos transportes canônicos que o servidor compõe, nunca como texto livre
 * desta ficha. O que não tinha lugar — período do plantão, estado emocional,
 * atividades/observações do plantão e pendência escrita — ganha lugar próprio aqui.
 *
 * Nada neste contrato produz diagnóstico, gravidade, risco, tendência ou alerta: não há
 * campo numérico, de pontuação ou de classificação em lugar nenhum, e `.strict()` recusa
 * qualquer chave desconhecida que tentasse introduzir um. É o limite de FR-064, FR-028 e
 * FR-081, preso também no esquema do banco (estado emocional não tem coluna de valor). */

/** FR-075. Conjunto administrado; o período é DECLARADO pelo profissional e nunca inferido
 * do relógio. Não se confunde com o tipo de escala de FR-056. */
export const periodoPlantaoSchema = z.enum(['diurno', 'noturno']);
export type PeriodoPlantao = z.infer<typeof periodoPlantaoSchema>;

/** FR-081, primeiro cenário: fonte da informação POR RESPOSTA, em conjunto fechado. */
export const fonteInformacaoSchema = z.enum([
  'observacao_direta',
  'relato_paciente',
  'relato_familiar',
  'documento',
]);
export type FonteInformacao = z.infer<typeof fonteInformacaoSchema>;

/** FR-081, segundo cenário: segregação entre nota interna e conteúdo compartilhável. A
 * aplicação da segregação é do servidor, na projeção; aqui só se declara. */
export const visibilidadeRespostaSchema = z.enum(['interna', 'compartilhavel']);
export type VisibilidadeResposta = z.infer<typeof visibilidadeRespostaSchema>;

const texto = z.string().trim().min(1).max(4000);
const instante = z.iso.datetime({ offset: true });

/** FR-079: rótulo de registro, jamais permissão. Enviar um papel de maior alcance aparente
 * não altera autorização nenhuma — perfil e vínculo continuam sendo os únicos controles. */
export const papelDeclaradoSchema = z.string().trim().min(1).max(80);

/** Resposta de texto do plantão com os dois atributos de FR-081. */
export const respostaPlantaoSchema = z
  .object({
    texto,
    fonte: fonteInformacaoSchema,
    visibilidade: visibilidadeRespostaSchema,
  })
  .strict();
export type RespostaPlantao = z.infer<typeof respostaPlantaoSchema>;

/** FR-076. Observação declarada, não medida clínica: há rótulo de estado, instante e autor,
 * e NÃO há valor, nota, escala ou classificação. O conjunto de estados é administrado no
 * banco; aqui o termo é apenas texto curto conferido contra o catálogo pelo servidor. */
export const estadoEmocionalObservadoSchema = z
  .object({
    estado: z.string().trim().min(1).max(80),
    instante_ocorrencia: instante,
  })
  .strict();
export type EstadoEmocionalObservado = z.infer<typeof estadoEmocionalObservadoSchema>;

/** FR-077. Pendência ESCRITA por pessoa, distinta das quatro derivadas de FR-027/FR-028.
 * A origem declarada não é um campo que o cliente escolhe: é estrutural, vem da tabela. */
export const pendenciaEscritaSchema = z
  .object({
    pendencia_id: uuidSchema,
    conteudo: respostaPlantaoSchema,
  })
  .strict();
export type PendenciaEscrita = z.infer<typeof pendenciaEscritaSchema>;

export const resolucaoPendenciaEscritaSchema = z
  .object({
    pendencia_id: uuidSchema,
    versao_esperada: z.number().int().min(1).max(2147483646),
    motivo: texto,
  })
  .strict();
export type ResolucaoPendenciaEscrita = z.infer<typeof resolucaoPendenciaEscritaSchema>;

/** 0.7 (P5 resolvida). A ficha exige turno aberto. O esquecimento se resolve declarando a
 * janela real: o instante do servidor (`aberto_em`) NUNCA é substituído, os dois ficam
 * gravados lado a lado e o teto é a tolerância já administrada do turno. */
export const janelaDeclaradaSchema = z
  .object({ inicio: instante, fim: instante })
  .strict()
  .refine(({ inicio, fim }) => Date.parse(fim) >= Date.parse(inicio), {
    message: 'A janela declarada termina antes de começar.',
  });
export type JanelaDeclarada = z.infer<typeof janelaDeclaradaSchema>;

/** Conteúdo do plantão. Nenhum campo nasce obrigatório (0.4): a obrigatoriedade é ato do
 * Administrador pela tela do modelo, que não é desta fatia. */
export const conteudoFichaPlantaoSchema = z
  .object({
    periodo: periodoPlantaoSchema.optional(),
    janela_declarada: janelaDeclaradaSchema.optional(),
    papel_declarado: papelDeclaradoSchema.optional(),
    atividades: respostaPlantaoSchema.optional(),
    observacoes: respostaPlantaoSchema.optional(),
    estado_emocional: estadoEmocionalObservadoSchema.optional(),
    pendencias: z.array(pendenciaEscritaSchema).max(20).optional(),
  })
  .strict();
export type ConteudoFichaPlantao = z.infer<typeof conteudoFichaPlantaoSchema>;

/** Submissão única (FR-073). As gravações canônicas — refeição, hidratação, administração
 * de medicação, intercorrência — NÃO entram neste contrato como conteúdo: elas seguem pelo
 * caminho canônico de FR-059/FR-060/FR-061/FR-064, cujos transportes a RPC da ficha executa
 * na MESMA transação. O cliente não os compõe porque não assina atestado; quem compõe é o
 * servidor. A ficha não guarda esse conteúdo: ela o encaminha. */
export const submissaoFichaPlantaoSchema = z
  .object({
    turno_id: uuidSchema,
    registro_id: uuidSchema,
    versao_esperada: z.number().int().min(0).max(2147483646),
    conteudo: conteudoFichaPlantaoSchema,
    motivo: texto.optional(),
  })
  .strict()
  .refine(({ versao_esperada, motivo }) => versao_esperada === 0 || !!motivo, {
    message: 'A correção de ficha publicada exige motivo.',
  })
  .refine(({ versao_esperada, motivo }) => versao_esperada !== 0 || motivo === undefined, {
    message: 'A primeira versão da ficha não leva motivo.',
  });
export type SubmissaoFichaPlantao = z.infer<typeof submissaoFichaPlantaoSchema>;

/** FR-074, D6. Rascunho no servidor, cifrado, uma linha por (turno, autor). `localStorage`
 * foi descartado: deixaria conteúdo clínico em claro no aparelho de plantão compartilhado. */
export const rascunhoFichaPlantaoSchema = z
  .object({ turno_id: uuidSchema, conteudo: conteudoFichaPlantaoSchema })
  .strict();
export type RascunhoFichaPlantao = z.infer<typeof rascunhoFichaPlantaoSchema>;

const registroPlantaoSchema = z
  .object({
    registro_id: uuidSchema,
    paciente_id: uuidSchema,
    turno_id: uuidSchema,
    versao: z.number().int().min(1).max(2147483647),
    periodo: periodoPlantaoSchema.nullable(),
    papel_declarado: papelDeclaradoSchema.nullable(),
    atividades: campoCifradoSchema.nullable(),
    atividades_fonte: fonteInformacaoSchema.nullable(),
    atividades_visibilidade: visibilidadeRespostaSchema.nullable(),
    observacoes: campoCifradoSchema.nullable(),
    observacoes_fonte: fonteInformacaoSchema.nullable(),
    observacoes_visibilidade: visibilidadeRespostaSchema.nullable(),
    autor_usuario_id: uuidSchema,
    registrado_em: instante,
    retroativo: z.boolean(),
  })
  .strict();
export type RegistroPlantao = z.infer<typeof registroPlantaoSchema>;

/** FR-077, segundo cenário: `origem` é sempre `declarada` nesta projeção, para que a
 * pendência escrita nunca se confunda com as quatro derivadas da carteira. */
export const pendenciaPlantaoProjetadaSchema = z
  .object({
    pendencia_id: uuidSchema,
    paciente_id: uuidSchema,
    turno_id: uuidSchema,
    versao: z.number().int().min(1).max(2147483647),
    origem: z.literal('declarada'),
    situacao: z.enum(['aberta', 'resolvida']),
    conteudo: campoCifradoSchema,
    fonte: fonteInformacaoSchema,
    visibilidade: visibilidadeRespostaSchema,
    declarado_por_usuario_id: uuidSchema,
    autor_usuario_id: uuidSchema,
    registrado_em: instante,
    resolvido_por_usuario_id: uuidSchema.nullable(),
    resolvido_em: instante.nullable(),
  })
  .strict();
export type PendenciaPlantaoProjetada = z.infer<typeof pendenciaPlantaoProjetadaSchema>;

const rascunhoProjetadoSchema = z
  .object({
    rascunho_id: uuidSchema,
    turno_id: uuidSchema,
    paciente_id: uuidSchema,
    conteudo: campoCifradoSchema,
    atualizado_em: instante,
  })
  .strict();

/** Resposta privada do banco; não constitui rota HTTP pública. */
export const respostaFichaPlantaoPrivadaSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      repeticao: z.boolean(),
      dados: z
        .object({
          ficha: registroPlantaoSchema.nullable(),
          pendencias: z.array(pendenciaPlantaoProjetadaSchema),
          rascunho: rascunhoProjetadoSchema.nullable(),
        })
        .strict(),
      request_id: uuidSchema,
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      erro: z
        .object({
          codigo: z.enum([
            'sem_permissao',
            'conflito',
            'conflito_idempotencia',
            'entrada_invalida',
            'servico_indisponivel',
          ]),
        })
        .strict(),
      request_id: uuidSchema,
    })
    .strict(),
]);
export type RespostaFichaPlantaoPrivada = z.infer<typeof respostaFichaPlantaoPrivadaSchema>;
