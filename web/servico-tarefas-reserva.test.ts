// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { criarServicoTarefasHttp } from './servico-tarefas-http.ts';

it('envia reserva e geração na criação e atualização', async () => {
  const usuario = '10000000-0000-4000-8000-000000000001';
  const paciente = '20000000-0000-4000-8000-000000000001';
  const tarefaId = '30000000-0000-4000-8000-000000000001';
  const reserva = { reserva_id: '40000000-0000-4000-8000-000000000001', geracao_reserva: 3 };
  const tarefa = {
    descricao: 'Revisar',
    responsavel: 'Equipe',
    prazo: '2026-12-01',
    prioridade: 'alta' as const,
    estado: 'pendente' as const,
  };
  sessionStorage.setItem('modo-acesso', 'google');
  sessionStorage.setItem('fluxo-google', 'abcdefghijklmnopqrstuv');
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const corpo = JSON.parse(String(init.body));
    return Response.json({
      dados: {
        tarefa_id: tarefaId,
        versao: (corpo.versao_esperada ?? 0) + 1,
        tarefa,
        ator_usuario_id: usuario,
        data: '2026-11-06T12:00:00.000Z',
      },
      request_id: usuario,
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  const servico = criarServicoTarefasHttp(() => ({ usuario_id: usuario, session_id: usuario }));
  await servico.criarTarefa(paciente, tarefaId, usuario, tarefa, reserva);
  await servico.atualizarTarefa(paciente, tarefaId, 1, usuario, tarefa, reserva);
  for (const [, init] of fetchMock.mock.calls)
    expect(JSON.parse(String(init.body))).toMatchObject(reserva);
});
afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
