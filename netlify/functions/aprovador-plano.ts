import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { criarEntradaAprovadorPlanoNativa } from './_shared/entrada-aprovador-plano-nativa.ts';

export const config = { path: '/api/admin/aprovador-plano' };

let entrada: ReturnType<typeof criarEntradaAprovadorPlanoNativa> | undefined;

export default async function aprovadorPlano(request: Request): Promise<Response> {
  // Administrador-only; autorização real fica no banco. Desativado por padrão.
  if (process.env.FFCM_APROVADOR_PLANO_ATIVO !== 'true') return falha('servico_indisponivel');
  try {
    entrada ??= criarEntradaAprovadorPlanoNativa(configurarDependenciasNativas(process.env));
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
