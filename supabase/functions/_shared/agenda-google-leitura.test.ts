import { afterEach, expect, it, vi } from 'vitest';
import { consultarAgendaGoogleIndividual } from './agenda-google-leitura.ts';

afterEach(() => vi.unstubAllGlobals());

it('solicita eventos expandidos em ordem cronológica em todas as páginas', async () => {
  const fetchGoogle = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ items: [], nextPageToken: 'pagina-ficticia' }))
    .mockResolvedValueOnce(Response.json({ items: [] }));
  vi.stubGlobal('fetch', fetchGoogle);
  const resultado = await consultarAgendaGoogleIndividual({
    habilitada: true,
    token: 'token-ficticio',
    inicio: '2026-11-01T00:00:00Z',
    fim: '2026-12-01T00:00:00Z',
  });
  expect(resultado).toEqual({ estado: 'disponivel', compromissos: [] });
  expect(fetchGoogle).toHaveBeenCalledTimes(2);
  for (const [url] of fetchGoogle.mock.calls) {
    const parametros = (url as URL).searchParams;
    expect(parametros.get('singleEvents')).toBe('true');
    expect(parametros.get('orderBy')).toBe('startTime');
  }
});
