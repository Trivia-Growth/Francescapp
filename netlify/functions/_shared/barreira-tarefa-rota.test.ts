import { afterEach, expect, it, vi } from 'vitest';

vi.mock('./configurar-dependencias-nativas.ts', () => ({
  configurarDependenciasNativas: () => ({}),
}));
vi.mock('./compor-barreira-tarefa-nativa.ts', () => ({
  comporBarreiraTarefaNativa: vi.fn(async (_request: Request, rota: string) =>
    Response.json({ rota }),
  ),
}));

import barreiraTarefa from '../barreira-tarefa.ts';
import tarefasCuidado from '../tarefas-cuidado.ts';

afterEach(() => vi.unstubAllEnvs());
it('exige ativação específica para a barreira e escrita', async () => {
  vi.stubEnv('FFCM_TAREFAS_ATIVADAS', 'true');
  vi.stubEnv('FFCM_TAREFAS_ESCRITA_ATIVADA', 'true');
  vi.stubEnv('FFCM_BARREIRA_TAREFA_ATIVADA', 'false');
  expect(
    (await barreiraTarefa(new Request('https://example.test/api/tarefas/barreira'))).status,
  ).toBe(503);
  expect(
    (
      await tarefasCuidado(
        new Request(
          'https://example.test/api/pacientes/a0000000-0000-4000-8000-000000000001/tarefas',
          { method: 'POST' },
        ),
      )
    ).status,
  ).toBe(503);
});
it('encaminha cada operação ao handler correspondente', async () => {
  vi.stubEnv('FFCM_TAREFAS_ATIVADAS', 'true');
  vi.stubEnv('FFCM_TAREFAS_ESCRITA_ATIVADA', 'true');
  vi.stubEnv('FFCM_BARREIRA_TAREFA_ATIVADA', 'true');
  for (const [caminho, metodo, rota] of [
    ['', 'GET', 'consultar'],
    ['/reservar', 'POST', 'reservar'],
    ['/encerrar', 'POST', 'encerrar'],
    ['/reconhecer', 'POST', 'reconhecer'],
  ]) {
    const resposta = await barreiraTarefa(
      new Request(`https://example.test/api/tarefas/barreira${caminho}`, { method: metodo }),
    );
    expect(await resposta.json()).toEqual({ rota });
  }
  expect(
    (await barreiraTarefa(new Request('https://example.test/api/tarefas/barreira/reservar')))
      .status,
  ).toBe(404);
});
