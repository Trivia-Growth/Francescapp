import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  criarErroPublicoSemCampos,
  statusErroHttp,
  type CodigoErro,
} from '../../../packages/contracts/src/erros.ts';
import { AUDIO_BYTES_MAXIMO } from '../../../packages/contracts/src/transcricao.ts';
import { transcricaoHttp } from '../../../packages/contracts/src/transcricao-http.ts';
import { comporTranscricaoNativa } from './compor-transcricao-nativa.ts';
import type { ComandoTranscricao } from './transcricao-nativa.ts';
import { registrarFalhaDeResposta } from './falha-operacional.ts';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
type Dependencias = Parameters<typeof comporTranscricaoNativa>[2];

/** Teto do corpo. O áudio chega em base64 dentro de JSON, então o limite é o do áudio mais a
 * expansão de base64 e uma folga pequena para os campos restantes. Acima disso recusamos
 * antes de decodificar: corpo arbitrário não acumula em memória. */
const CORPO_MAXIMO = Math.ceil(AUDIO_BYTES_MAXIMO / 3) * 4 + 4_096;

async function lerCorpo(request: Request, teto: number): Promise<unknown> {
  if (
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
      'application/json' ||
    !request.body
  )
    throw new Error();
  const leitor = request.body.getReader();
  const partes: Uint8Array[] = [];
  let tamanho = 0;
  const controle = new AbortController();
  const cancelar = () => controle.abort();
  request.signal.addEventListener('abort', cancelar, { once: true });
  if (request.signal.aborted) cancelar();
  const prazo = setTimeout(cancelar, 30_000);
  try {
    while (true) {
      let abortar!: () => void;
      const interrupcao = new Promise<never>((_, rejeitar) => {
        abortar = () => rejeitar(new Error());
        if (controle.signal.aborted) abortar();
        else controle.signal.addEventListener('abort', abortar, { once: true });
      });
      let parte: ReadableStreamReadResult<Uint8Array>;
      try {
        parte = await Promise.race([leitor.read(), interrupcao]);
      } finally {
        controle.signal.removeEventListener('abort', abortar);
      }
      if (parte.done) break;
      tamanho += parte.value.byteLength;
      if (tamanho > teto) {
        void leitor.cancel().catch(() => {});
        throw new Error();
      }
      partes.push(parte.value);
    }
    const bytes = new Uint8Array(tamanho);
    let posicao = 0;
    for (const parte of partes) {
      bytes.set(parte, posicao);
      posicao += parte.length;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (erro) {
    void leitor.cancel().catch(() => {});
    throw erro;
  } finally {
    clearTimeout(prazo);
    request.signal.removeEventListener('abort', cancelar);
  }
}

/** Entrada interna da fatia de transcrição; não registra rota nem concede privilégios. */
export function criarEntradaTranscricaoNativa(dependencias: Dependencias) {
  return {
    async atender(request: Request): Promise<Response> {
      const erro = (codigo: CodigoErro, id = crypto.randomUUID()) =>
        Response.json(criarErroPublicoSemCampos(codigo, id), {
          status: statusErroHttp[codigo],
          headers,
        });
      const url = new URL(request.url);
      const colecao = /^\/api\/pacientes\/([^/]+)\/transcricoes$/.exec(url.pathname);
      const item = /^\/api\/pacientes\/([^/]+)\/transcricoes\/([^/]+)$/.exec(url.pathname);
      if (!colecao && !item) return erro('nao_encontrado');
      if (url.hash || url.search) return erro('entrada_invalida');
      const paciente = uuidSchema.safeParse((colecao ?? item)?.[1]);
      if (!paciente.success) return erro('entrada_invalida');
      if (!uuidSchema.safeParse(request.headers.get('x-sessao')).success)
        return erro('nao_autenticado');

      let comando: ComandoTranscricao;
      let nome: keyof typeof transcricaoHttp;
      if (colecao) {
        if (request.method !== 'POST') return erro('nao_encontrado');
        nome = 'registrar';
        if (!chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia')).success)
          return erro('entrada_invalida');
        let corpo: unknown;
        try {
          corpo = await lerCorpo(request, CORPO_MAXIMO);
        } catch {
          return erro('entrada_invalida');
        }
        const dados = transcricaoHttp.registrar.entrada.safeParse(corpo);
        if (!dados.success) return erro('entrada_invalida');
        comando = { operacao: 'registrar', paciente_id: paciente.data, ...dados.data };
      } else {
        const audio = uuidSchema.safeParse(item?.[2]);
        if (!audio.success) return erro('entrada_invalida');
        if (request.method === 'GET') {
          nome = 'ouvir';
          comando = { operacao: 'ouvir', paciente_id: paciente.data, audio_id: audio.data };
        } else if (request.method === 'PATCH') {
          nome = 'confirmarRevisao';
          if (
            !chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia')).success
          )
            return erro('entrada_invalida');
          let corpo: unknown;
          try {
            corpo = await lerCorpo(request, 32_768);
          } catch {
            return erro('entrada_invalida');
          }
          const dados = transcricaoHttp.confirmarRevisao.entrada.safeParse(corpo);
          if (!dados.success) return erro('entrada_invalida');
          comando = {
            operacao: 'confirmarRevisao',
            paciente_id: paciente.data,
            audio_id: audio.data,
            ...dados.data,
          };
        } else if (request.method === 'DELETE') {
          nome = 'excluirAudio';
          comando = { operacao: 'excluirAudio', paciente_id: paciente.data, audio_id: audio.data };
        } else {
          return erro('nao_encontrado');
        }
      }

      try {
        const pedido = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          signal: request.signal,
        });
        const resultado = await comporTranscricaoNativa(pedido, comando, dependencias);
        if (!resultado.ok) return erro(resultado.erro.codigo, resultado.request_id);
        const dados = transcricaoHttp[nome].saida.parse(resultado.dados);
        return Response.json({ dados, request_id: resultado.request_id }, { headers });
      } catch (erroResposta) {
        return erro(
          request.method === 'GET' ? 'servico_indisponivel' : 'pendencia_externa',
          registrarFalhaDeResposta('transcricao', erroResposta),
        );
      }
    },
  };
}
