import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { criarEntradaAnamneseNativa } from './_shared/entrada-anamnese-nativa.ts';

export const config = {
  path: ['/api/pacientes/:paciente_id/anamnese', '/api/pacientes/:paciente_id/anamnese/historico'],
};

let entrada: ReturnType<typeof criarEntradaAnamneseNativa> | undefined;

export default async function anamnese(request: Request): Promise<Response> {
  // Ativação exige S-02 e provas integradas de autorização e sessão.
  if (process.env.FFCM_ANAMNESE_ATIVADA !== 'true') return falha('servico_indisponivel');
  if (
    new URL(request.url).pathname.endsWith('/historico') &&
    process.env.FFCM_HISTORICO_ANAMNESE_ATIVADO !== 'true'
  )
    return falha('servico_indisponivel');
  try {
    entrada ??= criarEntradaAnamneseNativa(configurarDependenciasNativas(process.env));
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
