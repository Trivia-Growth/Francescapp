import { afterEach, expect, it, vi } from 'vitest';

vi.mock('./configurar-dependencias-nativas.ts', () => ({
  configurarDependenciasNativas: () => ({}),
}));
vi.mock('./compor-equipe-barreira-nativa.ts', () => ({
  comporBarreiraEquipeNativa: vi.fn(async (_request: Request, rota: string) =>
    Response.json({ rota }),
  ),
}));

import barreiraEquipe from '../barreira-equipe.ts';

afterEach(() => vi.unstubAllEnvs());
it('exige ativação específica para a barreira e escrita', async () => {
  vi.stubEnv('FFCM_BARREIRA_EQUIPE_ATIVADA', 'false');
  expect(
    (await barreiraEquipe(new Request('https://example.test/api/equipe/barreira'))).status,
  ).toBe(503);
});
it('encaminha cada operação ao handler correspondente', async () => {
  vi.stubEnv('FFCM_BARREIRA_EQUIPE_ATIVADA', 'true');
  for (const [caminho, metodo, rota] of [
    ['', 'GET', 'consultar'],
    ['/reservar', 'POST', 'reservar'],
    ['/encerrar', 'POST', 'encerrar'],
    ['/reconhecer', 'POST', 'reconhecer'],
  ]) {
    const resposta = await barreiraEquipe(
      new Request(`https://example.test/api/equipe/barreira${caminho}`, { method: metodo }),
    );
    expect(await resposta.json()).toEqual({ rota });
  }
  expect(
    (await barreiraEquipe(new Request('https://example.test/api/equipe/barreira/reservar'))).status,
  ).toBe(404);
});
