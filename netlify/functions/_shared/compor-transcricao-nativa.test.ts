import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { bytesParaBase64 } from '../../../packages/contracts/src/transcricao.ts';

/* FR-010, "Autorização antes do envio ao provedor", pela composição REAL: só o cliente
 * Supabase, o cofre, a configuração e o executor são dublês. O teste de
 * `transcricao-nativa.test.ts` dubla a porta `autorizar` e por isso não prova o que a porta
 * real decide — foi assim que a sessão sozinha passou por autorização (auditoria 11/2026).
 * A decisão de perfil/concessão/sessão/paciente é provada em SQL na pré-autorização. */

const usuario = 'a0000000-0000-4000-8000-000000000001';
const sessao = 'b0000000-0000-4000-8000-000000000002';
const paciente = 'c0000000-0000-4000-8000-000000000003';

const dublês = vi.hoisted(() => ({
  ordem: [] as string[],
  preAutorizacao: { data: null as unknown, error: null as unknown },
  executar: vi.fn(),
}));

vi.mock('./auth-nativo/cliente.ts', () => ({
  credencialAuthRejeitada: () => false,
  criarContextoAuthNativo: () => ({
    origem: 'https://app.test',
    cookiesAlterados: false,
    cliente: {
      auth: { getUser: async () => ({ data: { user: { id: usuario } }, error: null }) },
      schema: () => ({
        rpc: async (nome: string, argumentos: Record<string, unknown>) => {
          dublês.ordem.push(nome);
          if (nome === 'consultar_sessao_nativa')
            return {
              data: {
                usuario: { id: usuario, perfil: 'familia', ativo: true, versao: 1 },
                capacidades: [],
                session_id: sessao,
              },
              error: null,
            };
          if (nome === 'autorizar_transcricao_audio') {
            expect(argumentos.p_paciente_id).toBe(paciente);
            return dublês.preAutorizacao;
          }
          throw new Error(`rpc inesperada: ${nome}`);
        },
      }),
    },
  }),
}));
vi.mock('./cofre-nativo.ts', () => ({
  carregarCofreNativo: async () => ({
    cifra: criarCifraAutenticada({
      keyIdAtiva: 't',
      chavesDeCifra: { t: new Uint8Array(32).fill(2) },
      chaveHmac: new Uint8Array(32).fill(4),
    }),
    atestador: criarAtestadorOperacao({ keyId: 't', chave: new Uint8Array(32).fill(3) }),
  }),
}));
vi.mock('./configuracao-servidor.ts', () => ({
  textoConfigurado: async (_pool: unknown, _chave: string, padrao: string) => padrao,
  numeroConfigurado: async (_pool: unknown, _chave: string, padrao: number) => padrao,
}));
vi.mock('./executor-transcricao-nativo.ts', () => ({
  executarTranscricaoNativa: dublês.executar,
}));

const { comporTranscricaoNativa } = await import('./compor-transcricao-nativa.ts');

function registrar() {
  const porta = {
    transcrever: vi.fn(async () => {
      dublês.ordem.push('provedor');
      return 'Fala fictícia de teste.';
    }),
  };
  const pedido = new Request(`https://app.test/api/pacientes/${paciente}/transcricoes`, {
    method: 'POST',
    headers: {
      'x-sessao': sessao,
      origin: 'https://app.test',
      'x-chave-idempotencia': 'chave_ficticia_123456',
    },
  });
  const resultado = comporTranscricaoNativa(
    pedido,
    {
      operacao: 'registrar',
      paciente_id: paciente,
      audio_base64: bytesParaBase64(new Uint8Array(2_000).fill(7)),
      mime: 'audio/webm',
      duracao_segundos: 5,
    },
    { fonte: {} as never, pool: {} as never, referencias: {} as never, keyIdAtestado: 't' },
    porta,
  );
  return { porta, resultado };
}

describe('composição da transcrição: autorização antes do provedor externo', () => {
  beforeEach(() => {
    dublês.ordem.length = 0;
    dublês.executar.mockReset();
    dublês.executar.mockRejectedValue(new Error('fora do escopo deste teste'));
  });

  it('sessão válida sem permissão no banco não manda o áudio ao provedor', async () => {
    dublês.preAutorizacao = {
      data: { ok: false, erro: { codigo: 'sem_permissao' }, request_id: crypto.randomUUID() },
      error: null,
    };
    const { porta, resultado } = registrar();
    expect(await resultado).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
    expect(porta.transcrever).not.toHaveBeenCalled();
    expect(dublês.executar).not.toHaveBeenCalled();
  });

  it('falha ou resposta estranha da pré-autorização também não chega ao provedor', async () => {
    for (const preAutorizacao of [
      { data: null, error: { message: 'indisponível' } },
      { data: { ok: true }, error: null },
    ]) {
      dublês.preAutorizacao = preAutorizacao;
      const { porta, resultado } = registrar();
      expect(await resultado).toMatchObject({
        ok: false,
        erro: { codigo: 'servico_indisponivel' },
      });
      expect(porta.transcrever).not.toHaveBeenCalled();
    }
  });

  it('com a pré-autorização do banco, o provedor é chamado depois dela', async () => {
    dublês.preAutorizacao = { data: { ok: true, request_id: crypto.randomUUID() }, error: null };
    const { porta, resultado } = registrar();
    await resultado;
    expect(porta.transcrever).toHaveBeenCalledTimes(1);
    expect(dublês.ordem.indexOf('autorizar_transcricao_audio')).toBeGreaterThanOrEqual(0);
    expect(dublês.ordem.indexOf('provedor')).toBeGreaterThan(
      dublês.ordem.indexOf('autorizar_transcricao_audio'),
    );
  });
});
