import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { comporAgendaGoogle } from './_shared/compor-agenda-google.ts';

export const config = {
  path: [
    '/api/agenda/google/conectar',
    '/api/agenda/google/desconectar',
    '/api/agenda/google/desconexao/recibo',
    '/api/agenda/google/desconexao/cancelar',
    '/api/agenda/google/conexao',
    '/api/agenda/google/callback',
    '/api/agenda/google/compromissos',
    '/api/agenda/google/operacoes',
    '/api/agenda/google/vinculos',
    '/api/agenda/google/vinculos/retirar',
    '/api/agenda/google/vinculos/consulta',
    '/api/agenda/google/pendencia',
    '/api/agenda/google/reconciliar',
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
