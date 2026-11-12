import { describe, expect, it, vi } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { operarSaudeNativa } from './saude-nativa.ts';
import { criarIdempotenciaNativa } from './idempotencia-nativa.ts';

const usuario_id = 'a0000000-0000-4000-8000-000000000001';
const session_id = 'b0000000-0000-4000-8000-000000000002';
const paciente_id = 'c0000000-0000-4000-8000-000000000003';
// Dados fictícios; o relato leigo existe para provar que a natureza sobrevive ao ciclo.
const registros = [
  {
    id: 'r1',
    tipo: 'diagnostico' as const,
    descricao: 'Suspeita levantada na consulta.',
    origem: 'Dra. Fictícia',
    natureza: 'profissional' as const,
    data: '2026-03-02',
    situacao: 'hipotese' as const,
  },
  {
    id: 'r2',
    tipo: 'historico' as const,
    descricao: 'Família relata episódios de tontura ao levantar.',
    origem: 'Filha do paciente',
    natureza: 'relato_leigo' as const,
    data: '2026-03-05',
    situacao: 'confirmado' as const,
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

describe('composição interna do histórico de saúde', () => {
  it('cifra conteúdo, atesta e devolve a versão preservando origem e situação', async () => {
    const deps = portas();
    const resultado = await operarSaudeNativa(
      request(),
      { operacao: 'gravar', paciente_id, versao_esperada: 0, registros },
      deps,
    );
    expect(resultado).toMatchObject({ ok: true, dados: { versao: 1, registros } });
    const chamada = deps.executar.mock.calls[0];
    if (!chamada) throw new Error('Execução não ocorreu.');
    const transporte = chamada[1].p_transporte;
    // Nada de conteúdo clínico legível no transporte: só o envelope cifrado.
    expect(JSON.stringify(transporte)).not.toContain('tontura');
    expect(JSON.stringify(transporte)).not.toContain('Filha do paciente');
    expect(transporte.entrada.atestado).toMatchObject({
      operacao: 'api.gravar_saude',
      usuario_id,
      session_id,
    });
    expect(transporte.entrada.aad).toMatchObject({
      tabela: 'cadastro.saude_versao',
      paciente_id,
      versao: 1,
      campo: 'conteudo',
      formato: 1,
    });
  });

  it('mantém digest lógico entre tentativas e aceita a versão original na repetição', async () => {
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
    const comando = { operacao: 'gravar' as const, paciente_id, versao_esperada: 0, registros };
    expect(await operarSaudeNativa(request(), comando, { ...deps, executar })).toMatchObject({
      ok: true,
    });
    expect(await operarSaudeNativa(request(), comando, { ...deps, executar })).toMatchObject({
      ok: true,
      dados: { versao: 1, registros },
    });
    const entradas = executar.mock.calls.map((chamada) => chamada[1].p_transporte.entrada);
    expect(entradas[0]?.digest_idempotencia).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(entradas[0]?.digest_idempotencia).toBe(entradas[1]?.digest_idempotencia);
    expect(entradas[0]?.registro_id).not.toBe(entradas[1]?.registro_id);
    expect(entradas[0]?.chave_idempotencia).toBe('chave_ficticia_123456');
  });

  it('recusa envelope decifrado com AAD de outra tabela', async () => {
    const deps = portas();
    const registro_id = 'd0000000-0000-4000-8000-000000000004';
    // Cifrado como se fosse anamnese: o AAD da saúde não pode abrir esse envelope.
    const conteudo = await deps.cifra.cifrar(JSON.stringify(registros), {
      tabela: 'cadastro.anamnese_versao',
      paciente_id,
      registro_id,
      versao: 1,
      campo: 'conteudo',
      formato: 1,
    });
    const resultado = await operarSaudeNativa(
      request(),
      { operacao: 'ler', paciente_id },
      {
        ...deps,
        executar: async (_req, { p_transporte }) => ({
          ok: true,
          repeticao: false,
          request_id: p_transporte.entrada.request_id,
          dados: { registro_id, paciente_id, versao: 1, conteudo },
        }),
      },
    );
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'servico_indisponivel' } });
  });

  it('recusa resposta de outro paciente', async () => {
    const deps = portas();
    const resultado = await operarSaudeNativa(
      request(),
      { operacao: 'ler', paciente_id },
      {
        ...deps,
        executar: async (_req, { p_transporte }) => ({
          ok: true,
          repeticao: false,
          request_id: p_transporte.entrada.request_id,
          dados: {
            registro_id: 'd0000000-0000-4000-8000-000000000004',
            paciente_id: 'c0000000-0000-4000-8000-000000000009',
            versao: 1,
            conteudo: { formato: 1, key_id: 'teste', nonce: 'a', ciphertext: 'a', tag: 'a' },
          },
        }),
      },
    );
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'servico_indisponivel' } });
  });

  it('distingue conflito de versão e de chave sem entregar conteúdo', async () => {
    const deps = portas();
    for (const [codigo, esperado] of [
      ['conflito', 'conflito_versao'],
      ['conflito_idempotencia', 'conflito_idempotencia'],
      ['sem_permissao', 'sem_permissao'],
    ] as const) {
      const resultado = await operarSaudeNativa(
        request(),
        { operacao: 'gravar', paciente_id, versao_esperada: 0, registros },
        {
          ...deps,
          executar: async (_req, { p_transporte }) => ({
            ok: false,
            erro: { codigo },
            request_id: p_transporte.entrada.request_id,
          }),
        },
      );
      expect(resultado).toMatchObject({ ok: false, erro: { codigo: esperado } });
    }
  });

  it('rejeita registro inválido e gravação sem chave antes de executar', async () => {
    const deps = portas();
    const semChave = await operarSaudeNativa(
      new Request('https://exemplo.test/', { headers: { 'x-sessao': session_id } }),
      { operacao: 'gravar', paciente_id, versao_esperada: 0, registros },
      deps,
    );
    expect(semChave).toMatchObject({ ok: false, erro: { codigo: 'entrada_invalida' } });
    const naturezaInvalida = await operarSaudeNativa(
      request(),
      {
        operacao: 'gravar',
        paciente_id,
        versao_esperada: 0,
        registros: [{ ...registros[0], natureza: 'inventada' }],
      },
      deps,
    );
    expect(naturezaInvalida).toMatchObject({ ok: false, erro: { codigo: 'entrada_invalida' } });
    expect(deps.executar).not.toHaveBeenCalled();
  });

  it('nega sessão divergente antes de executar', async () => {
    const deps = portas();
    const resultado = await operarSaudeNativa(
      new Request('https://exemplo.test/'),
      { operacao: 'ler', paciente_id },
      deps,
    );
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'nao_autenticado' } });
    expect(deps.executar).not.toHaveBeenCalled();
  });

  it('não entrega conteúdo quando a sessão é revogada durante a leitura', async () => {
    const deps = portas();
    const resultado = await operarSaudeNativa(
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

  it('marca pendência externa quando a gravação já começou e a sessão cai', async () => {
    const deps = portas();
    const resultado = await operarSaudeNativa(
      request(),
      { operacao: 'gravar', paciente_id, versao_esperada: 0, registros },
      { ...deps, revalidar: async () => ({ estado: 'nao_autenticado' }) },
    );
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'pendencia_externa' } });
  });
});
