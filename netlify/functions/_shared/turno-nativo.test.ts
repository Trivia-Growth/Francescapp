import { describe, expect, it, vi } from 'vitest';
import { operarTurnoNativo } from './turno-nativo.ts';

const id = 'a0000000-0000-4000-8000-000000000001';
const outro = 'a0000000-0000-4000-8000-000000000002';
const comando = {
  operacao: 'abrir' as const,
  paciente_id: id,
  turno_id: id,
  reserva_id: id,
  geracao_reserva: 1,
};
const pedido = () =>
  new Request('https://example.test', {
    headers: { 'x-sessao': id, 'x-chave-idempotencia': 'ficticio-1234567890' },
  });
const turno = {
  turno_id: id,
  paciente_id: id,
  profissional_usuario_id: id,
  aberto_em: '2026-11-18T12:00:00Z',
  encerrado_em: null,
  situacao: 'aberto',
  versao: 1,
  parametros: {
    duracao_padrao_minutos: 480,
    tolerancia_atraso_minutos: 15,
    tratamento_nao_encerrado: 'sinalizar_pendencia',
  },
};
type Portas = Parameters<typeof operarTurnoNativo>[2];
function portas(): Portas {
  const autorizar = async () => ({
    estado: 'autorizado' as const,
    identidade: { usuario_id: id, session_id: id },
  });
  return {
    autorizar,
    revalidar: autorizar,
    metadados: (request_id) => ({
      key_id: 'teste',
      emitido_em: '2026-11-18T12:00:00Z',
      expira_em: '2026-11-18T12:00:30Z',
      request_id,
    }),
    idempotencia: { calcularDigestIdempotencia: vi.fn(async () => 'a'.repeat(43)) },
    // Adapter simulado prova composição local; não prova criptografia, Auth ou RPC reais.
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
    executar: vi.fn(async (_request, transporte) => ({
      ok: true,
      repeticao: false,
      dados: turno,
      request_id: transporte.p_transporte.entrada.request_id,
    })),
  };
}

describe('turno — composição server-only', () => {
  it('envia identidade só no atestado; relógio e parâmetros vêm do banco', async () => {
    const p = portas();
    const resultado = await operarTurnoNativo(pedido(), comando, p);
    expect(resultado.ok).toBe(true);
    const transporte = vi.mocked(p.executar).mock.calls[0]?.[1].p_transporte;
    expect(transporte?.entrada).not.toHaveProperty('profissional_usuario_id');
    expect(transporte?.entrada).not.toHaveProperty('aberto_em');
    expect(transporte?.entrada).not.toHaveProperty('parametros');
    expect((transporte?.entrada.atestado as Record<string, unknown>).usuario_id).toBe(id);
  });
  it('nega sem chamar persistência quando identidade não é autorizada', async () => {
    const p = portas();
    p.autorizar = async () => ({ estado: 'sem_permissao' });
    const resultado = await operarTurnoNativo(pedido(), comando, p);
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
    expect(p.executar).not.toHaveBeenCalled();
  });
  it('revalida revogação antes da RPC e não cria sucesso falso na falha de persistência', async () => {
    const p = portas();
    p.revalidar = async () => ({ estado: 'nao_autenticado' });
    expect(await operarTurnoNativo(pedido(), comando, p)).toMatchObject({ ok: false });
    expect(p.executar).not.toHaveBeenCalled();
    const falha = portas();
    falha.executar = vi.fn(async () => {
      throw new Error('falha fictícia');
    });
    expect(await operarTurnoNativo(pedido(), comando, falha)).toMatchObject({
      ok: false,
      erro: { codigo: 'pendencia_externa' },
    });
  });
  it('preserva replay informado pelo banco e comando lógico estável para repetição', async () => {
    const p = portas();
    p.executar = vi.fn(async (_request, transporte) => ({
      ok: true,
      repeticao: true,
      dados: turno,
      request_id: transporte.p_transporte.entrada.request_id,
    }));
    expect(await operarTurnoNativo(pedido(), comando, p)).toMatchObject({
      ok: true,
      repeticao: true,
    });
    expect(await operarTurnoNativo(pedido(), comando, p)).toMatchObject({
      ok: true,
      repeticao: true,
    });
    const chamadas = vi.mocked(p.idempotencia.calcularDigestIdempotencia).mock.calls;
    expect(chamadas[0]?.[0]).toBe(chamadas[1]?.[0]);
  });
  it('recusa resposta de outro caso e encerramento sem prova da síntese', async () => {
    const p = portas();
    p.executar = vi.fn(async (_request, transporte) => ({
      ok: true,
      repeticao: false,
      dados: { ...turno, paciente_id: outro },
      request_id: transporte.p_transporte.entrada.request_id,
    }));
    expect(await operarTurnoNativo(pedido(), comando, p)).toMatchObject({ ok: false });
    expect(
      await operarTurnoNativo(
        pedido(),
        { ...comando, operacao: 'encerrar', versao_esperada: 1, sintese_registro_id: id },
        portas(),
      ),
    ).toMatchObject({ ok: false, erro: { codigo: 'conflito' } });
  });
});
