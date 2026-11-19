import { describe, expect, it, vi } from 'vitest';
import { operarTurnoNativo } from './turno-nativo.ts';

const id = 'a0000000-0000-4000-8000-000000000001';
const outro = 'a0000000-0000-4000-8000-000000000002';
const abertura = {
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

// PREPARADO, NÃO EXECUTADO. Prova somente fronteira com adapter sintético.
describe('turno grupo 3 — encerramento e recuperação', () => {
  it('encerra a versão própria confirmada e prende síntese ao digest lógico', async () => {
    const p = portas();
    p.executar = vi.fn(async (_r, t) => ({
      ok: true,
      repeticao: false,
      dados: { ...turno, situacao: 'encerrado', versao: 2, encerrado_em: '2026-11-18T13:00:00Z' },
      request_id: t.p_transporte.entrada.request_id,
    }));
    const comando = {
      ...abertura,
      operacao: 'encerrar' as const,
      versao_esperada: 1,
      sintese_registro_id: outro,
    };
    expect(await operarTurnoNativo(pedido(), comando, p)).toMatchObject({
      ok: true,
      dados: { situacao: 'encerrado', versao: 2 },
    });
    const logico = vi.mocked(p.idempotencia.calcularDigestIdempotencia).mock.calls[0]?.[0];
    expect(JSON.parse(logico ?? '{}')).toMatchObject({
      sintese_registro_id: outro,
      versao_esperada: 1,
    });
    expect(vi.mocked(p.executar).mock.calls[0]?.[1].p_transporte.entrada).toMatchObject({
      chave_idempotencia: 'ficticio-1234567890',
      digest_idempotencia: 'a'.repeat(43),
    });
  });
  it('não confirma encerramento se adapter devolve turno aberto ou outra versão', async () => {
    const comando = {
      ...abertura,
      operacao: 'encerrar' as const,
      versao_esperada: 1,
      sintese_registro_id: outro,
    };
    expect(await operarTurnoNativo(pedido(), comando, portas())).toMatchObject({ ok: false });
    const p = portas();
    p.executar = vi.fn(async (_r, t) => ({
      ok: true,
      repeticao: false,
      dados: { ...turno, situacao: 'encerrado', versao: 3, encerrado_em: '2026-11-18T13:00:00Z' },
      request_id: t.p_transporte.entrada.request_id,
    }));
    expect(await operarTurnoNativo(pedido(), comando, p)).toMatchObject({ ok: false });
  });
  it('último recupera fechado próprio sem permitir escolha de autor ou turno', async () => {
    const p = portas();
    p.executar = vi.fn(async (_r, t) => ({
      ok: true,
      repeticao: false,
      dados: { ...turno, situacao: 'encerrado', versao: 2, encerrado_em: '2026-11-18T13:00:00Z' },
      request_id: t.p_transporte.entrada.request_id,
    }));
    expect(
      await operarTurnoNativo(pedido(), { operacao: 'consultar_ultimo', paciente_id: id }, p),
    ).toMatchObject({ ok: true, dados: { situacao: 'encerrado' } });
    const e = vi.mocked(p.executar).mock.calls[0]?.[1].p_transporte.entrada;
    expect(Object.keys(e ?? {}).sort()).toEqual(['atestado', 'modo', 'paciente_id', 'request_id']);
    expect(e?.modo).toBe('ultimo');
  });
});
