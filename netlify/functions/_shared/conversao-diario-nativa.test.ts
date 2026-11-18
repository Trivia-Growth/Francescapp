import { expect, it, vi } from 'vitest';
import {
  operarConversaoDiarioNativa,
  type PortasConversaoDiario,
} from './conversao-diario-nativa.ts';
const id = '11111111-1111-4111-8111-111111111111';
const outro = '22222222-2222-4222-8222-222222222222';
const humano = {
  origem_versao: 1,
  tarefa_id: id,
  reserva_id: id,
  geracao_reserva: 1,
  motivo: 'Motivo fictício reservado',
  data_atencao: '2026-11-18',
  encaminhamento: 'Encaminhamento fictício reservado',
  responsavel: 'Responsável fictício reservado',
  prazo: '2026-11-19',
  prioridade: 'media' as const,
  area: 'Área fictícia',
};
const pedido = () =>
  new Request('https://example.test', {
    headers: { 'x-sessao': id, 'x-chave-idempotencia': 'chave-ficticia-123456789' },
  });
const comando = () => ({
  operacao: 'converter' as const,
  paciente_id: id,
  origem_id: outro,
  entrada: humano,
});
function preparar() {
  const claros: unknown[] = [];
  const autorizado = async () => ({
    estado: 'autorizado' as const,
    identidade: { usuario_id: id, session_id: id },
  });
  const portas: PortasConversaoDiario = {
    autorizar: autorizado,
    revalidar: autorizado,
    areas: ['Área fictícia'],
    metadados: (request_id) => ({
      request_id,
      key_id: 'teste',
      emitido_em: '2026-11-18T12:00:00Z',
      expira_em: '2026-11-18T12:00:30Z',
    }),
    cifra: {
      cifrar: vi.fn(async (texto) => {
        claros.push(JSON.parse(texto));
        return {
          formato: 1,
          key_id: 'teste',
          nonce: 'bm9uY2U',
          ciphertext: 'Y2lmcmE',
          tag: 'dGFn',
        };
      }),
      decifrar: async () => {
        throw new Error('Não deveria ler origem');
      },
    },
    idempotencia: { calcularDigestIdempotencia: vi.fn(async () => 'a'.repeat(43)) },
    atestador: {
      canonicalizar: JSON.stringify,
      atestarEntrada: async (metadados, entrada) => {
        const dados = { ...(metadados as Record<string, unknown>), digest_entrada: 'digest' };
        return {
          atestado: { ...dados, mac: 'mac' },
          entradaCanonica: JSON.stringify(entrada),
          dadosCanonicos: JSON.stringify(dados),
        };
      },
    },
    executar: vi.fn(async (_request, tr) => ({
      ok: true,
      repeticao: false,
      request_id: tr.p_transporte.entrada.request_id,
      dados: {
        conversao_id: id,
        paciente_id: id,
        origem_id: outro,
        origem_versao: 1,
        tarefa_id: id,
        evolucao_id: '33333333-3333-4333-8333-333333333333',
        ator_usuario_id: id,
        registrado_em: '2026-11-18T12:00:00Z',
      },
    })),
  };
  return { portas, claros };
}
it('prepara três filhas assinadas mas executa somente uma RPC agregada sem texto clínico', async () => {
  const { portas, claros } = preparar();
  expect(await operarConversaoDiarioNativa(pedido(), comando(), portas)).toMatchObject({
    ok: true,
  });
  expect(portas.executar).toHaveBeenCalledOnce();
  expect(portas.cifra.cifrar).toHaveBeenCalledTimes(2);
  const tr = vi.mocked(portas.executar).mock.calls[0]?.[1].p_transporte;
  expect(tr?.entrada.tarefa?.entrada.tarefa_id).toBe(id);
  expect(tr?.entrada.diario?.entrada).toMatchObject({
    tipo: 'evolucao_profissional',
    estado: 'publicado',
    audiencia: 'equipe',
    atencao: true,
    retorno_solicitado: false,
    tarefa_id: id,
  });
  expect(tr?.entrada.diario?.entrada).not.toHaveProperty('responde_registro_id');
  expect(tr?.entrada.diario?.entrada.diario_registro_id).not.toBe(outro);
  expect(claros[1]).toMatchObject({
    data: humano.data_atencao,
    area: humano.area,
    atividade: humano.motivo,
    proximoPasso: humano.encaminhamento,
  });
  const serializado = JSON.stringify(tr);
  for (const texto of [humano.motivo, humano.encaminhamento, humano.responsavel])
    expect(serializado).not.toContain(texto);
});
it('digest lógico permanece estável apesar de novos IDs de tarefa/reserva e IVs', async () => {
  const { portas } = preparar();
  await operarConversaoDiarioNativa(pedido(), comando(), portas);
  await operarConversaoDiarioNativa(
    pedido(),
    {
      ...comando(),
      entrada: { ...humano, tarefa_id: outro, reserva_id: outro, geracao_reserva: 2 },
    },
    portas,
  );
  const chamadas = vi.mocked(portas.idempotencia.calcularDigestIdempotencia).mock.calls;
  expect(chamadas[0]?.[0]).toBe(chamadas[3]?.[0]);
});
it('nega área fora de catálogo, revogação e falha de persistência sem sucesso parcial', async () => {
  const { portas } = preparar();
  expect(
    await operarConversaoDiarioNativa(
      pedido(),
      { ...comando(), entrada: { ...humano, area: 'Fora catálogo' } },
      portas,
    ),
  ).toMatchObject({ ok: false, erro: { codigo: 'entrada_invalida' } });
  expect(portas.executar).not.toHaveBeenCalled();
  portas.revalidar = async () => ({ estado: 'sem_permissao' });
  expect(await operarConversaoDiarioNativa(pedido(), comando(), portas)).toMatchObject({
    ok: false,
  });
  expect(portas.executar).not.toHaveBeenCalled();
  const falha = preparar().portas;
  falha.executar = vi.fn(async () => {
    throw new Error('Resposta perdida');
  });
  expect(await operarConversaoDiarioNativa(pedido(), comando(), falha)).toMatchObject({
    ok: false,
    erro: { codigo: 'pendencia_externa' },
  });
  expect(falha.executar).toHaveBeenCalledOnce();
});
it('consulta recibo sem preparar ou executar escritas filhas', async () => {
  const { portas } = preparar();
  expect(
    await operarConversaoDiarioNativa(
      pedido(),
      { operacao: 'consultar', paciente_id: id, origem_id: outro },
      portas,
    ),
  ).toMatchObject({ ok: true });
  expect(portas.cifra.cifrar).not.toHaveBeenCalled();
  const tr = vi.mocked(portas.executar).mock.calls[0]?.[1].p_transporte;
  expect(tr?.entrada).not.toHaveProperty('tarefa');
  expect(tr?.entrada).not.toHaveProperty('diario');
});
it('recusa alteração do agregado pelo assinador antes da RPC', async () => {
  const { portas } = preparar();
  const original = portas.atestador.atestarEntrada;
  portas.atestador.atestarEntrada = async (dados, entrada) =>
    original(dados, { ...entrada, paciente_id: outro });
  expect(await operarConversaoDiarioNativa(pedido(), comando(), portas)).toMatchObject({
    ok: false,
  });
  expect(portas.executar).not.toHaveBeenCalled();
});

it('falha transacional confirmada pelo banco não é diagnosticada como conflito de versão', async () => {
  const { portas } = preparar();
  portas.executar = vi.fn(async (_request, tr) => ({
    ok: false,
    erro: { codigo: 'servico_indisponivel' },
    request_id: tr.p_transporte.entrada.request_id,
  }));
  expect(await operarConversaoDiarioNativa(pedido(), comando(), portas)).toMatchObject({
    ok: false,
    erro: { codigo: 'servico_indisponivel' },
  });
});
