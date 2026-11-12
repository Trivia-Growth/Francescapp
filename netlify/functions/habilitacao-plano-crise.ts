import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { criarEntradaHabilitacaoCriseNativa } from './_shared/entrada-habilitacao-crise-nativa.ts';

export const config = { path: '/api/admin/habilitacao-plano-crise' };

let entrada: ReturnType<typeof criarEntradaHabilitacaoCriseNativa> | undefined;

export default async function habilitacaoPlanoCrise(request: Request): Promise<Response> {
  // Administrador-only; autorização real fica no banco. Desativado por padrão.
  if (process.env.FFCM_PLANO_CRISE_ATIVO !== 'true') return falha('servico_indisponivel');
  try {
    entrada ??= criarEntradaHabilitacaoCriseNativa(configurarDependenciasNativas(process.env));
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
