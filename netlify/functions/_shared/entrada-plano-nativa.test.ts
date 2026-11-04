import { expect, it, vi } from 'vitest';
import { criarEntradaPlanoNativa } from './entrada-plano-nativa.ts';

const id = '10000000-0000-4000-8000-000000000001';
const cabecalhos = {
  'x-sessao': id,
  origin: 'https://app.example',
  'content-type': 'application/json',
};
it('valida sessão e encaminha operação com origem à composição; propaga negativa', async () => {
  const barreira = vi.fn(async (pedido: Request) => {
    expect(pedido.headers.get('origin')).toBe('https://app.example');
    return { ok: false as const, erro: { codigo: 'nao_autenticado' }, request_id: id };
  });
  const plano = vi.fn();
  const entrada = criarEntradaPlanoNativa({} as never, { barreira, plano } as never);
  const ausente = await entrada.atender(
    new Request('https://app.example/api/plano/reserva/consultar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }),
  );
  expect(ausente.status).toBe(401);
  expect(barreira).not.toHaveBeenCalled();
  const negada = await entrada.atender(
    new Request('https://app.example/api/plano/reserva/consultar', {
      method: 'POST',
      headers: cabecalhos,
      body: '{}',
    }),
  );
  expect(negada.status).toBe(401);
  expect(barreira).toHaveBeenCalledWith(
    expect.any(Request),
    { operacao: 'api.consultar_barreira_plano' },
    expect.anything(),
  );
});
it('encaminha criação validada, chave e sessão sem registrar rota pública', async () => {
  const plano = vi.fn(async (_pedido: Request) => ({
    ok: false as const,
    erro: { codigo: 'sem_permissao' },
    request_id: id,
  }));
  const entrada = criarEntradaPlanoNativa({} as never, { plano, barreira: vi.fn() } as never);
  const objetivo = {
    descricao: 'Fictício',
    area: 'Área',
    responsavel: 'Equipe',
    situacaoInicial: 'Inicial',
    observacaoProgresso: 'Progresso',
    dataRevisao: '2026-12-01',
    estado: 'proposto',
  };
  const resposta = await entrada.atender(
    new Request(`https://app.example/api/pacientes/${id}/plano`, {
      method: 'POST',
      headers: { ...cabecalhos, 'x-chave-idempotencia': id },
      body: JSON.stringify({ objetivo_id: id, objetivo, reserva_id: id, geracao_reserva: 1 }),
    }),
  );
  expect(resposta.status).toBe(403);
  expect(plano).toHaveBeenCalledWith(
    expect.any(Request),
    {
      operacao: 'gravar',
      paciente_id: id,
      versao_esperada: 0,
      objetivo_id: id,
      objetivo,
      reserva_id: id,
      geracao_reserva: 1,
    },
    expect.anything(),
  );
  const pedido = plano.mock.calls[0]?.[0] as unknown as Request;
  expect(pedido.headers.get('x-sessao')).toBe(id);
  expect(pedido.headers.get('x-chave-idempotencia')).toBe(id);
});
