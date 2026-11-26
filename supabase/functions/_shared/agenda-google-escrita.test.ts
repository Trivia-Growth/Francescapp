import { afterEach, describe, expect, it, vi } from 'vitest';
import { escreverAgendaGoogle } from './agenda-google-escrita.ts';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const operacaoId = '10000000-0000-4000-8000-000000000001';
const id = operacaoId.replaceAll('-', '');
const inicio = '2026-11-18T12:00:00Z';
const fim = '2026-11-18T13:00:00Z';
const evento = {
  id,
  etag: 'versao-ficticia',
  start: { dateTime: inicio },
  end: { dateTime: fim },
  extendedProperties: { private: { ffcm_operacao: operacaoId } },
};
describe('evento único confirmado na origem', () => {
  it.each(['criar', 'alterar'] as const)(
    'não confirma %s quando origem já cancelou evento',
    async (acao) => {
      const respostas = [
        Response.json({ items: [] }),
        ...(acao === 'alterar' ? [Response.json(evento)] : []),
        Response.json(evento),
        Response.json({ ...evento, status: 'cancelled' }),
      ];
      const fetch = vi.fn();
      for (const resposta of respostas) fetch.mockResolvedValueOnce(resposta);
      vi.stubGlobal('fetch', fetch);
      expect(
        await escreverAgendaGoogle(
          'ficticio',
          { acao, operacaoId, inicio, fim, eventoId: id, etag: evento.etag },
          async () => true,
        ),
      ).toEqual({ estado: 'incerto' });
      expect(
        fetch.mock.calls.filter(([, opcoes]) => ['POST', 'PATCH'].includes(opcoes?.method)),
      ).toHaveLength(1);
    },
  );
  it('criar exige reconsulta do marcador e horários', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ items: [] }))
      .mockResolvedValueOnce(Response.json(evento))
      .mockResolvedValueOnce(Response.json(evento));
    vi.stubGlobal('fetch', fetch);
    expect(
      await escreverAgendaGoogle(
        'ficticio',
        { acao: 'criar', operacaoId, inicio, fim },
        async () => true,
      ),
    ).toEqual({ estado: 'confirmado', evento_id: id, etag: 'versao-ficticia' });
    expect(fetch.mock.calls[2]?.[1]?.method).toBeUndefined();
  });
  it('ACK sem confirmação externa permanece incerto e não repete POST', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ items: [] }))
      .mockResolvedValueOnce(Response.json(evento))
      .mockRejectedValueOnce(new Error('falha ficticia'));
    vi.stubGlobal('fetch', fetch);
    expect(
      await escreverAgendaGoogle(
        'ficticio',
        { acao: 'criar', operacaoId, inicio, fim },
        async () => true,
      ),
    ).toEqual({ estado: 'incerto' });
    expect(fetch.mock.calls.filter(([, opcoes]) => opcoes?.method === 'POST')).toHaveLength(1);
  });
  it('cancelamento só confirma após ausência consultada na origem', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(evento))
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(new Response(null, { status: 404 })),
    );
    expect(
      await escreverAgendaGoogle(
        'ficticio',
        { acao: 'cancelar', operacaoId, eventoId: id, etag: evento.etag },
        async () => true,
      ),
    ).toEqual({ estado: 'confirmado', evento_id: id });
  });
  it('ocorrência recorrente fica fora da V1 sem escrita', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ ...evento, recurringEventId: 'serie-ficticia' }));
    vi.stubGlobal('fetch', fetch);
    expect(
      await escreverAgendaGoogle(
        'ficticio',
        { acao: 'cancelar', operacaoId, eventoId: id, etag: evento.etag },
        async () => true,
      ),
    ).toEqual({ estado: 'conflito_versao' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('revogação antes do envio impede escrita', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ items: [] }));
    vi.stubGlobal('fetch', fetch);
    expect(
      await escreverAgendaGoogle(
        'ficticio',
        { acao: 'criar', operacaoId, inicio, fim },
        async () => false,
      ),
    ).toEqual({ estado: 'indisponivel' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
