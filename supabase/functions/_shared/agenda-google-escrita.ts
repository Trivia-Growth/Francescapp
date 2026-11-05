import { consultarAgendaGoogleIndividual } from './agenda-google-leitura.ts';

type Operacao = Readonly<{
  acao: 'criar' | 'alterar' | 'cancelar';
  operacaoId: string;
  inicio?: string;
  fim?: string;
  eventoId?: string;
  etag?: string;
  confirmarConflito?: boolean;
}>;
type Resultado = Readonly<{
  estado: 'confirmado' | 'conflito_horario' | 'conflito_versao' | 'incerto' | 'indisponivel';
  evento_id?: string;
  etag?: string;
}>;

/** Uma tentativa externa no máximo. `incerto` exige consulta à origem antes de repetir. */
export async function escreverAgendaGoogle(
  token: string,
  operacao: Operacao,
  autorizarAntesDaEscrita: () => Promise<boolean>,
): Promise<Resultado> {
  const indisponivel = { estado: 'indisponivel' } as const;
  const incerto = { estado: 'incerto' } as const;
  const base = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const controle = new AbortController();
  const prazo = setTimeout(() => controle.abort(), 15_000);
  let enviada = false;
  try {
    if (operacao.acao !== 'cancelar') {
      if (!operacao.inicio || !operacao.fim) return indisponivel;
      const consulta = await consultarAgendaGoogleIndividual({
        habilitada: true,
        token,
        inicio: operacao.inicio,
        fim: operacao.fim,
      });
      if (consulta.estado !== 'disponivel') return indisponivel;
      if (
        !operacao.confirmarConflito &&
        consulta.compromissos.some((evento) => evento.id !== operacao.eventoId)
      )
        return { estado: 'conflito_horario' };
    }
    const id =
      operacao.acao === 'criar'
        ? operacao.operacaoId.toLowerCase().replaceAll('-', '')
        : operacao.eventoId;
    if (!id) return indisponivel;
    const alvo = `${base}/${encodeURIComponent(id)}`;
    let propriedades: Record<string, string> = {};
    if (operacao.acao !== 'criar') {
      const anterior = await fetch(alvo, {
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'error',
        signal: controle.signal,
      });
      if (!anterior.ok) return indisponivel;
      const evento: unknown = await anterior.json();
      if (
        typeof evento !== 'object' ||
        evento === null ||
        !('etag' in evento) ||
        typeof evento.etag !== 'string' ||
        evento.etag !== operacao.etag ||
        ('recurrence' in evento && Array.isArray(evento.recurrence) && evento.recurrence.length > 0)
      )
        return { estado: 'conflito_versao' };
      if ('extendedProperties' in evento && evento.extendedProperties !== undefined) {
        if (typeof evento.extendedProperties !== 'object' || evento.extendedProperties === null)
          return indisponivel;
        const estendidas = evento.extendedProperties as Record<string, unknown>;
        if (estendidas.private !== undefined) {
          if (
            typeof estendidas.private !== 'object' ||
            estendidas.private === null ||
            Array.isArray(estendidas.private) ||
            Object.values(estendidas.private).some((v) => typeof v !== 'string')
          )
            return indisponivel;
          propriedades = { ...(estendidas.private as Record<string, string>) };
        }
      }
    }
    const alteracao =
      operacao.acao === 'cancelar'
        ? undefined
        : JSON.stringify({
            ...(operacao.acao === 'criar' ? { id, summary: 'Compromisso' } : {}),
            extendedProperties: {
              private: { ...propriedades, ffcm_operacao: operacao.operacaoId.toLowerCase() },
            },
            start: { dateTime: operacao.inicio, timeZone: 'America/Sao_Paulo' },
            end: { dateTime: operacao.fim, timeZone: 'America/Sao_Paulo' },
          });
    if (!(await autorizarAntesDaEscrita()) || controle.signal.aborted) return indisponivel;
    // Após o envio, revogação não cancela uma operação já recebida pelo Google.
    enviada = true;
    const resposta = await fetch(operacao.acao === 'criar' ? base : alvo, {
      method: operacao.acao === 'criar' ? 'POST' : operacao.acao === 'alterar' ? 'PATCH' : 'DELETE',
      headers: { ...headers, ...(operacao.etag ? { 'If-Match': operacao.etag } : {}) },
      ...(alteracao ? { body: alteracao } : {}),
      redirect: 'error',
      signal: controle.signal,
    });
    if (resposta.status === 412) return { estado: 'conflito_versao' };
    if (resposta.status === 409 || resposta.status >= 500) return incerto;
    if (!resposta.ok) return indisponivel;
    if (operacao.acao === 'cancelar') return { estado: 'confirmado', evento_id: id };
    const dados: unknown = await resposta.json();
    if (
      typeof dados !== 'object' ||
      dados === null ||
      !('id' in dados) ||
      dados.id !== id ||
      !('etag' in dados) ||
      typeof dados.etag !== 'string' ||
      !dados.etag
    )
      return incerto;
    return { estado: 'confirmado', evento_id: id, etag: dados.etag };
  } catch {
    return enviada ? incerto : indisponivel;
  } finally {
    clearTimeout(prazo);
  }
}
