import type { FonteDeConfiguracao } from '../../../supabase/functions/_shared/configuracao.ts';
import { comporPacientesNativo } from './compor-pacientes-nativo.ts';
import { configurarDependenciasNativas } from './configurar-dependencias-nativas.ts';

/** Preparação server-only; criar pool não abre conexão nem comprova privilégios. */
export function configurarPacientesNativo(fonte: FonteDeConfiguracao) {
  const dependencias = configurarDependenciasNativas(fonte);
  return {
    executar: (request: Request, rota: Parameters<typeof comporPacientesNativo>[1]) =>
      comporPacientesNativo(request, rota, dependencias),
    encerrar: () => dependencias.pool.end(),
  };
}
