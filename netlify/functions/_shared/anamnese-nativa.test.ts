import { describe, expect, it, vi } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { operarAnamneseNativa } from './anamnese-nativa.ts';
import { criarIdempotenciaNativa } from './idempotencia-nativa.ts';

const usuario_id = 'a0000000-0000-4000-8000-000000000001';
const session_id = 'b0000000-0000-4000-8000-000000000002';
const paciente_id = 'c0000000-0000-4000-8000-000000000003';
const secoes = [
  {
    id: 'saude',
    camposEsperados: ['alergia'],
    respostas: [{ campo: 'alergia', estado: 'pendente' }],
  },
];
const request = () =>
  new Request('https://exemplo.test/', {
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
    idempotencia: criarIdempotenciaNativa(cifra),
    autorizar: async () => ({ estado: 'autorizado' as const, identidade }),
    revalidar: async () => ({ estado: 'autorizado' as const, identidade }),
    metadados: (request_id: string) => ({
      key_id: 'teste',
      request_id,
      emitido_em: '2026-11-04T12:00:00Z',
      expira_em: '2026-11-04T12:00:30Z',
    }),
    atestador: criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(3) }),
    cifra,
    executar: vi.fn(
      async (
        _request: Request,
        { p_transporte }: { p_transporte: { entrada: Record<string, unknown> } },
      ) => {
        const entrada = p_transporte.entrada;
        return {
          ok: true,
          repeticao: false,
          request_id: entrada.request_id,
          dados: {
            registro_id: entrada.registro_id,
            paciente_id: entrada.paciente_id,
            versao: Number(entrada.versao_esperada) + 1,
            conteudo: entrada.conteudo,
          },
        };
      },
    ),
  };
}
describe('composição interna da anamnese', () => {
  it('cifra conteúdo, atesta e recupera versão com AAD vinculado', async () => {
    const deps = portas();
    const resultado = await operarAnamneseNativa(
      request(),
      { operacao: 'gravar', paciente_id, versao_esperada: 0, secoes },
      deps,
    );
    expect(resultado).toMatchObject({ ok: true, dados: { versao: 1, secoes } });
    const chamada = deps.executar.mock.calls[0];
    if (!chamada) throw new Error('Execução não ocorreu.');
    const transporte = chamada[1].p_transporte;
    expect(JSON.stringify(transporte)).not.toContain('alergia');
    expect(transporte.entrada.atestado).toMatchObject({
      operacao: 'api.gravar_anamnese',
      usuario_id,
      session_id,
    });
  });
  it('mantém digest lógico em tentativas e aceita versão original em repetição', async () => {
    const deps = portas();
    let primeira: Record<string, unknown> | undefined;
    const executar = vi.fn(
      async (
        _req: Request,
        { p_transporte }: { p_transporte: { entrada: Record<string, unknown> } },
      ) => {
        const entrada = p_transporte.entrada;
        primeira ??= entrada;
        return {
          ok: true,
          repeticao: primeira !== entrada,
          request_id: entrada.request_id,
          dados: {
            registro_id: primeira.registro_id,
            paciente_id,
            versao: 1,
            conteudo: primeira.conteudo,
          },
        };
      },
    );
    const comando = { operacao: 'gravar' as const, paciente_id, versao_esperada: 0, secoes };
    expect(await operarAnamneseNativa(request(), comando, { ...deps, executar })).toMatchObject({
      ok: true,
    });
    expect(await operarAnamneseNativa(request(), comando, { ...deps, executar })).toMatchObject({
      ok: true,
      dados: { versao: 1, secoes },
    });
    const entradas = executar.mock.calls.map((chamada) => chamada[1].p_transporte.entrada);
    expect(entradas[0]?.digest_idempotencia).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(entradas[0]?.digest_idempotencia).toBe(entradas[1]?.digest_idempotencia);
    expect(entradas[0]?.registro_id).not.toBe(entradas[1]?.registro_id);
    expect(entradas[0]?.chave_idempotencia).toBe('chave_ficticia_123456');
  });
  it('distingue conflito de chave e não entrega conteúdo', async () => {
    const deps = portas();
    const resultado = await operarAnamneseNativa(
      request(),
      { operacao: 'gravar', paciente_id, versao_esperada: 0, secoes },
      {
        ...deps,
        executar: async (_req, { p_transporte }) => ({
          ok: false,
          erro: { codigo: 'conflito_idempotencia' },
          request_id: p_transporte.entrada.request_id,
        }),
      },
    );
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'conflito_idempotencia' } });
  });
  it('rejeita gravação sem chave antes de executar', async () => {
    const deps = portas();
    const resultado = await operarAnamneseNativa(
      new Request('https://exemplo.test/', { headers: { 'x-sessao': session_id } }),
      { operacao: 'gravar', paciente_id, versao_esperada: 0, secoes },
      deps,
    );
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'entrada_invalida' } });
    expect(deps.executar).not.toHaveBeenCalled();
  });
  it('nega sessão divergente antes de executar', async () => {
    const deps = portas();
    const resultado = await operarAnamneseNativa(
      new Request('https://exemplo.test/'),
      { operacao: 'ler', paciente_id },
      deps,
    );
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'nao_autenticado' } });
    expect(deps.executar).not.toHaveBeenCalled();
  });
  it('não entrega conteúdo quando sessão é revogada durante leitura', async () => {
    const deps = portas();
    const resultado = await operarAnamneseNativa(
      request(),
      { operacao: 'ler', paciente_id },
      {
        ...deps,
        executar: async (_req, { p_transporte }) => ({
          ok: true,
          repeticao: false,
          request_id: p_transporte.entrada.request_id,
          dados: null,
        }),
        revalidar: async () => ({ estado: 'nao_autenticado' }),
      },
    );
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'nao_autenticado' } });
  });
});

describe('histórico privado', () => {
  it('atesta cursor e decifra versão com proveniência, recusando resposta fora da página', async () => {
    const deps = portas();
    const registro_id = 'd0000000-0000-4000-8000-000000000004';
    const conteudo = await deps.cifra.cifrar(JSON.stringify(secoes), {
      tabela: 'cadastro.anamnese_versao',
      paciente_id,
      registro_id,
      versao: 2,
      campo: 'conteudo',
      formato: 1,
    });
    const executar = vi.fn(
      async (
        _request: Request,
        { p_transporte }: { p_transporte: { entrada: Record<string, unknown> } },
      ) => ({
        ok: true,
        repeticao: false,
        request_id: p_transporte.entrada.request_id,
        dados: {
          registro_id,
          paciente_id,
          versao: 2,
          conteudo,
          criado_por_usuario_id: usuario_id,
          criado_em: '2026-11-04T12:00:00Z',
        },
      }),
    );
    const r = await operarAnamneseNativa(
      request(),
      { operacao: 'historico', paciente_id, antes_versao: 3 },
      { ...deps, executar },
    );
    expect(r).toMatchObject({
      ok: true,
      dados: { versao: 2, secoes, criado_por_usuario_id: usuario_id },
    });
    expect(executar.mock.calls[0]?.[1].p_transporte.entrada).toMatchObject({
      antes_versao: 3,
      atestado: { operacao: 'api.ler_anamnese' },
    });
    const fora = await operarAnamneseNativa(
      request(),
      { operacao: 'historico', paciente_id, antes_versao: 2 },
      { ...deps, executar },
    );
    expect(fora).toMatchObject({ ok: false, erro: { codigo: 'servico_indisponivel' } });
  });
});
