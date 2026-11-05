import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { comporAgendaGoogle } from './_shared/compor-agenda-google.ts';

export const config = {
  path: [
    '/api/agenda/google/conectar',
    '/api/agenda/google/callback',
    '/api/agenda/google/compromissos',
  ],
};

export default async function agendaGoogle(request: Request): Promise<Response> {
  // Liberar somente após revisão e provas reais registradas no OpenSpec.
  const integracaoComprovada = false;
  if (integracaoComprovada && process.env.FFCM_AGENDA_GOOGLE_ATIVADO === 'true') {
    try {
      return await comporAgendaGoogle(request, process.env);
    } catch {
      /* falha fechada */
    }
  }
  return Response.json(criarErroPublicoSemCampos('servico_indisponivel', crypto.randomUUID()), {
    status: 503,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
