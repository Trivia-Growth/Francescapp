import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { criarEntradaAprovarObjetivoPlanoNativa } from './_shared/entrada-aprovar-objetivo-plano-nativa.ts';

export const config = { path: '/api/plano/aprovar-objetivo' };

let entrada: ReturnType<typeof criarEntradaAprovarObjetivoPlanoNativa> | undefined;

export default async function aprovarObjetivo(request: Request): Promise<Response> {
  // Administrador sempre, ou colaborador ativo na lista de aprovadores — checagem real
  // fica no banco. Desativado por padrão.
  if (process.env.FFCM_APROVAR_OBJETIVO_PLANO_ATIVO !== 'true')
    return falha('servico_indisponivel');
  try {
    entrada ??= criarEntradaAprovarObjetivoPlanoNativa(configurarDependenciasNativas(process.env));
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
