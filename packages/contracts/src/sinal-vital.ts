import { z } from 'zod';
import { uuidSchema } from './comum.ts';
import { reservaTurnoSchema } from './turno.ts';

/** Conjunto inicial confirmado. Ativação de cada tipo é conferida no catálogo do servidor. */
export const unidadesSinalVital = {
  pressao_sistolica: 'mmHg',
  pressao_diastolica: 'mmHg',
  frequencia_cardiaca: 'bpm',
  frequencia_respiratoria: 'irpm',
  temperatura: '°C',
  saturacao_oxigenio: '%',
  glicemia_capilar: 'mg/dL',
  dor: '0-10',
} as const;
export const sinalVitalSchema = z
  .object({
    turno_id: uuidSchema,
    tipo: z.enum([
      'pressao_sistolica',
      'pressao_diastolica',
      'frequencia_cardiaca',
      'frequencia_respiratoria',
      'temperatura',
      'saturacao_oxigenio',
      'glicemia_capilar',
      'dor',
    ]),
    valor: z.number().finite(),
    unidade: z.string().min(1).max(20),
    instante_afericao: z.iso.datetime({ offset: true }),
  })
  .strict()
  .refine((v) => v.unidade === unidadesSinalVital[v.tipo], 'Unidade incompatível com o tipo.')
  .refine(
    (v) => v.tipo !== 'dor' || (v.valor >= 0 && v.valor <= 10),
    'Dor exige escala de 0 a 10.',
  );
export const criacaoSinalVitalSchema = reservaTurnoSchema
  .extend({ afericao_id: uuidSchema, afericao: sinalVitalSchema })
  .strict();
export type SinalVital = z.infer<typeof sinalVitalSchema>;
