// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { criarServicoConversaoDiarioHttp } from './servico-conversao-diario-http.ts';
import type { ConverterDiarioTarefa } from '../packages/contracts/src/conversao-diario-tarefa.ts';

const usuario_id = 'a0000000-0000-4000-8000-000000000001';
const session_id = 'b0000000-0000-4000-8000-000000000002';
const paciente_id = 'c0000000-0000-4000-8000-000000000003';
const origem_id = 'd0000000-0000-4000-8000-000000000004';
const tarefa_id = 'e0000000-0000-4000-8000-000000000005';
const recibo = {
  conversao_id: 'f0000000-0000-4000-8000-000000000006',
  paciente_id,
  origem_id,
  origem_versao: 1,
  tarefa_id,
  evolucao_id: '10000000-0000-4000-8000-000000000007',
  ator_usuario_id: usuario_id,
  registrado_em: '2026-11-18T12:00:00Z',
};
const entrada: ConverterDiarioTarefa = {
  origem_versao: 1,
  tarefa_id,
  reserva_id: '20000000-0000-4000-8000-000000000008',
  geracao_reserva: 2,
  motivo: 'Motivo fictício',
  data_atencao: '2026-11-18',
  encaminhamento: 'Ação fictícia',
  responsavel: 'Profissional fictício',
  prazo: '2026-11-20',
  prioridade: 'baixa',
  area: 'Área fictícia',
};
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

it('consulta ausência e executa uma única escrita atômica com reserva/chave e sem origem clínica', async () => {
  const fetch = preparar();
  fetch
    .mockResolvedValueOnce(Response.json({ dados: null, request_id: usuario_id }))
    .mockResolvedValueOnce(Response.json({ dados: recibo, request_id: usuario_id }));
  const servico = criarServicoConversaoDiarioHttp(() => ({ usuario_id, session_id }));
  expect(await servico.consultar(paciente_id, origem_id)).toBeNull();
  expect(
    await servico.converter(paciente_id, origem_id, entrada, 'chave-ficticia-conversao'),
  ).toEqual(recibo);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1]?.[0]).toBe(
    `/api/pacientes/${paciente_id}/diario/${origem_id}/conversao-tarefa`,
  );
  expect(fetch.mock.calls[1]?.[1]).toMatchObject({
    method: 'POST',
    cache: 'no-store',
    redirect: 'error',
    headers: {
      'x-sessao': session_id,
      'x-fluxo': 'a'.repeat(22),
      'x-chave-idempotencia': 'chave-ficticia-conversao',
    },
    body: JSON.stringify(entrada),
  });
  expect(sessionStorage.length).toBe(2);
  servico.desmontar();
});

it('recibo de outro caso é rejeitado sem anunciar sucesso', async () => {
  const fetch = preparar();
  fetch.mockResolvedValue(
    Response.json({ dados: { ...recibo, paciente_id: usuario_id }, request_id: usuario_id }),
  );
  const servico = criarServicoConversaoDiarioHttp(() => ({ usuario_id, session_id }));
  await expect(servico.consultar(paciente_id, origem_id)).rejects.toMatchObject({
    codigo: 'servico_indisponivel',
  });
  servico.desmontar();
});

it.each(['familiar', 'tecnica'])('não inicia operação por modo %s', async (modo) => {
  const fetch = preparar();
  sessionStorage.setItem('modo-acesso', modo);
  const servico = criarServicoConversaoDiarioHttp(() => ({ usuario_id, session_id }));
  await expect(servico.consultar(paciente_id, origem_id)).rejects.toMatchObject({
    codigo: 'nao_autenticado',
  });
  expect(fetch).not.toHaveBeenCalled();
  servico.desmontar();
});

it('troca de sessão ou desmontagem aborta/descarta resposta tardia sem afirmar rollback', async () => {
  const fetch = preparar();
  let resolver!: (resposta: Response) => void;
  fetch.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolver = resolve;
      }),
  );
  const servico = criarServicoConversaoDiarioHttp(() => ({ usuario_id, session_id }));
  const pedido = servico.converter(paciente_id, origem_id, entrada, 'chave-ficticia-conversao');
  servico.desmontar();
  expect(fetch.mock.calls[0]?.[1].signal.aborted).toBe(true);
  resolver(Response.json({ dados: recibo, request_id: usuario_id }));
  await expect(pedido).rejects.toMatchObject({ codigo: 'servico_indisponivel' });
});

it('falha de rede em POST permanece erro para recuperação pela barreira', async () => {
  const fetch = preparar();
  fetch.mockRejectedValue(new Error('conexão perdida'));
  const servico = criarServicoConversaoDiarioHttp(() => ({ usuario_id, session_id }));
  await expect(
    servico.converter(paciente_id, origem_id, entrada, 'chave-ficticia-conversao'),
  ).rejects.toMatchObject({ codigo: 'servico_indisponivel' });
  expect(fetch).toHaveBeenCalledTimes(1);
  servico.desmontar();
});
