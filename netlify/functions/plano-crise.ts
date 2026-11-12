import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { criarEntradaPlanoCriseNativa } from './_shared/entrada-plano-crise-nativa.ts';

export const config = {
  path: [
    '/api/pacientes/:paciente_id/plano-crise',
    '/api/pacientes/:paciente_id/plano-crise/aprovacao',
    '/api/plano-crise/disponibilidade',
  ],
};

let entrada: ReturnType<typeof criarEntradaPlanoCriseNativa> | undefined;

export default async function planoCrise(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/plano-crise/disponibilidade') {
    if (request.method !== 'GET' || url.search || url.hash) return falha('servico_indisponivel');
    return Response.json(
      {
        dados: { disponivel: process.env.FFCM_PLANO_CRISE_ATIVO === 'true' },
        request_id: crypto.randomUUID(),
      },
      { headers: cabecalhos },
    );
  }
  // Flag desligada por padrão: a ativação depende das provas de autorização e RLS.
  if (process.env.FFCM_PLANO_CRISE_ATIVO !== 'true') return falha('servico_indisponivel');
  try {
    entrada ??= criarEntradaPlanoCriseNativa(configurarDependenciasNativas(process.env));
  } catch {
    return falha('configuracao_indisponivel');
  }
  return entrada.atender(request);
}

const cabecalhos = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function falha(codigo: 'servico_indisponivel' | 'configuracao_indisponivel'): Response {
  return Response.json(criarErroPublicoSemCampos(codigo, crypto.randomUUID()), {
    status: 503,
    headers: cabecalhos,
  });
}
