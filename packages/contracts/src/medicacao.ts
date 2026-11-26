import { z } from 'zod';
import { campoCifradoSchema, uuidSchema } from './comum.ts';
import { reservaTurnoSchema, versaoTurnoSchema } from './turno.ts';

/** Texto sensível cifrado antes de cruzar a fronteira de persistência privada. */
export const itemMedicacaoPrescritaSchema = z
  .object({
    nome: campoCifradoSchema,
    dose: campoCifradoSchema,
    via: campoCifradoSchema,
    horarios: z
      .array(z.iso.time({ precision: 0 }))
      .min(1)
      .max(48),
    vigencia_inicio: z.iso.datetime({ offset: true }),
    vigencia_fim: z.iso.datetime({ offset: true }).nullable(),
    fonte_documental: campoCifradoSchema,
  })
  .strict()
  .refine(
    (v) => !v.vigencia_fim || Date.parse(v.vigencia_fim) >= Date.parse(v.vigencia_inicio),
    'Vigência inválida.',
  );
export const criacaoItemMedicacaoSchema = reservaTurnoSchema
  .extend({ item_id: uuidSchema, item: itemMedicacaoPrescritaSchema })
  .strict();
export const executorMedicacaoSchema = z
  .object({ nome: campoCifradoSchema, vinculo: campoCifradoSchema })
  .strict();
export const administracaoMedicacaoSchema = z
  .object({
    turno_id: uuidSchema,
    item_id: uuidSchema,
    versao: versaoTurnoSchema,
    executor: executorMedicacaoSchema,
    situacao: z.enum(['administrado', 'recusado', 'adiado', 'nao_administrado']),
    motivo: campoCifradoSchema.optional(),
  })
  .strict()
  .refine((v) => v.situacao === 'administrado' || v.motivo !== undefined, 'Situação exige motivo.');
export const criacaoAdministracaoMedicacaoSchema = reservaTurnoSchema
  .extend({ administracao_id: uuidSchema, administracao: administracaoMedicacaoSchema })
  .strict();
export type ItemMedicacaoPrescrita = z.infer<typeof itemMedicacaoPrescritaSchema>;
export type AdministracaoMedicacao = z.infer<typeof administracaoMedicacaoSchema>;
