import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { criarEntradaPlanoNativa } from './_shared/entrada-plano-nativa.ts';

export const config = {
  path: [
    '/api/pacientes/:paciente_id/plano',
    '/api/pacientes/:paciente_id/plano/:objetivo_id',
    '/api/pacientes/:paciente_id/plano/:objetivo_id/historico',
    '/api/plano/reserva/consultar',
    '/api/plano/reserva',
    '/api/plano/reserva/encerrar',
    '/api/plano/reserva/reconhecer',
  ],
};

let entrada: ReturnType<typeof criarEntradaPlanoNativa> | undefined;

export default async function plano(request: Request): Promise<Response> {
  if (process.env.FFCM_PLANO_ATIVADO !== 'true') {
    return falha('servico_indisponivel', 503);
  }
  try {
    entrada ??= criarEntradaPlanoNativa(configurarDependenciasNativas(process.env));
  } catch {
    return falha('configuracao_indisponivel', 503);
  }
  return entrada.atender(request);
}

function falha(codigo: 'servico_indisponivel' | 'configuracao_indisponivel', status: number) {
  return Response.json(criarErroPublicoSemCampos(codigo, crypto.randomUUID()), {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
