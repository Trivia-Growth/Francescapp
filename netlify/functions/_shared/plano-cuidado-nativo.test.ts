import { criarCursorReconciliacao } from '../../../packages/cadastro/src/cursor-reconciliacao.ts';
import { describe, expect, it, vi } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { criarIdempotenciaNativa } from './idempotencia-nativa.ts';
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
const request = () =>
  new Request('https://exemplo.test', {
    headers: { 'x-sessao': session_id, 'x-chave-idempotencia': 'chave_ficticia_123456' },
  });
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
    cursor: criarCursorReconciliacao(new Uint8Array(32).fill(7)),
    idempotencia: criarIdempotenciaNativa(cifra),
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
  reserva_id: 'f0000000-0000-4000-8000-000000000006',
  geracao_reserva: 1,
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
  it('repete o comando com HMAC estável e devolve a versão original', async () => {
    const deps = portas();
    let original: Awaited<ReturnType<typeof deps.executar>> | undefined;
    const executar: typeof deps.executar = vi.fn(async (req, transporte) => {
      const resposta = await deps.executar(req, transporte);
      if (!original) {
        original = resposta;
        return { ...resposta, repeticao: false };
      }
      return { ...original, request_id: resposta.request_id, repeticao: true };
    });
    const primeira = await operarPlanoCuidadoNativo(request(), comando, { ...deps, executar });
    const segunda = await operarPlanoCuidadoNativo(request(), comando, { ...deps, executar });
    expect(primeira.ok && segunda.ok && segunda.dados).toEqual(primeira.ok && primeira.dados);
    const entradas = executar.mock.calls.map((chamada) => chamada[1].p_transporte.entrada);
    expect(entradas[0]?.digest_idempotencia).toBe(entradas[1]?.digest_idempotencia);
    expect(entradas[0]?.registro_id).not.toBe(entradas[1]?.registro_id);
    expect(entradas[0]?.chave_idempotencia).toBe('chave_ficticia_123456');
    const conflito = await operarPlanoCuidadoNativo(request(), comando, {
      ...deps,
      executar: async (_req, t) => ({
        ok: false,
        request_id: t.p_transporte.entrada.request_id,
        erro: { codigo: 'conflito_idempotencia' },
      }),
    });
    expect(conflito).toMatchObject({ ok: false, erro: { codigo: 'conflito_idempotencia' } });
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
      await operarPlanoCuidadoNativo(
        new Request('https://exemplo.test', {
          headers: { 'x-chave-idempotencia': 'chave_ficticia_123456' },
        }),
        comando,
        deps,
      ),
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
          dados: { itens: [], proximo_cursor: null },
        }),
        revalidar: async () => ({ estado: 'nao_autenticado' }),
      },
    );
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'nao_autenticado' } });
  });
  it('consulta histórico de um objetivo e recusa registros de outro', async () => {
    const deps = portas();
    await operarPlanoCuidadoNativo(request(), comando, deps);
    const entrada = deps.executar.mock.calls[0]?.[1].p_transporte.entrada;
    if (!entrada) throw new Error('Gravação não executada.');
    const registro = {
      registro_id: entrada.registro_id,
      objetivo_id,
      paciente_id,
      versao: 1,
      conteudo: entrada.conteudo,
    };
    const historico = { operacao: 'historico' as const, paciente_id, objetivo_id };
    const executar = async (
      _r: Request,
      t: { p_transporte: { entrada: Record<string, unknown> } },
    ) => ({
      ok: true,
      request_id: t.p_transporte.entrada.request_id,
      dados: { itens: [registro], proximo_cursor: null },
    });
    const resultado = await operarPlanoCuidadoNativo(request(), historico, { ...deps, executar });
    expect(resultado).toMatchObject({
      ok: true,
      dados: { itens: [{ objetivo_id, versao: 1, objetivo }] },
    });
    const trocado = await operarPlanoCuidadoNativo(request(), historico, {
      ...deps,
      executar: async (r, t) => ({
        ...(await executar(r, t)),
        dados: {
          itens: [{ ...registro, objetivo_id: 'e0000000-0000-4000-8000-000000000005' }],
          proximo_cursor: null,
        },
      }),
    });
    expect(trocado).toMatchObject({ ok: false, erro: { codigo: 'servico_indisponivel' } });
  });
  it('continua histórico com cursor atestado e recusa uso em outro paciente ou sessão', async () => {
    const deps = portas();
    await operarPlanoCuidadoNativo(request(), comando, deps);
    const entrada = deps.executar.mock.calls[0]?.[1].p_transporte.entrada;
    if (!entrada) throw new Error('Gravação não executada.');
    const registro = {
      registro_id: entrada.registro_id,
      objetivo_id,
      paciente_id,
      versao: 1,
      conteudo: entrada.conteudo,
    };
    const executar = vi.fn(
      async (_r: Request, t: { p_transporte: { entrada: Record<string, unknown> } }) => ({
        ok: true,
        request_id: t.p_transporte.entrada.request_id,
        dados:
          t.p_transporte.entrada.cursor === null
            ? { itens: [registro], proximo_cursor: 1 }
            : { itens: [], proximo_cursor: null },
      }),
    );
    const consulta = { operacao: 'historico' as const, paciente_id, objetivo_id, limite: 1 };
    const primeira = await operarPlanoCuidadoNativo(request(), consulta, { ...deps, executar });
    if (
      !primeira.ok ||
      !primeira.dados ||
      !('proximo_cursor' in primeira.dados) ||
      !primeira.dados.proximo_cursor
    )
      throw new Error('Cursor ausente.');
    const cursor = primeira.dados.proximo_cursor;
    expect(
      await operarPlanoCuidadoNativo(request(), { ...consulta, cursor }, { ...deps, executar }),
    ).toMatchObject({ ok: true, dados: { itens: [], proximo_cursor: null } });
    expect(executar.mock.calls[1]?.[1].p_transporte.entrada).toMatchObject({
      cursor: 1,
      limite: 1,
    });
    expect(
      await operarPlanoCuidadoNativo(
        request(),
        { ...consulta, cursor, paciente_id: 'e0000000-0000-4000-8000-000000000005' },
        { ...deps, executar },
      ),
    ).toMatchObject({ ok: false, erro: { codigo: 'entrada_invalida' } });
    const outraSessao = 'e0000000-0000-4000-8000-000000000005';
    const identidade = { usuario_id, session_id: outraSessao };
    const autorizado = async () => ({ estado: 'autorizado' as const, identidade });
    expect(
      await operarPlanoCuidadoNativo(
        new Request('https://exemplo.test', { headers: { 'x-sessao': outraSessao } }),
        { ...consulta, cursor },
        { ...deps, autorizar: autorizado, revalidar: autorizado, executar },
      ),
    ).toMatchObject({ ok: false, erro: { codigo: 'entrada_invalida' } });
    expect(
      await operarPlanoCuidadoNativo(
        request(),
        { ...consulta, cursor: `${cursor.slice(0, -1)}${cursor.endsWith('A') ? 'B' : 'A'}` },
        { ...deps, executar },
      ),
    ).toMatchObject({ ok: false, erro: { codigo: 'entrada_invalida' } });
    expect(
      await operarPlanoCuidadoNativo(
        request(),
        { ...consulta, cursor, objetivo_id: 'e0000000-0000-4000-8000-000000000005' },
        { ...deps, executar },
      ),
    ).toMatchObject({ ok: false, erro: { codigo: 'entrada_invalida' } });
    expect(
      await operarPlanoCuidadoNativo(
        request(),
        { ...consulta, cursor },
        { ...deps, executar, autorizar: async () => ({ estado: 'sem_permissao' as const }) },
      ),
    ).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
    expect(executar).toHaveBeenCalledTimes(2);
  });
});
