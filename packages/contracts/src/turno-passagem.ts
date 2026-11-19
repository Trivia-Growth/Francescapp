import { z } from 'zod';
import { uuidSchema } from './comum.ts';
import { conteudoEvolucaoDiarioSchema } from './diario.ts';
import { campoCifradoSchema } from './rpc.ts';

export const escalaVersaoSchema = z
  .object({
    escala_id: uuidSchema,
    paciente_id: uuidSchema,
    versao: z.number().int().positive(),
    profissional_previsto_usuario_id: uuidSchema,
    profissional_assumiu_usuario_id: uuidSchema.nullable(),
    inicio_previsto: z.iso.datetime({ offset: true }),
    fim_previsto: z.iso.datetime({ offset: true }),
    tipo: z.enum(['previsto', 'substituicao', 'cobertura']),
    motivo: z.string().nullable(),
    autor_usuario_id: uuidSchema,
    registrado_em: z.iso.datetime({ offset: true }),
  })
  .strict();
export const identidadeTurnoSchema = z
  .object({ usuario_id: uuidSchema, rotulo: z.string().min(1).max(254).nullable() })
  .strict();
export const cursorEscalaSchema = z
  .object({ escala_id: uuidSchema, versao: z.number().int().positive() })
  .strict();
export const consultaEscalaSchema = z
  .object({
    cursor_escala_id: uuidSchema.optional(),
    cursor_versao: z.number().int().positive().optional(),
  })
  .strict()
  .refine(
    (v) => (v.cursor_escala_id === undefined) === (v.cursor_versao === undefined),
    'Cursor incompleto.',
  );
export const escalaCasoSchema = z
  .object({
    identidades: z.array(identidadeTurnoSchema).max(200),
    proximo_cursor: cursorEscalaSchema.nullable(),
    pode_gerir: z.boolean(),
    itens: z.array(escalaVersaoSchema).max(500),
    profissionais: z
      .array(z.object({ usuario_id: uuidSchema, rotulo: z.string().min(1).max(254) }).strict())
      .max(500),
  })
  .strict();
export const criarEscalaSchema = z
  .object({
    escala_id: uuidSchema,
    profissional_previsto_usuario_id: uuidSchema,
    inicio_previsto: z.iso.datetime({ offset: true }),
    fim_previsto: z.iso.datetime({ offset: true }),
  })
  .strict()
  .refine(
    (v) => Date.parse(v.fim_previsto) > Date.parse(v.inicio_previsto),
    'Fim deve suceder início.',
  );
export const alterarEscalaSchema = z
  .object({
    tipo: z.enum(['substituicao', 'cobertura']),
    profissional_assumiu_usuario_id: uuidSchema,
    motivo: z.string().trim().min(1).max(2000),
    versao_esperada: z.number().int().positive().max(2147483646),
  })
  .strict();
export const publicarPassagemSchema = z
  .object({
    conteudo: conteudoEvolucaoDiarioSchema,
    versao_esperada: z.number().int().nonnegative().max(2147483646),
  })
  .strict()
  .refine((v) => v.conteudo.atividade !== undefined, 'Publicar exige síntese.');
export const cienciaPassagemSchema = z
  .object({ usuario_id: uuidSchema, registrada_em: z.iso.datetime({ offset: true }) })
  .strict();
export const referenciaPassagemSchema = z
  .object({
    turno_aberto_em: z.iso.datetime({ offset: true }),
    turno_encerrado_em: z.iso.datetime({ offset: true }).nullable(),
    versao_passagem: z.number().int().positive(),
    registro_id: uuidSchema,
    diario_registro_id: uuidSchema,
    turno_id: uuidSchema,
    autor_usuario_id: uuidSchema,
    publicado_em: z.iso.datetime({ offset: true }),
    conteudo: conteudoEvolucaoDiarioSchema,
  })
  .strict();
export const recebimentoPassagemSchema = z
  .object({
    turno_destinatario_id: uuidSchema,
    usuario_id: uuidSchema,
    consultado_em: z.iso.datetime({ offset: true }).nullable(),
    ciencia: cienciaPassagemSchema.nullable(),
  })
  .strict();
export const passagemTurnoSchema = z
  .object({
    identidades: z.array(identidadeTurnoSchema).max(10),
    recebimento: recebimentoPassagemSchema.nullable(),
    propria: referenciaPassagemSchema.nullable(),
    anterior: z
      .object({
        referencia: referenciaPassagemSchema,
        turno_destinatario_id: uuidSchema,
        ciencia: cienciaPassagemSchema.nullable(),
      })
      .strict()
      .nullable(),
    area_passagem: z.string().min(1).max(120).nullable(),
  })
  .strict();
export const turnoGrupo3Http = {
  escala: {
    metodo: 'GET',
    caminho: '/api/pacientes/:paciente_id/turnos/escala',
    entrada: consultaEscalaSchema,
    saida: escalaCasoSchema,
  },
  criarEscala: {
    metodo: 'POST',
    caminho: '/api/pacientes/:paciente_id/turnos/escala',
    entrada: criarEscalaSchema,
    saida: escalaVersaoSchema,
  },
  alterarEscala: {
    metodo: 'PATCH',
    caminho: '/api/pacientes/:paciente_id/turnos/escala/:escala_id',
    entrada: alterarEscalaSchema,
    saida: escalaVersaoSchema,
  },
  passagem: {
    metodo: 'GET',
    caminho: '/api/pacientes/:paciente_id/turnos/:turno_id/passagem',
    entrada: z.object({}).strict(),
    saida: passagemTurnoSchema,
  },
  publicar: {
    metodo: 'POST',
    caminho: '/api/pacientes/:paciente_id/turnos/:turno_id/passagem',
    entrada: publicarPassagemSchema,
    saida: referenciaPassagemSchema,
  },
  ciencia: {
    metodo: 'POST',
    caminho: '/api/pacientes/:paciente_id/turnos/:turno_id/passagem/ciencia',
    entrada: z.object({}).strict(),
    saida: cienciaPassagemSchema,
  },
} as const;
// Banco devolve conteúdo cifrado usando AAD original do Diário, nunca cópia paralela.
export const referenciaPassagemPrivadaSchema = referenciaPassagemSchema
  .omit({ conteudo: true })
  .extend({ conteudo: campoCifradoSchema, versao: z.number().int().positive() })
  .strict();
export const identidadeTurnoPrivadaSchema = z
  .object({
    usuario_id: uuidSchema,
    concessao_id: uuidSchema.nullable(),
    email: campoCifradoSchema.nullable(),
  })
  .strict();
export const passagemTurnoPrivadaSchema = passagemTurnoSchema
  .omit({ propria: true, anterior: true, identidades: true })
  .extend({
    identidades: z.array(identidadeTurnoPrivadaSchema).max(10),
    propria: referenciaPassagemPrivadaSchema.nullable(),
    anterior: z
      .object({
        referencia: referenciaPassagemPrivadaSchema,
        turno_destinatario_id: uuidSchema,
        ciencia: cienciaPassagemSchema.nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type EscalaVersao = z.infer<typeof escalaVersaoSchema>;
export type EscalaCaso = z.infer<typeof escalaCasoSchema>;
export type CriarEscala = z.infer<typeof criarEscalaSchema>;
export type AlterarEscala = z.infer<typeof alterarEscalaSchema>;
export type PublicarPassagem = z.infer<typeof publicarPassagemSchema>;
export type ReferenciaPassagem = z.infer<typeof referenciaPassagemSchema>;
export type PassagemTurno = z.infer<typeof passagemTurnoSchema>;
export type CienciaPassagem = z.infer<typeof cienciaPassagemSchema>;
