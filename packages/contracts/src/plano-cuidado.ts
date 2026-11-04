import { z } from 'zod';
import { uuidSchema } from './comum.ts';
import { campoCifradoSchema } from './rpc.ts';

const texto = z.string().trim().min(1);
const data = z.iso.date().refine((valor) => {
  const instante = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(instante.getTime()) && instante.toISOString().slice(0, 10) === valor;
});

export const objetivoSchema = z
  .object({
    descricao: texto,
    area: texto,
    responsavel: texto,
    situacaoInicial: texto,
    observacaoProgresso: texto,
    dataRevisao: data,
    estado: z.enum(['proposto', 'em andamento', 'atingido', 'pausado', 'revisar', 'encerrado']),
  })
  .strict();

const revisaoSchema = z
  .object({
    objetivo: objetivoSchema,
    motivo: texto,
  })
  .strict();

export type Objetivo = z.output<typeof objetivoSchema>;
export type RevisaoObjetivo = z.output<typeof revisaoSchema>;
export type MetadadosRevisao = { responsavel: string; data: string };
export type VersaoObjetivo = RevisaoObjetivo & MetadadosRevisao & { versao: number };

const metadadosSchema = z.object({ responsavel: texto, data }).strict();

/** Metadados devem vir da fronteira autenticada e relógio confiável; autorização e transação ficam fora desta regra local. */
export function revisarObjetivo(
  historico: readonly VersaoObjetivo[],
  versaoEsperada: number,
  entrada: unknown,
  metadadosConfiaveis: MetadadosRevisao,
): { ok: true; versoes: VersaoObjetivo[] } | { ok: false; erro: 'conflito' } {
  const ultima = historico.at(-1);
  if (!ultima || ultima.versao !== versaoEsperada) return { ok: false, erro: 'conflito' };
  const revisao = revisaoSchema.parse(entrada);
  const metadados = metadadosSchema.parse(metadadosConfiaveis);
  return {
    ok: true,
    versoes: [
      ...structuredClone(historico),
      { ...revisao, ...metadados, versao: ultima.versao + 1 },
    ],
  };
}

export const motivoPlanoSchema = z.string().trim().min(1);
export const conteudoPlanoSchema = z
  .object({
    objetivo: objetivoSchema,
    motivo: motivoPlanoSchema.optional(),
    ator_usuario_id: uuidSchema,
    data: z.iso.datetime(),
  })
  .strict();
const registroPlanoSchema = z
  .object({
    registro_id: uuidSchema,
    objetivo_id: uuidSchema,
    paciente_id: uuidSchema,
    versao: z.number().int().min(1).max(2147483647),
    conteudo: campoCifradoSchema,
  })
  .strict();
export const respostaPlanoPrivadaSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      dados: z.union([
        registroPlanoSchema,
        z
          .object({
            itens: z.array(registroPlanoSchema).max(20),
            proximo_cursor: z
              .union([uuidSchema, z.number().int().positive().max(2147483647)])
              .nullable(),
          })
          .strict(),
      ]),
      request_id: uuidSchema,
      repeticao: z.boolean().optional().default(false),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      erro: z
        .object({ codigo: z.enum(['sem_permissao', 'conflito', 'conflito_idempotencia']) })
        .strict(),
      request_id: uuidSchema,
    })
    .strict(),
]);
