import { z } from 'zod';

import { cursorSchema, limitePaginaSchema, uuidSchema, versaoSchema } from './comum.ts';

const textoCurtoSchema = z.string().trim().min(1).max(200);
const motivoSchema = z.string().trim().min(1).max(500);

export const nomePacienteSchema = z.string().trim().min(1).max(200);
export const nomePreferenciaSchema = z.string().trim().min(1).max(200);
export const dataNascimentoSchema = z.iso.date();
export const situacaoCasoSchema = z.enum([
  'entrada',
  'ativo',
  'pausado',
  'encerrado',
  'transferido',
]);

export const atualizarPacienteSchema = z
  .object({
    nome: nomePacienteSchema.optional(),
    nome_preferencia: nomePreferenciaSchema.nullable().optional(),
    data_nascimento: dataNascimentoSchema.nullable().optional(),
    situacao: situacaoCasoSchema.optional(),
    responsavel_id: uuidSchema.optional(),
    versao_esperada: versaoSchema,
    motivo: motivoSchema,
  })
  .strict()
  .refine(
    ({
      nome,
      nome_preferencia: nomePreferencia,
      data_nascimento: dataNascimento,
      situacao,
      responsavel_id: responsavelId,
    }) =>
      nome !== undefined ||
      nomePreferencia !== undefined ||
      dataNascimento !== undefined ||
      situacao !== undefined ||
      responsavelId !== undefined,
    'Informe pelo menos um campo do paciente para alterar.',
  );

export const consultaPacientesSchema = z
  .object({
    cursor: cursorSchema.optional(),
    limite: limitePaginaSchema,
  })
  .strict();

export const pacienteBasicoSchema = z
  .object({
    id: uuidSchema,
    nome: nomePacienteSchema,
    nome_preferencia: nomePreferenciaSchema.nullable(),
    versao: versaoSchema,
  })
  .strict();

/** Item da lista de pessoas. A situação só existe na lista do Administrador; `null` significa "a completar". */
export const pacienteListaSchema = pacienteBasicoSchema
  .extend({ situacao: situacaoCasoSchema.nullable().optional() })
  .strict();

export const tipoContatoSchema = z.enum(['email', 'telefone']);

export const contatoEmailSchema = z
  .object({
    tipo: z.literal('email'),
    valor: z.string().trim().email().max(254),
  })
  .strict();

export const contatoTelefoneSchema = z
  .object({
    tipo: z.literal('telefone'),
    valor: z
      .string()
      .trim()
      .min(7)
      .max(32)
      .regex(/^[0-9+()\- .]+$/)
      .regex(/[0-9]/, 'Informe dígitos no telefone.'),
  })
  .strict();

export const novoContatoSchema = z.discriminatedUnion('tipo', [
  contatoEmailSchema,
  contatoTelefoneSchema,
]);

const hojeIso = () => new Date().toISOString().slice(0, 10);

/** Caso novo: todos os campos são exigidos, sem valor padrão (decisão de 08/11/2026). */
export const criarPacienteSchema = z
  .object({
    nome: nomePacienteSchema,
    nome_preferencia: nomePreferenciaSchema,
    data_nascimento: dataNascimentoSchema.refine(
      (data) => data <= hojeIso(),
      'Data de nascimento no futuro.',
    ),
    contatos: z.array(novoContatoSchema).min(1).max(10),
    situacao: situacaoCasoSchema,
    responsavel_id: uuidSchema,
  })
  .strict();

export const atualizarContatoSchema = z.discriminatedUnion('tipo', [
  contatoEmailSchema.extend({
    versao_esperada: versaoSchema,
    motivo: motivoSchema,
  }),
  contatoTelefoneSchema.extend({
    versao_esperada: versaoSchema,
    motivo: motivoSchema,
  }),
]);

export const contatoAdministrativoSchema = z.discriminatedUnion('tipo', [
  contatoEmailSchema.extend({
    id: uuidSchema,
    versao: versaoSchema,
  }),
  contatoTelefoneSchema.extend({
    id: uuidSchema,
    versao: versaoSchema,
  }),
]);

export const pacienteAdministrativoSchema = pacienteBasicoSchema
  .extend({
    data_nascimento: dataNascimentoSchema.nullable(),
    contatos: z.array(contatoAdministrativoSchema),
  })
  .strict();

/** Uma mudança do caso: retrato completo do estado após a gravação, do mais novo ao mais antigo. */
export const acompanhamentoCasoSchema = z
  .object({
    versao: versaoSchema,
    situacao: situacaoCasoSchema.nullable(),
    responsavel_id: uuidSchema.nullable(),
    responsavel_ativo: z.boolean().nullable(),
    ator_id: uuidSchema,
    criado_em: z.string().datetime({ offset: true }),
    /** Ausente só no primeiro retrato, gravado junto do cadastro do caso. */
    motivo: motivoSchema.nullable(),
  })
  .strict();

/** Leitura da edição: só do Administrador. Situação e responsável não vão a outros perfis. */
export const pacienteEdicaoSchema = pacienteAdministrativoSchema
  .extend({ acompanhamento: z.array(acompanhamentoCasoSchema) })
  .strict();

export const criarRelacaoSchema = z
  .object({
    pessoa: z
      .object({
        nome: textoCurtoSchema,
        contatos: z.array(novoContatoSchema).max(10).optional(),
      })
      .strict(),
    descricao_relacao: textoCurtoSchema,
    responsabilidade: textoCurtoSchema.optional(),
  })
  .strict();

export const atualizarRelacaoSchema = z
  .object({
    descricao_relacao: textoCurtoSchema.optional(),
    responsabilidade: textoCurtoSchema.nullable().optional(),
    versao_esperada: versaoSchema,
    motivo: motivoSchema,
  })
  .strict()
  .refine(
    ({ descricao_relacao: descricaoRelacao, responsabilidade }) =>
      descricaoRelacao !== undefined || responsabilidade !== undefined,
    'Informe pelo menos um campo da relação para alterar.',
  );

export const criarAcessoPacienteSchema = z
  .object({
    usuario_id: uuidSchema,
    motivo: motivoSchema,
  })
  .strict();

export const revogarAcessoPacienteSchema = z
  .object({
    versao_esperada: versaoSchema,
    motivo: motivoSchema,
  })
  .strict();

export type CriarPaciente = z.infer<typeof criarPacienteSchema>;
export type AtualizarPaciente = z.infer<typeof atualizarPacienteSchema>;
export type PacienteBasico = z.infer<typeof pacienteBasicoSchema>;
export type PacienteLista = z.infer<typeof pacienteListaSchema>;
export type PacienteAdministrativo = z.infer<typeof pacienteAdministrativoSchema>;
export type SituacaoCaso = z.infer<typeof situacaoCasoSchema>;
export type AcompanhamentoCaso = z.infer<typeof acompanhamentoCasoSchema>;
export type PacienteEdicao = z.infer<typeof pacienteEdicaoSchema>;
