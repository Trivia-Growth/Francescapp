import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { criarEntradaPendenciaNativa } from './_shared/entrada-pendencia-nativa.ts';

export const config = {
  path: [
    '/api/pacientes/:paciente_id/pendencias',
    '/api/pacientes/:paciente_id/pendencias/acordo',
    '/api/pacientes/:paciente_id/pendencias/tratativa',
    '/api/pendencias/disponibilidade',
  ],
};

let entrada: ReturnType<typeof criarEntradaPendenciaNativa> | undefined;

export default async function pendencias(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/pendencias/disponibilidade') {
    if (request.method !== 'GET' || url.search || url.hash) return falha('servico_indisponivel');
    return Response.json(
      {
        dados: { disponivel: process.env.FFCM_PENDENCIAS_ATIVADAS === 'true' },
        request_id: crypto.randomUUID(),
      },
      { headers: cabecalhos },
    );
  }
  // Flag desligada por padrão: a ativação depende das provas de autorização e RLS.
  if (process.env.FFCM_PENDENCIAS_ATIVADAS !== 'true') return falha('servico_indisponivel');
  try {
    entrada ??= criarEntradaPendenciaNativa(configurarDependenciasNativas(process.env));
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
