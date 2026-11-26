import { describe, expect, it, vi } from 'vitest';
import { operarTurnoNativo } from './turno-nativo.ts';

const id = 'a0000000-0000-4000-8000-000000000001';
const outro = 'a0000000-0000-4000-8000-000000000002';
const comando = { operacao: 'consultar_atual' as const, paciente_id: id };
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

// PREPARADO, NÃO EXECUTADO. Adapters fictícios não comprovam Auth/Vault/RLS reais.
describe('consulta atual própria — fronteira servidor', () => {
  it('atesta leitura sem aceitar turno/autor/relógio do navegador', async () => {
    const p = portas();
    expect(await operarTurnoNativo(pedido(), comando, p)).toMatchObject({ ok: true, dados: turno });
    const e = vi.mocked(p.executar).mock.calls[0]?.[1].p_transporte.entrada;
    expect(Object.keys(e ?? {}).sort()).toEqual(['atestado', 'paciente_id', 'request_id']);
    expect(e?.atestado).toMatchObject({ operacao: 'api.consultar_turno', usuario_id: id });
    expect(p.idempotencia.calcularDigestIdempotencia).not.toHaveBeenCalled();
  });
  it('aceita vazio somente após persistência autorizada e revalidações', async () => {
    const p = portas();
    p.revalidar = vi.fn(p.revalidar);
    p.executar = vi.fn(async (_r, t) => ({
      ok: true,
      repeticao: false,
      dados: null,
      request_id: t.p_transporte.entrada.request_id,
    }));
    expect(await operarTurnoNativo(pedido(), comando, p)).toMatchObject({ ok: true, dados: null });
    expect(p.revalidar).toHaveBeenCalledTimes(2);
  });
  it.each([
    { ...turno, paciente_id: outro },
    { ...turno, profissional_usuario_id: outro },
    { ...turno, situacao: 'encerrado', encerrado_em: '2026-11-18T13:00:00Z' },
  ])('recusa agregado que não seja aberto próprio deste caso', async (incorreto) => {
    const p = portas();
    p.executar = vi.fn(async (_r, t) => ({
      ok: true,
      repeticao: false,
      dados: incorreto,
      request_id: t.p_transporte.entrada.request_id,
    }));
    expect(await operarTurnoNativo(pedido(), comando, p)).toMatchObject({ ok: false });
  });
  it('revogação antes e depois da leitura não expõe sucesso/vazio', async () => {
    const p = portas();
    p.revalidar = vi.fn(async () => ({ estado: 'nao_autenticado' as const }));
    expect(await operarTurnoNativo(pedido(), comando, p)).toMatchObject({
      ok: false,
      erro: { codigo: 'nao_autenticado' },
    });
    expect(p.executar).not.toHaveBeenCalled();
    const q = portas();
    const vigente = q.revalidar;
    let chamada = 0;
    q.revalidar = async (r) => (++chamada === 1 ? vigente(r) : { estado: 'nao_autenticado' });
    expect(await operarTurnoNativo(pedido(), comando, q)).toMatchObject({
      ok: false,
      erro: { codigo: 'nao_autenticado' },
    });
  });
  it('falha de leitura não vira resultado incerto de mutação nem vazio', async () => {
    const p = portas();
    p.executar = vi.fn(async () => {
      throw new Error('falha fictícia');
    });
    expect(await operarTurnoNativo(pedido(), comando, p)).toMatchObject({
      ok: false,
      erro: { codigo: 'servico_indisponivel' },
    });
  });
});
