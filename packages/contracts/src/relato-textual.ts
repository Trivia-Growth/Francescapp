import { z } from 'zod';

const dataAcontecimento = z.iso.date().refine((valor) => {
  const instante = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(instante.getTime()) && instante.toISOString().slice(0, 10) === valor;
});

/** Valida apenas conteúdo; não autoriza, persiste ou publica o relato. */
export const relatoTextualSchema = z
  .object({
    dataAcontecimento,
    descricao: z.string().refine((valor) => valor.trim().length > 0),
    categoria: z.string().optional(),
    contexto: z.string().optional(),
    acaoTomada: z.string().optional(),
    solicitacaoRetorno: z.boolean().optional(),
  })
  .strict();

export type RelatoTextual = z.output<typeof relatoTextualSchema>;
