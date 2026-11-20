import { beforeEach, expect, it, vi } from 'vitest';
import tarefasCuidado from '../tarefas-cuidado.ts';
import { comporTarefaCuidadoNativo } from './compor-tarefa-cuidado-nativo.ts';
import { configurarDependenciasNativas } from './configurar-dependencias-nativas.ts';
import { servicoAtivo } from './configuracao-servidor.ts';

vi.mock('./compor-tarefa-cuidado-nativo.ts', () => ({ comporTarefaCuidadoNativo: vi.fn() }));
vi.mock('./configurar-dependencias-nativas.ts', () => ({ configurarDependenciasNativas: vi.fn() }));
vi.mock('./entrada-tarefa-cuidado-nativa.ts', () => ({
  criarEntradaTarefaCuidadoNativa: vi.fn(() => ({ atender: vi.fn(), atenderCriacao: vi.fn() })),
}));
vi.mock('./configuracao-servidor.ts', () => ({ servicoAtivo: vi.fn() }));
const compor = vi.mocked(comporTarefaCuidadoNativo);
const flag = vi.mocked(servicoAtivo);
const paciente = 'c0000000-0000-4000-8000-000000000003';
const sessao = 'b0000000-0000-4000-8000-000000000002';
const requestId = 'a0000000-0000-4000-8000-000000000001';
const pedido = (headers: HeadersInit = { 'x-sessao': sessao }) =>
  new Request(`https://exemplo.test/api/pacientes/${paciente}/tarefas/disponibilidade`, {
    headers,
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(configurarDependenciasNativas).mockReturnValue({ pool: {} } as ReturnType<
    typeof configurarDependenciasNativas
  >);
  compor.mockResolvedValue({ ok: true, dados: [], request_id: requestId });
  flag.mockResolvedValue(true);
});

it.each([null, 'ffcm.tarefas.ativas', 'ffcm.tarefas.escrita_ativa', 'ffcm.tarefas.barreira_ativa'])(
  'capability combina autorização SQL com três flags; desligada: %s',
  async (desligada) => {
    flag.mockImplementation(async (_pool, chave, padrao) => {
      expect(padrao).toBe(false);
      return chave !== desligada;
    });
    const resposta = await tarefasCuidado(pedido());
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({
      dados: { escrita_disponivel: desligada === null },
      request_id: requestId,
    });
    expect(compor.mock.calls[0]?.[1]).toEqual({
      operacao: 'ler',
      paciente_id: paciente,
      autorizacao_somente: true,
    });
    expect(flag).toHaveBeenCalledTimes(3);
    expect(resposta.headers.get('Cache-Control')).toBe('private, no-store');
  },
);

it.each(['nao_autenticado', 'sem_permissao'] as const)(
  'nega identidade ou vínculo: %s',
  async (codigo) => {
    compor.mockResolvedValue({ ok: false, erro: { codigo }, request_id: requestId });
    const resposta = await tarefasCuidado(pedido());
    expect(resposta.status).toBe(codigo === 'nao_autenticado' ? 401 : 403);
    expect(await resposta.json()).toMatchObject({ erro: { codigo } });
    expect(flag).not.toHaveBeenCalled();
  },
);

it('anônimo não alcança composição nem flags', async () => {
  const resposta = await tarefasCuidado(pedido({}));
  expect(resposta.status).toBe(401);
  expect(compor).not.toHaveBeenCalled();
  expect(flag).not.toHaveBeenCalled();
});

it('erro de persistência não produz capability positiva', async () => {
  compor.mockResolvedValue({
    ok: false,
    erro: { codigo: 'servico_indisponivel' },
    request_id: requestId,
  });
  const resposta = await tarefasCuidado(pedido());
  expect(resposta.status).toBe(503);
  expect(await resposta.json()).not.toHaveProperty('dados');
});

it('falha na consulta de flags após autorização não presume disponibilidade', async () => {
  flag.mockRejectedValue(new Error('falha interna ficticia'));
  const resposta = await tarefasCuidado(pedido());
  expect(resposta.status).toBe(503);
  expect(JSON.stringify(await resposta.json())).not.toContain('falha interna');
});
