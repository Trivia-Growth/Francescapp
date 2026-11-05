import { escreverAgendaGoogle } from '../../../supabase/functions/_shared/agenda-google-escrita.ts';
import {
  renovarAcessoAgenda,
  type ConfiguracaoOAuthAgenda,
} from '../../../supabase/functions/_shared/agenda-google-oauth.ts';

type Identidade = Readonly<{ usuarioId: string; sessaoId: string; subjectGoogle: string }>;
type Credencial = Readonly<{ refresh: string; geracao: string }>;

export async function processarEscritaAgenda(
  request: Request,
  portas: {
    origem: string;
    oauth: ConfiguracaoOAuthAgenda;
    autorizar(request: Request): Promise<Identidade | null>;
    lerCredencial(): Promise<Credencial | null>;
    reservarEscrita(
      operacaoId: string,
      eventoId: string,
      acao: string,
      subject: string,
    ): Promise<boolean>;
    resolverEscrita(
      operacaoId: string,
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
  let enviada = false;
  let externaIniciada = false;
  let reserva: { operacaoId: string; subject: string } | undefined;
  const falhaAntesDaEscrita = async (status: number) => {
    if (!reserva) return erro(status);
    try {
      if (await portas.resolverEscrita(reserva.operacaoId, reserva.subject, 'nao_realizada'))
        return erro(status);
    } catch {
      /* Resultado da resolução pode ser incerto; conservar bloqueio. */
    }
    return Response.json({ estado: 'incerto' }, { headers });
  };
  try {
    const url = new URL(request.url);
    if (
      request.method !== 'POST' ||
      url.origin !== portas.origem ||
      url.pathname !== '/api/agenda/google/operacoes' ||
      url.search ||
      url.hash ||
      request.headers.get('origin') !== portas.origem ||
      request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
        'application/json'
    )
      return erro(422);
    const tamanho = Number(request.headers.get('content-length') ?? 0);
    if (!Number.isSafeInteger(tamanho) || tamanho < 0 || tamanho > 4096 || !request.body)
      return erro(422);
    const leitor = request.body.getReader();
    let texto = '';
    let bytes = 0;
    const decodificador = new TextDecoder('utf-8', { fatal: true });
    try {
      while (true) {
        const parte = await leitor.read();
        if (parte.done) break;
        bytes += parte.value.length;
        if (bytes > 4096) {
          void leitor.cancel();
          return erro(422);
        }
        texto += decodificador.decode(parte.value, { stream: true });
      }
      texto += decodificador.decode();
    } finally {
      leitor.releaseLock();
    }
    const dados: unknown = JSON.parse(texto);
    if (typeof dados !== 'object' || dados === null || Array.isArray(dados)) return erro(422);
    const entrada = dados as Record<string, unknown>;
    if (
      Object.keys(entrada).some(
        (chave) =>
          ![
            'acao',
            'operacao_id',
            'inicio',
            'fim',
            'evento_id',
            'etag',
            'confirmar_conflito',
          ].includes(chave),
      ) ||
      !['criar', 'alterar', 'cancelar'].includes(String(entrada.acao)) ||
      typeof entrada.operacao_id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        entrada.operacao_id,
      ) ||
      (entrada.confirmar_conflito !== undefined && typeof entrada.confirmar_conflito !== 'boolean')
    )
      return erro(422);
    const acao = entrada.acao as 'criar' | 'alterar' | 'cancelar';
    const instante = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
    if (
      acao !== 'cancelar' &&
      (typeof entrada.inicio !== 'string' ||
        typeof entrada.fim !== 'string' ||
        !instante.test(entrada.inicio) ||
        !instante.test(entrada.fim) ||
        !Number.isFinite(Date.parse(entrada.inicio)) ||
        !Number.isFinite(Date.parse(entrada.fim)) ||
        Date.parse(entrada.inicio) >= Date.parse(entrada.fim))
    )
      return erro(422);
    if (
      acao !== 'criar' &&
      (typeof entrada.evento_id !== 'string' ||
        !/^[A-Za-z0-9_-]{1,1024}$/.test(entrada.evento_id) ||
        typeof entrada.etag !== 'string' ||
        !/^"[\x21\x23-\x7e]{1,510}"$/.test(entrada.etag))
    )
      return erro(422);
    if (acao === 'criar' && (entrada.evento_id !== undefined || entrada.etag !== undefined))
      return erro(422);
    if (
      acao === 'cancelar' &&
      (entrada.inicio !== undefined ||
        entrada.fim !== undefined ||
        entrada.confirmar_conflito !== undefined)
    )
      return erro(422);
    const identidade = await portas.autorizar(request);
    if (!identidade) return erro(401);
    const eventoId =
      acao === 'criar'
        ? entrada.operacao_id.toLowerCase().replaceAll('-', '')
        : String(entrada.evento_id);
    // Reserva antes de chamadas externas: timeout após este ponto mantém pendência.
    enviada = true;
    if (
      !(await portas.reservarEscrita(entrada.operacao_id, eventoId, acao, identidade.subjectGoogle))
    )
      return Response.json({ estado: 'pendente' }, { headers });
    reserva = { operacaoId: entrada.operacao_id, subject: identidade.subjectGoogle };
    const credencial = await portas.lerCredencial();
    if (!credencial) return await falhaAntesDaEscrita(503);
    const token = await renovarAcessoAgenda(portas.oauth, credencial.refresh);
    const atual = await portas.autorizar(request);
    const atualCredencial = await portas.lerCredencial();
    if (
      !atual ||
      atual.usuarioId !== identidade.usuarioId ||
      atual.sessaoId !== identidade.sessaoId ||
      atual.subjectGoogle !== identidade.subjectGoogle ||
      !atualCredencial ||
      atualCredencial.geracao !== credencial.geracao ||
      atualCredencial.refresh !== credencial.refresh
    )
      return await falhaAntesDaEscrita(401);
    enviada = true;
    const resultado = await escreverAgendaGoogle(
      token,
      {
        acao,
        operacaoId: entrada.operacao_id,
        ...(typeof entrada.inicio === 'string' ? { inicio: entrada.inicio } : {}),
        ...(typeof entrada.fim === 'string' ? { fim: entrada.fim } : {}),
        ...(typeof entrada.evento_id === 'string' ? { eventoId: entrada.evento_id } : {}),
        ...(typeof entrada.etag === 'string' ? { etag: entrada.etag } : {}),
        confirmarConflito: entrada.confirmar_conflito === true,
      },
      async () => {
        const antes = await portas.autorizar(request);
        if (
          !antes ||
          antes.usuarioId !== identidade.usuarioId ||
          antes.sessaoId !== identidade.sessaoId ||
          antes.subjectGoogle !== identidade.subjectGoogle
        )
          return false;
        const credencialAntes = await portas.lerCredencial();
        const autorizado =
          !!credencialAntes &&
          credencialAntes.geracao === credencial.geracao &&
          credencialAntes.refresh === credencial.refresh;
        if (autorizado) externaIniciada = true;
        return autorizado;
      },
    );
    if (resultado.estado === 'incerto') return Response.json(resultado, { headers });
    if (!externaIniciada && resultado.estado === 'indisponivel')
      return await falhaAntesDaEscrita(503);
    const final = await portas.autorizar(request);
    const finalCredencial = await portas.lerCredencial();
    if (
      !final ||
      final.usuarioId !== identidade.usuarioId ||
      final.sessaoId !== identidade.sessaoId ||
      final.subjectGoogle !== identidade.subjectGoogle ||
      !finalCredencial ||
      finalCredencial.geracao !== credencial.geracao ||
      finalCredencial.refresh !== credencial.refresh
    )
      return Response.json({ estado: 'incerto' }, { headers });
    const desfecho = resultado.estado === 'confirmado' ? 'confirmada' : 'nao_realizada';
    if (!(await portas.resolverEscrita(entrada.operacao_id, identidade.subjectGoogle, desfecho)))
      return Response.json({ estado: 'incerto' }, { headers });
    if (resultado.estado !== 'confirmado') return Response.json(resultado, { headers });
    return Response.json({ ...resultado, origem: 'google', autoria: 'individual' }, { headers });
  } catch {
    if (reserva && !externaIniciada) return await falhaAntesDaEscrita(503);
    return enviada ? Response.json({ estado: 'incerto' }, { headers }) : erro(503);
  }
}
