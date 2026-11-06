import {
  renovarAcessoAgenda,
  type ConfiguracaoOAuthAgenda,
} from '../../../supabase/functions/_shared/agenda-google-oauth.ts';

type Identidade = Readonly<{ usuarioId: string; sessaoId: string; subjectGoogle: string }>;
type Credencial = Readonly<{ refresh: string; geracao: string }>;

/** Vínculo é local; o evento é apenas consultado na conta Google do profissional. */
export async function processarVinculoAgenda(
  request: Request,
  portas: {
    origem: string;
    oauth: ConfiguracaoOAuthAgenda;
    autorizar(request: Request): Promise<Identidade | null>;
    lerCredencial(): Promise<Credencial | null>;
    vincularPaciente(
      eventoId: string,
      pacienteId: string,
      subject: string,
      geracao: string,
    ): Promise<'vinculado' | 'conflito'>;
  },
): Promise<Response> {
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
  const erro = (status: number) =>
    Response.json(
      {
        erro:
          status === 401
            ? 'nao_autenticado'
            : status === 422
              ? 'entrada_invalida'
              : 'servico_indisponivel',
      },
      { status, headers },
    );
  try {
    const url = new URL(request.url);
    if (
      request.method !== 'POST' ||
      url.origin !== portas.origem ||
      url.pathname !== '/api/agenda/google/vinculos' ||
      url.search ||
      url.hash ||
      request.headers.get('origin') !== portas.origem ||
      request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
        'application/json' ||
      !request.body
    )
      return erro(422);
    const leitor = request.body.getReader();
    let texto = '';
    let tamanho = 0;
    const decoder = new TextDecoder('utf-8', { fatal: true });
    try {
      while (true) {
        const parte = await leitor.read();
        if (parte.done) break;
        tamanho += parte.value.length;
        if (tamanho > 2048) {
          void leitor.cancel().catch(() => {});
          return erro(422);
        }
        texto += decoder.decode(parte.value, { stream: true });
      }
      texto += decoder.decode();
    } finally {
      leitor.releaseLock();
    }
    const dados: unknown = JSON.parse(texto);
    if (
      typeof dados !== 'object' ||
      dados === null ||
      Array.isArray(dados) ||
      Object.keys(dados).some((chave) => chave !== 'evento_id' && chave !== 'paciente_id') ||
      !('evento_id' in dados) ||
      typeof dados.evento_id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,1024}$/.test(dados.evento_id) ||
      !('paciente_id' in dados) ||
      typeof dados.paciente_id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        dados.paciente_id,
      )
    )
      return erro(422);
    const identidade = await portas.autorizar(request);
    if (!identidade) return erro(401);
    const credencial = await portas.lerCredencial();
    if (!credencial) return erro(503);
    const token = await renovarAcessoAgenda(portas.oauth, credencial.refresh);
    const resposta = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(dados.evento_id)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!resposta.ok) return erro(503);
    const evento: unknown = await resposta.json();
    if (
      typeof evento !== 'object' ||
      evento === null ||
      !('id' in evento) ||
      evento.id !== dados.evento_id ||
      ('status' in evento && evento.status === 'cancelled') ||
      ('recurrence' in evento && Array.isArray(evento.recurrence) && evento.recurrence.length > 0)
    )
      return erro(503);
    const atual = await portas.autorizar(request);
    if (
      !atual ||
      atual.usuarioId !== identidade.usuarioId ||
      atual.sessaoId !== identidade.sessaoId ||
      atual.subjectGoogle !== identidade.subjectGoogle
    )
      return erro(401);
    const credencialAtual = await portas.lerCredencial();
    if (
      !credencialAtual ||
      credencialAtual.geracao !== credencial.geracao ||
      credencialAtual.refresh !== credencial.refresh
    )
      return erro(503);
    const estado = await portas.vincularPaciente(
      dados.evento_id,
      dados.paciente_id,
      identidade.subjectGoogle,
      credencial.geracao,
    );
    return Response.json({ estado }, { headers });
  } catch {
    return erro(503);
  }
}
