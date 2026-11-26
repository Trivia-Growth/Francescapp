import {
  base64ParaBytes,
  mimeAudioSchema,
  textoTranscricaoSchema,
  type MimeAudio,
} from '../../../packages/contracts/src/transcricao.ts';

/** Adaptador do provedor de transcrição (decisão do solicitante de 11/11/2026: OpenRouter,
 * com o modelo escolhido na plataforma entre opções Whisper/Groq).
 *
 * O ENDEREÇO é fixo no código de propósito. Se ele viesse da configuração, a tela de
 * administração viraria uma alavanca para extrair a credencial — bastaria apontar para outro
 * servidor. O que o solicitante pediu para escolher na plataforma é o MODELO, e esse vem da
 * configuração no banco (`ffcm.transcricao.modelo`), validado contra a lista do catálogo.
 *
 * Nada do que entra ou sai aqui é registrado: o áudio é conteúdo clínico e a chave é
 * credencial. Erros do provedor viram uma falha genérica. */

const ENDERECO = 'https://openrouter.ai/api/v1/audio/transcriptions';
const EXTENSAO: Readonly<Record<MimeAudio, string>> = Object.freeze({
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
});

export class ErroTranscricaoIndisponivel extends Error {
  constructor() {
    super('Não foi possível transcrever o áudio.');
    this.name = 'ErroTranscricaoIndisponivel';
  }
}

export type PortaTranscricao = {
  transcrever(entrada: {
    audioBase64: string;
    mime: MimeAudio;
    modelo: string;
    signal?: AbortSignal;
  }): Promise<string>;
};

/** `buscar` é injetável só para teste: nenhum caminho de produção passa outro `fetch`. */
export function criarPortaTranscricaoOpenRouter(
  obterChave: () => Promise<string>,
  buscar: typeof fetch = fetch,
): PortaTranscricao {
  return {
    async transcrever({ audioBase64, mime, modelo, signal }) {
      const formato = mimeAudioSchema.safeParse(mime);
      if (
        !formato.success ||
        typeof modelo !== 'string' ||
        !modelo.trim() ||
        modelo.length > 160 ||
        // Identificador de modelo tem forma conhecida; recusar aqui evita montar um corpo
        // com texto arbitrário vindo da configuração.
        !/^[a-z0-9][a-z0-9._/-]{0,159}$/.test(modelo)
      )
        throw new ErroTranscricaoIndisponivel();
      let bytes: Uint8Array;
      try {
        bytes = base64ParaBytes(audioBase64);
      } catch {
        throw new ErroTranscricaoIndisponivel();
      }
      const chave = await obterChave();
      const corpo = new FormData();
      corpo.set(
        'file',
        new Blob([bytes as BlobPart], { type: formato.data }),
        `relato.${EXTENSAO[formato.data]}`,
      );
      corpo.set('model', modelo);
      // O produto é em português do Brasil; declarar o idioma reduz transcrição "traduzida".
      corpo.set('language', 'pt');
      corpo.set('response_format', 'json');
      let resposta: Response;
      try {
        resposta = await buscar(ENDERECO, {
          method: 'POST',
          headers: { Authorization: `Bearer ${chave}`, Accept: 'application/json' },
          body: corpo,
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          signal: signal ?? AbortSignal.timeout(60_000),
        });
      } catch {
        throw new ErroTranscricaoIndisponivel();
      }
      if (!resposta.ok) throw new ErroTranscricaoIndisponivel();
      let dados: unknown;
      try {
        dados = await resposta.json();
      } catch {
        throw new ErroTranscricaoIndisponivel();
      }
      const texto =
        typeof dados === 'object' && dados !== null
          ? (dados as Record<string, unknown>).text
          : undefined;
      const validado = textoTranscricaoSchema.safeParse(texto);
      // Transcrição vazia não é erro do provedor, mas também não é rascunho: devolver "" faria
      // a tela apresentar um texto que ninguém falou como se fosse o relato.
      if (!validado.success) throw new ErroTranscricaoIndisponivel();
      return validado.data;
    },
  };
}
