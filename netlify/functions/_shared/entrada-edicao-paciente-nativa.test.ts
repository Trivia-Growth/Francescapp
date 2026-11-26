import { beforeEach, expect, it, vi } from 'vitest';

const compor = vi.hoisted(() => vi.fn());
vi.mock('./compor-edicao-paciente-nativa.ts', () => ({ comporEdicaoPacienteNativa: compor }));
import { criarEntradaEdicaoPacienteNativa } from './entrada-edicao-paciente-nativa.ts';

const paciente = 'a0000000-0000-4000-8000-000000000001';
const sessao = 'b0000000-0000-4000-8000-000000000002';
const responsavel = 'c0000000-0000-4000-8000-000000000003';
const requestId = 'd0000000-0000-4000-8000-000000000004';
const entrada = criarEntradaEdicaoPacienteNativa({} as never);

const editar = (corpo: Record<string, unknown>) =>
  entrada.atender(
    new Request(`https://exemplo.test/api/pacientes/${paciente}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-sessao': sessao,
        'x-chave-idempotencia': 'chave-ficticia-123456',
      },
      body: JSON.stringify({
        entrada: { motivo: 'Mudança fictícia', versao_esperada: 1, ...corpo },
        reserva_id: 'e0000000-0000-4000-8000-000000000005',
        geracao_reserva: 1,
      }),
    }),
  );

beforeEach(() => compor.mockReset());

it('entrega situação e responsável à composição e traduz responsável inelegível em 422', async () => {
  compor.mockResolvedValue({
    ok: false,
    erro: { codigo: 'responsavel_invalido' },
    request_id: requestId,
  });
  const resposta = await editar({ situacao: 'ativo', responsavel_id: responsavel });
  expect(resposta.status).toBe(422);
  expect(await resposta.json()).toEqual({
    erro: {
      codigo: 'responsavel_invalido',
      mensagem: 'O responsável indicado não está disponível.',
    },
    request_id: requestId,
  });
  expect(compor.mock.calls[0]?.[1]).toMatchObject({
    tipo: 'editar',
    entrada: {
      pacienteId: paciente,
      corpo: { situacao: 'ativo', responsavel_id: responsavel, motivo: 'Mudança fictícia' },
    },
  });
});

it('recusa antes da composição situação fora do conjunto, responsável sem formato e pedido sem campo', async () => {
  for (const corpo of [
    { situacao: 'qualquer' },
    { situacao: 'ativo', responsavel_id: 'nao-e-uuid' },
    { situacao: 'ativo', observacao: 'campo extra' },
    {},
  ]) {
    const resposta = await editar(corpo);
    expect(resposta.status).toBe(422);
    expect((await resposta.json()).erro.codigo).toBe('entrada_invalida');
  }
  expect(compor).not.toHaveBeenCalled();
});

it('só devolve a leitura de edição se trouxer o histórico do caso no contrato', async () => {
  const cadastro = {
    id: paciente,
    nome: 'Paciente Fictício',
    nome_preferencia: null,
    data_nascimento: null,
    contatos: [],
    versao: 3,
  };
  const consultar = () =>
    entrada.atender(
      new Request(`https://exemplo.test/api/pacientes/${paciente}`, {
        headers: { 'x-sessao': sessao },
      }),
    );
  const mudanca = {
    versao: 3,
    situacao: 'pausado',
    responsavel_id: responsavel,
    responsavel_ativo: false,
    ator_id: 'f0000000-0000-4000-8000-000000000006',
    criado_em: '2026-11-08T22:15:31.123456+00:00',
    motivo: 'Pausa fictícia',
  };
  compor.mockResolvedValueOnce({
    ok: true,
    dados: { ...cadastro, acompanhamento: [mudanca] },
    request_id: requestId,
  });
  const completa = await consultar();
  expect(completa.status).toBe(200);
  expect((await completa.json()).dados.acompanhamento).toEqual([mudanca]);
  compor.mockResolvedValueOnce({ ok: true, dados: cadastro, request_id: requestId });
  expect((await consultar()).status).toBe(503);
});
