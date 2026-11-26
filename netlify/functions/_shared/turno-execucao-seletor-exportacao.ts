import { z } from 'zod';
import { uuidSchema } from '../../../packages/contracts/src/comum.ts';
export type SeletorVersaoExportacao = {
  registro_id_exportacao?: string;
  versao_exportacao?: number;
};
const seletor = z
  .object({ registro_id_exportacao: uuidSchema, versao_exportacao: z.number().int().positive() })
  .strict();
/** Somente comandos internos. Ambos os campos integram o corpo antes do MAC. */
export function incluirSeletorExportacao(
  comando: SeletorVersaoExportacao,
  entrada: Record<string, unknown>,
) {
  if (comando.registro_id_exportacao === undefined && comando.versao_exportacao === undefined)
    return;
  Object.assign(
    entrada,
    seletor.parse({
      registro_id_exportacao: comando.registro_id_exportacao,
      versao_exportacao: comando.versao_exportacao,
    }),
  );
}
export function conferirVersaoExportacao(comando: SeletorVersaoExportacao, valor: unknown): void {
  if (comando.registro_id_exportacao === undefined && comando.versao_exportacao === undefined)
    return;
  const esperado = seletor.parse({
    registro_id_exportacao: comando.registro_id_exportacao,
    versao_exportacao: comando.versao_exportacao,
  });
  const rows: Record<string, unknown>[] = [];
  const percorrer = (v: unknown) => {
    if (Array.isArray(v)) {
      v.forEach(percorrer);
      return;
    }
    if (v && typeof v === 'object') {
      const r = v as Record<string, unknown>;
      if (typeof r.registro_id === 'string' && typeof r.versao === 'number') rows.push(r);
      else Object.values(r).forEach(percorrer);
    }
  };
  percorrer(valor);
  const registro = rows[0];
  if (
    rows.length !== 1 ||
    registro === undefined ||
    registro.registro_id !== esperado.registro_id_exportacao ||
    registro.versao !== esperado.versao_exportacao
  )
    throw new Error('Versão de exportação incompatível.');
}
