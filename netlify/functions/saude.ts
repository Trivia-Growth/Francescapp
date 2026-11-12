import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { criarEntradaSaudeNativa } from './_shared/entrada-saude-nativa.ts';

export const config = {
  path: ['/api/pacientes/:paciente_id/saude', '/api/saude/disponibilidade'],
};

let entrada: ReturnType<typeof criarEntradaSaudeNativa> | undefined;

export default async function saude(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/saude/disponibilidade') {
    if (request.method !== 'GET' || url.search || url.hash) return falha('servico_indisponivel');
    return Response.json(
      {
        dados: { disponivel: process.env.FFCM_SAUDE_ATIVADA === 'true' },
        request_id: crypto.randomUUID(),
      },
      { headers: cabecalhos },
    );
  }
  // Flag desligada por padrão: a ativação depende das provas de autorização e RLS.
  if (process.env.FFCM_SAUDE_ATIVADA !== 'true') return falha('servico_indisponivel');
  try {
    entrada ??= criarEntradaSaudeNativa(configurarDependenciasNativas(process.env));
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
