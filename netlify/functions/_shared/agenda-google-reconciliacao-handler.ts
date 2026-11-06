import {
  renovarAcessoAgenda,
  type ConfiguracaoOAuthAgenda,
} from '../../../supabase/functions/_shared/agenda-google-oauth.ts';

type Identidade = Readonly<{ usuarioId: string; sessaoId: string; subjectGoogle: string }>;
type Credencial = Readonly<{ refresh: string; geracao: string }>;
type Pendencia = Readonly<{
  operacao_id: string;
  evento_id: string;
  acao: 'criar' | 'alterar' | 'cancelar';
}>;

/** Ausência ou falha de consulta não prova que uma escrita em trânsito falhou. */
export async function processarReconciliacaoAgenda(
  request: Request,
  portas: {
    origem: string;
    oauth: ConfiguracaoOAuthAgenda;
    autorizar(request: Request): Promise<Identidade | null>;
    lerCredencial(): Promise<Credencial | null>;
    pendencia(): Promise<Pendencia | { conta_anterior: true } | null>;
    resolverEscrita(
      id: string,
      subject: string,
      desfecho: 'confirmada' | 'nao_realizada',
    ): Promise<boolean>;
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
    const consultar = request.method === 'GET' && url.pathname === '/api/agenda/google/pendencia';
    const reconciliar =
      request.method === 'POST' && url.pathname === '/api/agenda/google/reconciliar';
    if (url.origin !== portas.origem || url.search || url.hash || (!consultar && !reconciliar))
      return erro(422);
    if (
      reconciliar &&
      (request.headers.get('origin') !== portas.origem ||
        request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
          'application/json')
    )
      return erro(422);
    const identidade = await portas.autorizar(request);
    if (!identidade) return erro(401);
    const pendencia = await portas.pendencia();
    if (!pendencia) return Response.json({ estado: 'nenhuma' }, { headers });
    if ('conta_anterior' in pendencia)
      return Response.json({ estado: 'conta_anterior' }, { headers });
    if (consultar) return Response.json({ estado: 'pendente', ...pendencia }, { headers });
    const credencial = await portas.lerCredencial();
    if (!credencial) return Response.json({ estado: 'pendente' }, { headers });
    const token = await renovarAcessoAgenda(portas.oauth, credencial.refresh);
    const urlGoogle = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(pendencia.evento_id)}`;
    const resposta = await fetch(urlGoogle, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (!resposta.ok) return Response.json({ estado: 'pendente' }, { headers });
    const evento: unknown = await resposta.json();
    if (
      typeof evento !== 'object' ||
      evento === null ||
      !('id' in evento) ||
      evento.id !== pendencia.evento_id
    )
      return Response.json({ estado: 'pendente' }, { headers });
    let comprovado =
      pendencia.acao === 'cancelar' && 'status' in evento && evento.status === 'cancelled';
    if (
      pendencia.acao !== 'cancelar' &&
      'extendedProperties' in evento &&
      typeof evento.extendedProperties === 'object' &&
      evento.extendedProperties !== null &&
      'private' in evento.extendedProperties &&
      typeof evento.extendedProperties.private === 'object' &&
      evento.extendedProperties.private !== null &&
      'ffcm_operacao' in evento.extendedProperties.private
    )
      comprovado =
        evento.extendedProperties.private.ffcm_operacao === pendencia.operacao_id.toLowerCase();
    if (!comprovado) return Response.json({ estado: 'pendente' }, { headers });
    const atual = await portas.autorizar(request);
    if (
      !atual ||
      atual.usuarioId !== identidade.usuarioId ||
      atual.sessaoId !== identidade.sessaoId ||
      atual.subjectGoogle !== identidade.subjectGoogle
    )
      return erro(401);
    const atualCredencial = await portas.lerCredencial();
    if (
      !atualCredencial ||
      atualCredencial.geracao !== credencial.geracao ||
      atualCredencial.refresh !== credencial.refresh
    )
      return Response.json({ estado: 'pendente' }, { headers });
    if (
      !(await portas.resolverEscrita(pendencia.operacao_id, identidade.subjectGoogle, 'confirmada'))
    )
      return Response.json({ estado: 'pendente' }, { headers });
    return Response.json({ estado: 'confirmado' }, { headers });
  } catch {
    return erro(503);
  }
}
