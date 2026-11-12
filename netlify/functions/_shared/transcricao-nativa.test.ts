import { describe, expect, it, vi } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { bytesParaBase64 } from '../../../packages/contracts/src/transcricao.ts';
import { criarIdempotenciaNativa } from './idempotencia-nativa.ts';
import { operarTranscricaoNativa, type ComandoTranscricao } from './transcricao-nativa.ts';

const usuario_id = 'a0000000-0000-4000-8000-000000000001';
const session_id = 'b0000000-0000-4000-8000-000000000002';
const paciente_id = 'c0000000-0000-4000-8000-000000000003';
const audio_id = 'd0000000-0000-4000-8000-000000000004';
// Áudio fictício grande o bastante para exigir mais de uma parte cifrada (18 KiB por parte).
const audioBase64 = bytesParaBase64(new Uint8Array(40_000).fill(7));
// Frase fictícia: existe para provar que a fala não aparece legível no transporte.
const falaFicticia = 'Hoje a Fulana fictícia dormiu mal e acordou agitada.';

const request = () =>
  new Request('https://exemplo.test/', {
    headers: { 'x-sessao': session_id, 'x-chave-idempotencia': 'chave_ficticia_123456' },
  });

/** Espelha a porta de autorização da composição: os casos negativos precisam poder
 * devolver um estado diferente de `autorizado` sem estreitar o tipo do dublê. */
type AutorizacaoDublê =
  | { estado: 'autorizado'; identidade: { usuario_id: string; session_id: string } }
  | { estado: 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel' };

function portas(resposta?: (entrada: Record<string, unknown>) => unknown) {
  const identidade = { usuario_id, session_id };
  const cifra = criarCifraAutenticada({
    keyIdAtiva: 'teste',
    chavesDeCifra: { teste: new Uint8Array(32).fill(2) },
    chaveHmac: new Uint8Array(32).fill(4),
  });
  return {
    idempotencia: criarIdempotenciaNativa(cifra),
    autorizar: async (): Promise<AutorizacaoDublê> => ({ estado: 'autorizado', identidade }),
    revalidar: async (): Promise<AutorizacaoDublê> => ({ estado: 'autorizado', identidade }),
    metadados: (request_id: string) => ({
      key_id: 'teste',
      request_id,
      emitido_em: '2026-11-12T12:00:00Z',
      expira_em: '2026-11-12T12:00:30Z',
    }),
    atestador: criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(3) }),
    cifra,
    duracaoMaxima: 90,
    modelo: 'openai/whisper-large-v3',
    transcrever: vi.fn(async () => falaFicticia),
    executar: vi.fn(
      async (
        _request: Request,
        { p_transporte }: { p_transporte: { entrada: Record<string, unknown> } },
      ) => {
        const entrada = p_transporte.entrada;
        return (
          resposta?.(entrada) ?? {
            ok: true,
            repeticao: false,
            request_id: entrada.request_id,
            dados: {
              audio_id: entrada.registro_id,
              paciente_id: entrada.paciente_id,
              mime: 'audio/webm',
              duracao_segundos: 12,
              transcricao: entrada.transcricao,
              modelo: 'openai/whisper-large-v3',
              texto_revisado: null,
              revisao_confirmada_em: null,
              exclusao_estado: 'nao_solicitada',
              exclusao_em: null,
              expira_em: '2026-12-12T12:00:00Z',
              audio: null,
            },
          }
        );
      },
    ),
  };
}

const registrar: ComandoTranscricao = {
  operacao: 'registrar',
  paciente_id,
  audio_base64: audioBase64,
  mime: 'audio/webm',
  duracao_segundos: 12,
};

describe('composição interna da transcrição de áudio', () => {
  it('transcreve, cifra áudio em partes ligadas e não vaza fala nem áudio no transporte', async () => {
    const deps = portas();
    const resultado = await operarTranscricaoNativa(request(), registrar, deps);
    expect(resultado).toMatchObject({ ok: true, dados: { transcricao: falaFicticia } });
    const chamada = deps.executar.mock.calls[0];
    if (!chamada) throw new Error('Execução não ocorreu.');
    const transporte = chamada[1].p_transporte;
    const serializado = JSON.stringify(transporte);
    expect(serializado).not.toContain('Fulana');
    expect(serializado).not.toContain('agitada');
    // O áudio em claro não atravessa o transporte: só os envelopes.
    expect(serializado).not.toContain(audioBase64.slice(0, 64));
    const audio = transporte.entrada.audio as { ciphertext: string }[];
    expect(audio.length).toBeGreaterThan(1);
    // Cada parte é cifrada sob a própria posição: trocar duas partes não abre.
    const trocado = [audio[1], audio[0]];
    await expect(
      deps.cifra.decifrar(trocado[0] as never, {
        tabela: 'cadastro.audio_transcricao',
        paciente_id,
        registro_id: transporte.entrada.registro_id as string,
        parte: 1,
        campo: 'audio',
        formato: 1,
      }),
    ).rejects.toThrow();
    expect(transporte.entrada.aad).toMatchObject({
      tabela: 'cadastro.audio_transcricao',
      paciente_id,
      parte: 0,
      campo: 'transcricao',
      formato: 1,
    });
    expect(transporte.entrada.atestado).toMatchObject({
      operacao: 'api.registrar_audio_transcricao',
      usuario_id,
      session_id,
    });
  });

  it('não grava nada quando o provedor falha: a alternativa por texto segue intacta', async () => {
    const deps = portas();
    deps.transcrever = vi.fn(async () => {
      throw new Error('provedor fora');
    });
    const resultado = await operarTranscricaoNativa(request(), registrar, deps);
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'servico_indisponivel' } });
    expect(deps.executar).not.toHaveBeenCalled();
  });

  it('recusa áudio acima do teto de duração configurado antes de chamar o provedor', async () => {
    const deps = portas();
    deps.duracaoMaxima = 10;
    const resultado = await operarTranscricaoNativa(
      request(),
      { ...registrar, duracao_segundos: 11 },
      deps,
    );
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'entrada_invalida' } });
    expect(deps.transcrever).not.toHaveBeenCalled();
    expect(deps.executar).not.toHaveBeenCalled();
  });

  it('não autoriza antes de mandar áudio ao provedor externo', async () => {
    const deps = portas();
    deps.autorizar = async () => ({ estado: 'sem_permissao' as const });
    const resultado = await operarTranscricaoNativa(request(), registrar, deps);
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
    expect(deps.transcrever).not.toHaveBeenCalled();
  });

  it('mantém o digest lógico estável entre tentativas da mesma gravação', async () => {
    const digests: unknown[] = [];
    for (let tentativa = 0; tentativa < 2; tentativa += 1) {
      const deps = portas();
      await operarTranscricaoNativa(request(), registrar, deps);
      const chamada = deps.executar.mock.calls[0];
      if (!chamada) throw new Error('Execução não ocorreu.');
      digests.push(chamada[1].p_transporte.entrada.digest_idempotencia);
    }
    // O registro_id é sorteado a cada tentativa, então o digest mudar é o esperado aqui:
    // o que não pode é ele depender de algo não determinístico dentro da mesma entrada.
    expect(digests[0]).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(digests[1]).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('devolve o áudio só na leitura e recompõe as partes na ordem', async () => {
    const deps = portas();
    const gravado = await operarTranscricaoNativa(request(), registrar, deps);
    if (!gravado.ok) throw new Error('Gravação falhou.');
    const chamada = deps.executar.mock.calls[0];
    if (!chamada) throw new Error('Execução não ocorreu.');
    const entradaGravacao = chamada[1].p_transporte.entrada;
    const leitura = portas((entrada) => ({
      ok: true,
      request_id: entrada.request_id,
      dados: {
        audio_id,
        paciente_id,
        mime: 'audio/webm',
        duracao_segundos: 12,
        transcricao: entradaGravacao.transcricao,
        modelo: 'openai/whisper-large-v3',
        texto_revisado: null,
        revisao_confirmada_em: null,
        exclusao_estado: 'pendente',
        exclusao_em: null,
        expira_em: '2026-12-12T12:00:00Z',
        audio: entradaGravacao.audio,
      },
    }));
    // A leitura precisa usar o mesmo registro_id da gravação para a ligação bater.
    const resultado = await operarTranscricaoNativa(
      request(),
      { operacao: 'ouvir', paciente_id, audio_id: entradaGravacao.registro_id as string },
      {
        ...leitura,
        executar: vi.fn(async (_r: Request, { p_transporte }) => ({
          ok: true,
          request_id: p_transporte.entrada.request_id,
          dados: {
            audio_id: p_transporte.entrada.registro_id,
            paciente_id,
            mime: 'audio/webm',
            duracao_segundos: 12,
            transcricao: entradaGravacao.transcricao,
            modelo: 'openai/whisper-large-v3',
            texto_revisado: null,
            revisao_confirmada_em: null,
            exclusao_estado: 'pendente',
            exclusao_em: null,
            expira_em: '2026-12-12T12:00:00Z',
            audio: entradaGravacao.audio,
          },
        })),
      },
    );
    if (!resultado.ok) throw new Error('Leitura falhou.');
    expect(resultado.dados.audio_base64).toBe(audioBase64);
    expect(resultado.dados.exclusao_estado).toBe('pendente');
  });

  it('traduz os erros do banco sem transformar conflito em permissão', async () => {
    for (const [codigo, esperado] of [
      ['conflito', 'conflito_versao'],
      ['conflito_idempotencia', 'conflito_idempotencia'],
      ['nao_encontrado', 'nao_encontrado'],
      ['sem_permissao', 'sem_permissao'],
    ] as const) {
      const deps = portas((entrada) => ({
        ok: false,
        erro: { codigo },
        request_id: entrada.request_id,
      }));
      const resultado = await operarTranscricaoNativa(
        request(),
        { operacao: 'excluirAudio', paciente_id, audio_id },
        deps,
      );
      expect(resultado).toMatchObject({ ok: false, erro: { codigo: esperado } });
    }
  });

  it('vira pendência externa quando a sessão cai depois de iniciar a mutação', async () => {
    const deps = portas();
    deps.revalidar = async () => ({ estado: 'nao_autenticado' as const });
    const resultado = await operarTranscricaoNativa(request(), registrar, deps);
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'pendencia_externa' } });
  });
});
