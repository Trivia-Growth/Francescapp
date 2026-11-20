import { z } from 'zod';
import { campoCifradoSchema, chaveIdempotenciaSchema, uuidSchema } from './comum.ts';
import { sinalVitalSchema } from './sinal-vital.ts';
import { itemMedicacaoPrescritaSchema, administracaoMedicacaoSchema } from './medicacao.ts';
import { ocorrenciaTurnoSchema } from './ocorrencia-turno.ts';

const instante = z.iso.datetime({ offset: true });
const observacao = { observacao: campoCifradoSchema.optional() };
export const rotinaTurnoSchema = z.discriminatedUnion('tipo', [
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
    .refine((v) => Date.parse(v.fim) >= Date.parse(v.inicio), 'Janela de sono inválida.'),
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
]);
export const tipoRegistroExecucaoSchema = z.enum([
  'afericao',
  'prescricao',
  'administracao',
  'ocorrencia',
  'rotina',
]);
export const conteudoExecucaoSchema = z.discriminatedUnion('classe', [
  z.object({ classe: z.literal('afericao'), dados: sinalVitalSchema }).strict(),
  z.object({ classe: z.literal('prescricao'), dados: itemMedicacaoPrescritaSchema }).strict(),
  z.object({ classe: z.literal('administracao'), dados: administracaoMedicacaoSchema }).strict(),
  z.object({ classe: z.literal('ocorrencia'), dados: ocorrenciaTurnoSchema }).strict(),
  z.object({ classe: z.literal('rotina'), dados: rotinaTurnoSchema }).strict(),
]);
/** HTTP cleartext DTOs live at the server boundary; this contract is private and encrypted. */
export const gravacaoExecucaoTurnoSchema = z
  .object({
    registro_id: uuidSchema,
    versao: z.number().int().positive().max(2147483647),
    versao_esperada: z.number().int().nonnegative().max(2147483646),
    conteudo: conteudoExecucaoSchema,
    motivo: campoCifradoSchema.optional(),
    chave_idempotencia: chaveIdempotenciaSchema,
    digest_idempotencia: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict()
  .refine(
    (v) => v.versao === v.versao_esperada + 1 && (v.versao === 1 || v.motivo !== undefined),
    'Retificação exige versão anterior e motivo.',
  );
export const consultaExecucaoTurnoSchema = z
  .object({
    registro_id: uuidSchema.optional(),
    historico: z.boolean().optional(),
    classe: tipoRegistroExecucaoSchema,
    vigente_em: instante.optional(),
    inicio: instante.optional(),
    fim: instante.optional(),
    turno_id: uuidSchema.optional(),
    cursor_instante: instante.optional(),
    cursor_id: uuidSchema.optional(),
    cursor_versao: z.number().int().positive().optional(),
    limite: z.number().int().min(1).max(100).default(25),
  })
  .strict()
  .refine(
    (v) =>
      v.registro_id !== undefined ||
      (v.classe === 'prescricao' && v.vigente_em !== undefined) ||
      (v.inicio !== undefined && v.fim !== undefined && Date.parse(v.fim) > Date.parse(v.inicio)),
    'Período inválido.',
  )
  .refine(
    (v) =>
      [v.cursor_instante, v.cursor_id, v.cursor_versao].every((x) => x === undefined) ||
      [v.cursor_instante, v.cursor_id, v.cursor_versao].every((x) => x !== undefined),
    'Cursor incompleto.',
  )
  .refine((v) => !v.historico || v.registro_id !== undefined, 'Histórico exige registro.');
export const metadadosAadExecucaoTurnoSchema = z
  .object({
    tabela: z.enum([
      'cadastro.turno_medida_versao',
      'cadastro.turno_prescricao_versao',
      'cadastro.turno_administracao_versao',
      'cadastro.turno_ocorrencia_versao',
      'cadastro.turno_fundamento_familiar_versao',
      'cadastro.turno_exportacao_pdf',
      'cadastro.turno_localizacao_exportacao',
    ]),
    paciente_id: uuidSchema,
    turno_id: uuidSchema.nullable(),
    registro_id: uuidSchema,
    versao: z.number().int().positive().max(2147483647),
    campo: z.enum([
      'nome',
      'dose',
      'via',
      'fonte_documental',
      'executor_nome',
      'executor_vinculo',
      'motivo',
      'motivo_situacao',
      'descricao',
      'providencia',
      'observacao',
      'fundamento',
      'destinatario',
      'proposito',
    ]),
    formato: z.literal(1),
  })
  .strict();
export const acoesExecucaoTurno = [
  'api.gravar_execucao_turno',
  'api.consultar_execucao_turno',
  'api.consultar_catalogo_turno',
  'api.configurar_catalogo_turno',
  'api.conceder_medicacao_turno',
  'api.consultar_concessoes_medicacao_turno',
  'api.consultar_conversao_ocorrencia_turno',
  'api.converter_ocorrencia_turno',
] as const;
export type RotinaTurno = z.infer<typeof rotinaTurnoSchema>;
export type GravacaoExecucaoTurno = z.infer<typeof gravacaoExecucaoTurnoSchema>;

export const fundamentoFamiliarTurnoSchema = z
  .object({
    familiar_usuario_id: uuidSchema,
    versao_esperada: z.number().int().nonnegative(),
    estado: z.enum(['vigente', 'revogado']),
    fundamento: campoCifradoSchema,
    vigencia_inicio: instante,
    vigencia_fim: instante.nullable(),
    chave_idempotencia: chaveIdempotenciaSchema,
    digest_idempotencia: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict()
  .refine(
    (v) => v.vigencia_fim === null || Date.parse(v.vigencia_fim) > Date.parse(v.vigencia_inicio),
    'Vigência inválida.',
  );
export const consultaRelatorioTurnoSchema = z
  .object({
    consulta_id: uuidSchema.optional(),
    cursor_classe: z.string().max(30).optional(),
    tipo: z.enum(['turno', 'diario', 'semanal', 'caso']),
    turno_id: uuidSchema.optional(),
    inicio: instante,
    fim: instante,
    cursor_instante: instante.optional(),
    cursor_id: uuidSchema.optional(),
    cursor_versao: z.number().int().positive().optional(),
    limite: z.number().int().min(1).max(100).default(25),
  })
  .strict();
export const consentimentoLocalizacaoTurnoSchema = z
  .object({
    versao_esperada: z.number().int().nonnegative(),
    concedido: z.boolean(),
    finalidade: z.literal(
      'Registrar localização declarada pelo aparelho na abertura e encerramento do turno.',
    ),
    audiencia: z.literal('Administrador e case manager do caso.'),
    retencao_dias: z.literal(90),
    chave_idempotencia: chaveIdempotenciaSchema,
    digest_idempotencia: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();
export const localizacaoTurnoSchema = z
  .object({
    turno_id: uuidSchema,
    momento: z.enum(['abertura', 'encerramento']),
    latitude: z.number().finite().min(-90).max(90).optional(),
    longitude: z.number().finite().min(-180).max(180).optional(),
    precisao_metros: z.number().finite().nonnegative().optional(),
    motivo_ausencia: z
      .enum([
        'permissao_negada',
        'indisponivel',
        'falha',
        'consentimento_ausente',
        'consentimento_revogado',
      ])
      .optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.motivo_ausencia
        ? v.latitude === undefined && v.longitude === undefined && v.precisao_metros === undefined
        : v.latitude !== undefined && v.longitude !== undefined && v.precisao_metros !== undefined,
    'Localização ou ausência, exclusivamente.',
  );
