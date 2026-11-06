import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { criarEntradaContatoNativo } from './_shared/entrada-contato-nativo.ts';

export const config = {
  path: '/api/pacientes/:paciente_id/contatos',
};
let entrada: ReturnType<typeof criarEntradaContatoNativo> | undefined;
export default async function contato(request: Request): Promise<Response> {
  if (process.env.FFCM_CONTATO_ATIVADO !== 'true') return falha('servico_indisponivel');
  try {
    entrada ??= criarEntradaContatoNativo(configurarDependenciasNativas(process.env));
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
