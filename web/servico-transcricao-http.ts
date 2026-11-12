import {
  sucessoRespostaSchema,
  erroRespostaSchema,
  uuidSchema,
} from '../packages/contracts/src/comum.ts';
import { statusErroHttp } from '../packages/contracts/src/erros.ts';
import { transcricaoHttp } from '../packages/contracts/src/transcricao-http.ts';
import type { Transcricao } from '../packages/contracts/src/transcricao.ts';
import { FalhaApi } from './api.ts';
import type { ServicoTranscricao } from './transcricao-audio.ts';

type Identidade = { usuario_id: string; session_id: string };
type Nome = keyof typeof transcricaoHttp;

/** Serviço isolado da fatia de transcrição (FR-010). Autorização é do servidor; aqui só
 * verificamos que a identidade não trocou entre o começo e o fim da chamada. */
export function criarServicoTranscricaoHttp(
  identidadeAtual: () => Identidade | null,
): ServicoTranscricao {
  const identidade = identidadeAtual();
  if (!identidade) throw new FalhaApi('nao_autenticado', 401);
  const enviar = async (nome: Nome, entrada: unknown, paciente: string, audio?: string) => {
    const rota = transcricaoHttp[nome];
    const corpo = rota.entrada.parse(entrada);
    const atual = identidadeAtual();
    if (
      !atual ||
      atual.usuario_id !== identidade.usuario_id ||
      atual.session_id !== identidade.session_id
    )
      throw new FalhaApi('nao_autenticado', 401);
    let caminho = rota.caminho.replace(
      ':paciente_id',
      encodeURIComponent(uuidSchema.parse(paciente)),
    );
    if (caminho.includes(':audio_id'))
      caminho = caminho.replace(':audio_id', encodeURIComponent(uuidSchema.parse(audio)));
    const headers = new Headers({ Accept: 'application/json', 'x-sessao': atual.session_id });
    let modo: string | null;
    let fluxo: string | null;
    try {
      modo = sessionStorage.getItem('modo-acesso');
      fluxo = sessionStorage.getItem(modo === 'tecnica' ? 'fluxo-tecnico' : 'fluxo-google');
    } catch {
      throw new FalhaApi('nao_autenticado', 401);
    }
    if ((modo !== 'google' && modo !== 'tecnica') || !fluxo || !/^[A-Za-z0-9_-]{22}$/.test(fluxo))
      throw new FalhaApi('nao_autenticado', 401);
    headers.set('x-fluxo', fluxo);
    const mutacao = rota.metodo !== 'GET';
    if (nome === 'registrar' || nome === 'confirmarRevisao')
      headers.set('x-chave-idempotencia', crypto.randomUUID());
    const temCorpo = nome === 'registrar' || nome === 'confirmarRevisao';
    if (temCorpo) headers.set('Content-Type', 'application/json');
    let resposta: Response;
    try {
      resposta = await fetch(caminho, {
        method: rota.metodo,
        headers,
        ...(temCorpo ? { body: JSON.stringify(corpo) } : {}),
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        // A transcrição espera um provedor externo; o teto aqui é maior que o das demais
        // fatias, mas continua menor que o do servidor para a falha aparecer de um lado só.
        signal: AbortSignal.timeout(nome === 'registrar' ? 90_000 : 20_000),
      });
      if (mutacao && resposta.status === 202) throw new Error();
      if (!resposta.headers.get('content-type')?.includes('application/json')) throw new Error();
      if (!resposta.body) throw new Error();
      const leitor = resposta.body.getReader();
      const partes: Uint8Array[] = [];
      let tamanho = 0;
      try {
        while (true) {
          const parte = await leitor.read();
          if (parte.done) break;
          tamanho += parte.value.byteLength;
          // O áudio devolvido em `ouvir` é o maior corpo que esta fatia transporta.
          if (tamanho > 1_048_576) throw new Error();
          partes.push(parte.value);
        }
      } catch (erro) {
        void leitor.cancel().catch(() => {});
        throw erro;
      } finally {
        leitor.releaseLock();
      }
      const bytes = new Uint8Array(tamanho);
      let posicao = 0;
      for (const parte of partes) {
        bytes.set(parte, posicao);
        posicao += parte.length;
      }
      const envelope: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      const depois = identidadeAtual();
      if (
        !depois ||
        depois.usuario_id !== identidade.usuario_id ||
        depois.session_id !== identidade.session_id
      )
        throw new FalhaApi('nao_autenticado', mutacao ? 0 : 401, true);
      if (!resposta.ok) {
        const erro = erroRespostaSchema.safeParse(envelope);
        if (!erro.success || (mutacao && statusErroHttp[erro.data.erro.codigo] !== resposta.status))
          throw new Error();
        throw new FalhaApi(erro.data.erro.codigo, resposta.status);
      }
      return sucessoRespostaSchema(rota.saida).parse(envelope).dados;
    } catch (erro) {
      if (erro instanceof FalhaApi) throw erro;
      throw new FalhaApi('servico_indisponivel');
    }
  };
  return {
    registrar: async (paciente, entrada) =>
      (await enviar('registrar', entrada, paciente)) as Transcricao,
    ouvir: async (paciente, audio) => (await enviar('ouvir', {}, paciente, audio)) as Transcricao,
    confirmarRevisao: async (paciente, audio, textoRevisado) =>
      (await enviar(
        'confirmarRevisao',
        { texto_revisado: textoRevisado },
        paciente,
        audio,
      )) as Transcricao,
    excluirAudio: async (paciente, audio) =>
      (await enviar('excluirAudio', {}, paciente, audio)) as Transcricao,
  };
}
