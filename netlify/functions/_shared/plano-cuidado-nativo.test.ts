import { describe, expect, it, vi } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { operarPlanoCuidadoNativo } from './plano-cuidado-nativo.ts';

const usuario_id = 'a0000000-0000-4000-8000-000000000001';
const session_id = 'b0000000-0000-4000-8000-000000000002';
const paciente_id = 'c0000000-0000-4000-8000-000000000003';
const objetivo_id = 'd0000000-0000-4000-8000-000000000004';
const objetivo = {
  descricao: 'conteudo ficticio',
  area: 'saude',
  responsavel: 'equipe',
  situacaoInicial: 'inicial',
  observacaoProgresso: 'progresso',
  dataRevisao: '2026-12-01',
  estado: 'proposto',
};
const request = () => new Request('https://exemplo.test', { headers: { 'x-sessao': session_id } });
function portas() {
  const identidade = { usuario_id, session_id };
  const cifra = criarCifraAutenticada({
    keyIdAtiva: 'teste',
    chavesDeCifra: { teste: new Uint8Array(32).fill(2) },
    chaveHmac: new Uint8Array(32).fill(4),
  });
  return {
    autorizar: async () => ({ estado: 'autorizado' as const, identidade }),
    revalidar: async () => ({ estado: 'autorizado' as const, identidade }),
    metadados: (request_id: string) => ({
      key_id: 'teste',
      request_id,
      emitido_em: '2026-11-04T12:00:00Z',
      expira_em: '2026-11-04T12:00:30Z',
    }),
    cifra,
    atestador: criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(3) }),
    executar: vi.fn(
      async (
        _req: Request,
        { p_transporte }: { p_transporte: { entrada: Record<string, unknown> } },
      ) => {
        const e = p_transporte.entrada;
        return {
          ok: true,
          request_id: e.request_id,
          dados: {
            registro_id: e.registro_id,
            objetivo_id: e.objetivo_id,
            paciente_id: e.paciente_id,
            versao: Number(e.versao_esperada) + 1,
            conteudo: e.conteudo,
          },
        };
      },
    ),
  };
}
const comando = {
  operacao: 'gravar' as const,
  paciente_id,
  objetivo_id,
  versao_esperada: 0,
  objetivo,
};
describe('plano interno', () => {
  it('cifra e atesta sem enviar texto clínico ao banco', async () => {
    const deps = portas();
    const resultado = await operarPlanoCuidadoNativo(request(), comando, deps);
    expect(resultado).toMatchObject({
      ok: true,
      dados: { objetivo_id, versao: 1, objetivo, ator_usuario_id: usuario_id },
    });
    const transporte = deps.executar.mock.calls[0]?.[1].p_transporte;
    expect(JSON.stringify(transporte)).not.toContain('conteudo ficticio');
    expect(transporte?.entrada.atestado).toMatchObject({
      operacao: 'api.gravar_objetivo_cuidado',
      usuario_id,
      session_id,
    });
  });
  it('rejeita resposta de outro paciente e não entrega conteúdo', async () => {
    const deps = portas();
    const resultado = await operarPlanoCuidadoNativo(request(), comando, {
      ...deps,
      executar: async (req, t) => {
        const resposta = await deps.executar(req, t);
        return {
          ...resposta,
          dados: { ...resposta.dados, paciente_id: 'e0000000-0000-4000-8000-000000000005' },
        };
      },
    });
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'pendencia_externa' } });
  });
  it('rejeita envelope transferido para outro objetivo na leitura', async () => {
    const deps = portas();
    await operarPlanoCuidadoNativo(request(), comando, deps);
    const entrada = deps.executar.mock.calls[0]?.[1].p_transporte.entrada;
    if (!entrada) throw new Error('Gravação não executada.');
    const resultado = await operarPlanoCuidadoNativo(
      request(),
      { operacao: 'ler', paciente_id },
      {
        ...deps,
        executar: async (_r, t) => ({
          ok: true,
          request_id: t.p_transporte.entrada.request_id,
          dados: [
            {
              registro_id: entrada.registro_id,
              objetivo_id: 'e0000000-0000-4000-8000-000000000005',
              paciente_id,
              versao: 1,
              conteudo: entrada.conteudo,
            },
          ],
        }),
      },
    );
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'servico_indisponivel' } });
  });
  it('nega revisão sem motivo e sessão divergente antes do banco', async () => {
    const deps = portas();
    expect(
      await operarPlanoCuidadoNativo(request(), { ...comando, versao_esperada: 1 }, deps),
    ).toMatchObject({ ok: false, erro: { codigo: 'entrada_invalida' } });
    expect(
      await operarPlanoCuidadoNativo(new Request('https://exemplo.test'), comando, deps),
    ).toMatchObject({ ok: false, erro: { codigo: 'nao_autenticado' } });
    expect(deps.executar).not.toHaveBeenCalled();
  });
  it('não devolve leitura após revogação', async () => {
    const deps = portas();
    const resultado = await operarPlanoCuidadoNativo(
      request(),
      { operacao: 'ler', paciente_id },
      {
        ...deps,
        executar: async (_r, t) => ({
          ok: true,
          request_id: t.p_transporte.entrada.request_id,
          dados: [],
        }),
        revalidar: async () => ({ estado: 'nao_autenticado' }),
      },
    );
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'nao_autenticado' } });
  });
});
