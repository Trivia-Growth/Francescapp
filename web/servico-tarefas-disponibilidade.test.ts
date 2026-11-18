// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { criarServicoTarefasHttp } from './servico-tarefas-http.ts';

const paciente = 'c0000000-0000-4000-8000-000000000003';
const identidade = {
  usuario_id: 'a0000000-0000-4000-8000-000000000001',
  session_id: 'b0000000-0000-4000-8000-000000000002',
};
const request_id = 'd0000000-0000-4000-8000-000000000004';
afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
});
function preparar() {
  sessionStorage.setItem('modo-acesso', 'google');
  sessionStorage.setItem('fluxo-google', 'a'.repeat(22));
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

it.each([true, false])(
  'consulta capability explícita do servidor: %s',
  async (escrita_disponivel) => {
    const fetch = preparar();
    fetch.mockResolvedValue(Response.json({ dados: { escrita_disponivel }, request_id }));
    expect(
      await criarServicoTarefasHttp(() => identidade).consultarDisponibilidade(paciente),
    ).toEqual({ escrita_disponivel });
    expect(fetch.mock.calls[0]?.[0]).toBe(`/api/pacientes/${paciente}/tarefas/disponibilidade`);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      headers: { 'x-sessao': identidade.session_id, 'x-fluxo': 'a'.repeat(22) },
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
    });
  },
);

it('descarta capability de identidade antiga após resposta', async () => {
  const fetch = preparar();
  let atual: typeof identidade | null = identidade;
  fetch.mockImplementation(async () => {
    atual = null;
    return Response.json({ dados: { escrita_disponivel: true }, request_id });
  });
  await expect(
    criarServicoTarefasHttp(() => atual).consultarDisponibilidade(paciente),
  ).rejects.toMatchObject({ codigo: 'nao_autenticado', status: 401 });
});

it.each([{}, { escrita_disponivel: 'true' }, { escrita_disponivel: true, tarefas: [] }])(
  'contrato inválido nunca habilita escrita: %j',
  async (dados) => {
    const fetch = preparar();
    fetch.mockResolvedValue(Response.json({ dados, request_id }));
    await expect(
      criarServicoTarefasHttp(() => identidade).consultarDisponibilidade(paciente),
    ).rejects.toMatchObject({ codigo: 'servico_indisponivel' });
  },
);

it('acesso negado continua erro, sem inventar capability positiva', async () => {
  const fetch = preparar();
  fetch.mockResolvedValue(
    Response.json(
      { erro: { codigo: 'sem_permissao', mensagem: 'Acesso negado.' }, request_id },
      { status: 403 },
    ),
  );
  await expect(
    criarServicoTarefasHttp(() => identidade).consultarDisponibilidade(paciente),
  ).rejects.toMatchObject({ codigo: 'sem_permissao', status: 403 });
});
