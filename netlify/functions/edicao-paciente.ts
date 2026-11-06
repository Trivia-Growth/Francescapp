import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { criarEntradaEdicaoPacienteNativa } from './_shared/entrada-edicao-paciente-nativa.ts';

export const config = {
  path: [
    '/api/pacientes/:paciente_id',
    '/api/pacientes/edicao/reserva/consultar',
    '/api/pacientes/edicao/reserva',
    '/api/pacientes/edicao/reserva/encerrar',
    '/api/pacientes/edicao/reserva/reconhecer',
  ],
};
let entrada: ReturnType<typeof criarEntradaEdicaoPacienteNativa> | undefined;
export default async function edicaoPaciente(request: Request): Promise<Response> {
  if (process.env.FFCM_EDICAO_PACIENTE_ATIVADA !== 'true') return falha('servico_indisponivel');
  try {
    entrada ??= criarEntradaEdicaoPacienteNativa(configurarDependenciasNativas(process.env));
  } catch {
    return falha('configuracao_indisponivel');
  }
  return entrada.atender(request);
}
function falha(codigo: 'servico_indisponivel' | 'configuracao_indisponivel'): Response {
  return Response.json(criarErroPublicoSemCampos(codigo, crypto.randomUUID()), {
    status: 503,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
