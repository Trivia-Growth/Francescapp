import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { criarEntradaEncaminhamentoNativa } from './_shared/entrada-encaminhamento-nativa.ts';

export const config = {
  path: ['/api/pacientes/:paciente_id/encaminhamentos', '/api/encaminhamentos/disponibilidade'],
};

let entrada: ReturnType<typeof criarEntradaEncaminhamentoNativa> | undefined;

export default async function encaminhamento(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/encaminhamentos/disponibilidade') {
    if (request.method !== 'GET' || url.search || url.hash) return falha('servico_indisponivel');
    return Response.json(
      {
        dados: { disponivel: process.env.FFCM_ENCAMINHAMENTOS_ATIVADO === 'true' },
        request_id: crypto.randomUUID(),
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
        },
      },
    );
  }
  // Ativação exige as provas integradas de autorização e sessão desta fatia.
  if (process.env.FFCM_ENCAMINHAMENTOS_ATIVADO !== 'true') return falha('servico_indisponivel');
  try {
    entrada ??= criarEntradaEncaminhamentoNativa(configurarDependenciasNativas(process.env));
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
