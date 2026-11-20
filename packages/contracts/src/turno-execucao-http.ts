import {
  epocaExecucaoTurnoSchema,
  reconciliarExecucaoTurnoSchema,
  reconhecerExecucaoTurnoSchema,
  estadoBarreiraExecucaoTurnoSchema,
} from './turno-execucao-barreira.ts';
import { z } from 'zod';
import { uuidSchema } from './comum.ts';
import { sinalVitalSchema } from './sinal-vital.ts';
import {
  consultaExecucaoTurnoSchema,
  consultaRelatorioTurnoSchema,
  consentimentoLocalizacaoTurnoSchema,
  localizacaoTurnoSchema,
} from './turno-execucao.ts';
import { turnoSchema } from './turno.ts';
import { converterDiarioTarefaSchema } from './conversao-diario-tarefa.ts';
const instante = z.iso.datetime({ offset: true });
const texto = z
  .string()
  .trim()
  .min(1)
  .max(8000)
  .refine(
    (v) => new TextEncoder().encode(v).byteLength <= 16_000,
    'Texto excede o limite de envio.',
  );
const versao = z.number().int().positive().max(2147483647);
const vazia = z.object({}).strict();
export const prescricaoTurnoPublicaSchema = z
  .object({
    nome: texto,
    dose: texto,
    via: texto,
    horarios: z
      .array(z.iso.time({ precision: 0 }))
      .min(1)
      .max(48),
    vigencia_inicio: instante,
    vigencia_fim: instante.nullable(),
    fonte_documental: texto,
  })
  .strict()
  .refine(
    (v) => v.vigencia_fim === null || Date.parse(v.vigencia_fim) >= Date.parse(v.vigencia_inicio),
    'Vigência inválida.',
  );
export const administracaoTurnoPublicaSchema = z
  .object({
    turno_id: uuidSchema,
    item_id: uuidSchema,
    versao,
    executor: z.object({ nome: texto, vinculo: texto }).strict(),
    situacao: z.enum(['administrado', 'recusado', 'adiado', 'nao_administrado']),
    motivo: texto.optional(),
  })
  .strict()
  .refine((v) => v.situacao === 'administrado' || v.motivo !== undefined, 'Situação exige motivo.');
export const ocorrenciaTurnoPublicaSchema = z
  .object({
    turno_id: uuidSchema,
    descricao: texto,
    instante_ocorrencia: instante,
    providencia: texto,
    anexo_documento_id: uuidSchema.optional(),
  })
  .strict();
const observacao = { observacao: texto.optional() };
export const rotinaTurnoPublicaSchema = z.discriminatedUnion('tipo', [
  z
    .object({
      tipo: z.literal('refeicao'),
      turno_id: uuidSchema,
      instante_ocorrencia: instante,
      momento: z.enum(['cafe', 'almoco', 'lanche', 'jantar', 'ceia']),
      aceitacao: z.enum(['total', 'parcial', 'minima', 'recusou']),
      ...observacao,
    })
    .strict(),
  z
    .object({
      tipo: z.literal('hidratacao'),
      turno_id: uuidSchema,
      instante_ocorrencia: instante,
      mililitros: z.number().finite().nonnegative(),
      ...observacao,
    })
    .strict(),
  z
    .object({
      tipo: z.literal('sono'),
      turno_id: uuidSchema,
      instante_ocorrencia: instante,
      inicio: instante,
      fim: instante,
      qualidade: z.enum(['tranquilo', 'agitado', 'nao_dormiu']),
      ...observacao,
    })
    .strict()
    .refine((v) => Date.parse(v.fim) >= Date.parse(v.inicio), 'Janela inválida.'),
  z
    .object({
      tipo: z.literal('eliminacao'),
      turno_id: uuidSchema,
      instante_ocorrencia: instante,
      eliminacao: z.enum(['urina', 'fezes']),
      contagem: z.number().int().nonnegative().max(2147483647),
      ...observacao,
    })
    .strict(),
  // Estado emocional observado (FR-076). O termo vem do catálogo administrado
  // `cadastro.turno_estado_emocional_catalogo`, por isso é texto limitado e não enum fechado
  // como a qualidade do sono: o conjunto é vocabulário do cliente, não contrato.
  //
  // NÃO existe campo de valor, pontuação, escala ou gravidade — e a ausência é deliberada.
  // Sem número não há como derivar risco a partir deste registro, o que torna a proibição
  // de FR-076 e FR-081 inviável por esquema, e não apenas escrita em texto.
  z
    .object({
      tipo: z.literal('estado_emocional'),
      turno_id: uuidSchema,
      instante_ocorrencia: instante,
      qualidade: z.string().min(1).max(80),
      ...observacao,
    })
    .strict(),
]);
export const conteudoExecucaoPublicoSchema = z.discriminatedUnion('classe', [
  z.object({ classe: z.literal('afericao'), dados: sinalVitalSchema }).strict(),
  z.object({ classe: z.literal('prescricao'), dados: prescricaoTurnoPublicaSchema }).strict(),
  z.object({ classe: z.literal('administracao'), dados: administracaoTurnoPublicaSchema }).strict(),
  z.object({ classe: z.literal('ocorrencia'), dados: ocorrenciaTurnoPublicaSchema }).strict(),
  z.object({ classe: z.literal('rotina'), dados: rotinaTurnoPublicaSchema }).strict(),
]);
export const gravarExecucaoPublicaSchema = z
  .object({
    epoca: epocaExecucaoTurnoSchema,
    registro_id: uuidSchema,
    versao_esperada: z.number().int().nonnegative().max(2147483646),
    conteudo: conteudoExecucaoPublicoSchema,
    motivo: texto.optional(),
  })
  .strict()
  .refine(
    (v) => (v.versao_esperada === 0 ? v.motivo === undefined : v.motivo !== undefined),
    'Motivo pertence à retificação.',
  );
export const registroExecucaoPublicoSchema = z
  .object({
    paciente_id: uuidSchema,
    turno_id: uuidSchema.nullable(),
    registro_id: uuidSchema,
    versao,
    conteudo: conteudoExecucaoPublicoSchema,
    motivo: texto.optional(),
    registrador_usuario_id: uuidSchema,
    registrador_nome: z.string().nullable(),
    prescricao_referenciada: z
      .object({ nome: texto, dose: texto, via: texto, versao })
      .strict()
      .optional(),
    criado_em: instante,
    instante_ocorrencia: instante,
    retificada: z.boolean(),
  })
  .strict();
const cursor = z.object({ instante, id: uuidSchema, versao }).strict();
const paginaExecucao = z
  .object({ itens: z.array(registroExecucaoPublicoSchema), proximo_cursor: cursor.nullable() })
  .strict();
export const candidatoTurnoPublicoSchema = z
  .object({
    usuario_id: uuidSchema,
    nome: z.string().nullable(),
    concedida: z.boolean().optional(),
  })
  .strict();
const paginaCandidatos = z
  .object({
    itens: z.array(candidatoTurnoPublicoSchema),
    proximo_cursor: uuidSchema.nullable(),
    pode_gerir: z.boolean(),
  })
  .strict();
const consultaCandidatos = z
  .object({
    cursor_id: uuidSchema.optional(),
    limite: z.number().int().min(1).max(100).default(25),
  })
  .strict();
export const catalogoTurnoPublicoSchema = z
  .object({
    tipo: z.string().min(1).max(80),
    unidade: z.string().max(30).nullable(),
    ativo: z.boolean(),
    observacao: z.boolean(),
    referencia_informativa: z.string().max(300).nullable(),
  })
  .strict();
const fundamentoEntrada = z
  .object({
    familiar_usuario_id: uuidSchema,
    versao_esperada: z.number().int().nonnegative(),
    estado: z.enum(['vigente', 'revogado']),
    fundamento: texto,
    vigencia_inicio: instante,
    vigencia_fim: instante.nullable(),
  })
  .strict()
  .refine(
    (v) => v.vigencia_fim === null || Date.parse(v.vigencia_fim) > Date.parse(v.vigencia_inicio),
  );
const fundamentoSaida = z
  .object({
    paciente_id: uuidSchema,
    familiar_usuario_id: uuidSchema,
    versao,
    estado: z.enum(['vigente', 'revogado']),
    fundamento: texto,
    vigencia_inicio: instante,
    vigencia_fim: instante.nullable(),
    autor_usuario_id: uuidSchema,
    registrado_em: instante,
  })
  .strict()
  .nullable();
const passagem = z
  .object({
    turno_id: uuidSchema,
    registro_id: uuidSchema,
    versao,
    autor_usuario_id: uuidSchema,
    autor_nome: z.string().nullable(),
    publicado_em: instante,
    audiencia: z.enum(['equipe', 'equipe_e_familia']),
    conteudo: z.string(),
  })
  .strict();
const evento = z
  .object({
    categoria: z.enum([
      'turno',
      'passagem',
      'afericao',
      'prescricao',
      'administracao',
      'ocorrencia',
      'rotina',
    ]),
    id: uuidSchema,
    versao,
    instante,
    anexos: z
      .array(
        z
          .object({
            anexo_id: uuidSchema,
            mime_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
            tamanho_bytes: z.number().int().positive(),
          })
          .strict(),
      )
      .optional(),
    dados: z.union([
      registroExecucaoPublicoSchema,
      turnoSchema.safeExtend({ profissional_nome: z.string().nullable() }),
      passagem,
    ]),
  })
  .strict();
export const relatorioTurnoPublicoSchema = z
  .object({
    consulta_id: uuidSchema,
    instante_corte: instante,
    rotulos_atuais: z.literal(true),
    tipo: z.enum(['turno', 'diario', 'semanal', 'caso']),
    paciente_id: uuidSchema,
    inicio: instante,
    fim: instante,
    itens: z.array(evento),
    proximo_cursor: cursor.extend({ classe: z.string().max(30) }).nullable(),
    lacunas: z.array(z.object({ inicio: instante, fim: instante }).strict()),
  })
  .strict();
export const pedidoPdfTurnoSchema = consultaRelatorioTurnoSchema
  .omit({
    cursor_classe: true,
    cursor_instante: true,
    cursor_id: true,
    cursor_versao: true,
    limite: true,
  })
  .extend({ exportacao_id: uuidSchema, destinatario: texto, proposito: texto })
  .strict();
export const TAMANHO_MAXIMO_ANEXO_TURNO = 3 * 1024 * 1024;
export const TAMANHO_MAXIMO_PDF_TURNO = 4 * 1024 * 1024;
const anexo = z
  .object({
    anexo_id: uuidSchema,
    ocorrencia_id: uuidSchema,
    mime_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    tamanho_bytes: z
      .number()
      .int()
      .positive()
      .max(3 * 1024 * 1024),
    audiencia: z.enum(['equipe', 'equipe_e_familia']),
  })
  .strict();
const consentimentoSaida = z
  .object({
    usuario_id: uuidSchema,
    versao,
    concedido: z.boolean(),
    finalidade: z.string(),
    audiencia: z.string(),
    retencao_dias: z.literal(90),
    registrado_em: instante,
  })
  .strict()
  .nullable();
const base = '/api/pacientes/:paciente_id/execucao-turno';
const rota = <I extends z.ZodType, O extends z.ZodType>(
  metodo: 'GET' | 'POST',
  caminho: string,
  entrada: I,
  saida: O,
) => ({ metodo, caminho: `${base}${caminho}`, entrada, saida });
export const turnoExecucaoHttp = {
  reconciliar: rota(
    'POST',
    '/reconciliar',
    reconciliarExecucaoTurnoSchema,
    estadoBarreiraExecucaoTurnoSchema,
  ),
  reconhecer: rota(
    'POST',
    '/reconhecer',
    reconhecerExecucaoTurnoSchema,
    estadoBarreiraExecucaoTurnoSchema,
  ),
  prescricoesVigentes: rota(
    'GET',
    '/medicacao/prescricoes-vigentes',
    z
      .object({
        vigente_em: instante.optional(),
        cursor_instante: instante.optional(),
        cursor_id: uuidSchema.optional(),
        cursor_versao: versao.optional(),
        limite: z.number().int().min(1).max(100).default(25),
      })
      .strict(),
    paginaExecucao.extend({ vigente_em: instante }).strict(),
  ),
  consultar: rota('GET', '', consultaExecucaoTurnoSchema, paginaExecucao),
  gravar: rota(
    'POST',
    '',
    gravarExecucaoPublicaSchema,
    registroExecucaoPublicoSchema.extend({ recibo_id: uuidSchema }).strict(),
  ),
  catalogo: rota('GET', '/catalogo', vazia, z.array(catalogoTurnoPublicoSchema)),
  configurarCatalogo: rota(
    'POST',
    '/catalogo',
    z
      .object({
        tipo: z.string().min(1).max(80),
        ativo: z.boolean(),
        referencia_informativa: z.string().max(300).nullable(),
      })
      .strict(),
    z.array(catalogoTurnoPublicoSchema),
  ),
  candidatosMedicacao: rota('GET', '/medicacao/concessoes', consultaCandidatos, paginaCandidatos),
  concederMedicacao: rota(
    'POST',
    '/medicacao/concessoes',
    z.object({ usuario_id: uuidSchema, concedida: z.boolean() }).strict(),
    z.object({ usuario_id: uuidSchema, concedida: z.boolean() }).strict(),
  ),
  familiares: rota('GET', '/familiares', consultaCandidatos, paginaCandidatos),
  consultarFundamento: rota(
    'GET',
    '/fundamento',
    z.object({ familiar_usuario_id: uuidSchema }).strict(),
    fundamentoSaida,
  ),
  gravarFundamento: rota('POST', '/fundamento', fundamentoEntrada, fundamentoSaida),
  consultarConversaoOcorrencia: rota(
    'GET',
    '/ocorrencia/converter',
    z.object({ registro_id: uuidSchema }).strict(),
    z.object({ tarefa_id: uuidSchema, evolucao_id: uuidSchema }).strict().nullable(),
  ),
  converterOcorrencia: rota(
    'POST',
    '/ocorrencia/converter',
    converterDiarioTarefaSchema.extend({ registro_id: uuidSchema }).strict(),
    z.object({ tarefa_id: uuidSchema, evolucao_id: uuidSchema }).strict(),
  ),
  relatorio: rota('GET', '/relatorio', consultaRelatorioTurnoSchema, relatorioTurnoPublicoSchema),
  consultarPdf: rota(
    'GET',
    '/pdf',
    z.object({ exportacao_id: uuidSchema }).strict(),
    z.object({ exportacao_id: uuidSchema, registrado_em: instante }).strict().nullable(),
  ),
  consultarPdfLocalizacao: rota(
    'GET',
    '/localizacao/pdf',
    z.object({ turno_id: uuidSchema, exportacao_id: uuidSchema }).strict(),
    z.object({ exportacao_id: uuidSchema, registrado_em: instante }).strict().nullable(),
  ),
  exportarLocalizacao: rota(
    'POST',
    '/localizacao/pdf',
    z
      .object({
        turno_id: uuidSchema,
        exportacao_id: uuidSchema,
        destinatario: texto,
        proposito: texto,
      })
      .strict(),
    z.instanceof(Uint8Array),
  ),
  pdf: rota('POST', '/pdf', pedidoPdfTurnoSchema, z.instanceof(Uint8Array)),
  consentimento: rota('GET', '/consentimento', vazia, consentimentoSaida),
  gravarConsentimento: rota(
    'POST',
    '/consentimento',
    consentimentoLocalizacaoTurnoSchema.omit({
      chave_idempotencia: true,
      digest_idempotencia: true,
    }),
    consentimentoSaida,
  ),
  registrarLocalizacao: rota(
    'POST',
    '/localizacao',
    localizacaoTurnoSchema,
    z.object({ registrado: z.boolean() }).strict(),
  ),
  consultarLocalizacao: rota(
    'GET',
    '/localizacao',
    z.object({ turno_id: uuidSchema }).strict(),
    z
      .object({
        itens: z.array(
          z
            .object({
              turno_id: uuidSchema,
              momento: z.enum(['abertura', 'encerramento']),
              versao: z.number().int().min(0).max(1),
              usuario_id: uuidSchema,
              consentimento_versao: z.number().int().nullable(),
              latitude: z.number().nullable(),
              longitude: z.number().nullable(),
              precisao_metros: z.number().nullable(),
              motivo_ausencia: z.string().nullable(),
              registrado_em: instante,
              declarada_pelo_aparelho: z.boolean(),
            })
            .strict(),
        ),
        ausencia: z.literal('retencao_expirada').optional(),
      })
      .strict(),
  ),
  anexos: rota(
    'GET',
    '/anexos',
    z
      .object({
        ocorrencia_id: uuidSchema,
        cursor_id: uuidSchema.optional(),
        limite: z.number().int().min(1).max(100).default(25),
      })
      .strict(),
    z.object({ itens: z.array(anexo), proximo_cursor: uuidSchema.nullable() }).strict(),
  ),
  enviarAnexo: rota(
    'POST',
    '/anexos',
    anexo
      .extend({ ocorrencia_versao: versao, arquivo_base64: z.string().max(4 * 1024 * 1024) })
      .strict(),
    anexo,
  ),
  baixarAnexo: rota('GET', '/anexos/:anexo_id', vazia, z.instanceof(Uint8Array)),
} as const;
export type OperacaoExecucaoTurno = keyof typeof turnoExecucaoHttp;
export type ComandoExecucaoTurno = {
  [K in OperacaoExecucaoTurno]: {
    operacao: K;
    paciente_id: string;
    anexo_id?: string;
    entrada: z.output<(typeof turnoExecucaoHttp)[K]['entrada']>;
  };
}[OperacaoExecucaoTurno];

export type ConteudoExecucaoPublico = z.output<typeof conteudoExecucaoPublicoSchema>;
export type RegistroExecucaoPublico = z.output<typeof registroExecucaoPublicoSchema>;
export type CatalogoTurnoPublico = z.output<typeof catalogoTurnoPublicoSchema>;
export type CandidatoTurnoPublico = z.output<typeof candidatoTurnoPublicoSchema>;
export type RelatorioTurnoPublico = z.output<typeof relatorioTurnoPublicoSchema>;
