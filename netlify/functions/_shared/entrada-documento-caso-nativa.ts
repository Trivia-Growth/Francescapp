import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  criarErroPublicoSemCampos,
  statusErroHttp,
  type CodigoErro,
} from '../../../packages/contracts/src/erros.ts';
import {
  documentoCasoHttp,
  gravarDocumentoSchema,
} from '../../../packages/contracts/src/documento-caso-http.ts';
import { comporDocumentoCasoNativo } from './compor-documento-caso-nativo.ts';
import type { ComandoDocumento } from './documento-caso-nativo.ts';
import { registrarFalhaDeResposta } from './falha-operacional.ts';
import {
  TAMANHO_MAXIMO_DOCUMENTO,
  TAMANHO_MAXIMO_CORPO_DOCUMENTO,
} from '../../../packages/contracts/src/documento-caso.ts';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
type Dependencias = Parameters<typeof comporDocumentoCasoNativo>[2];

/** Arquivo limitado e margem multipart separada antes de parsear ou chamar o provider. */
const TAMANHO_MAXIMO_ARQUIVO = TAMANHO_MAXIMO_DOCUMENTO;
const NOME_ARQUIVO = /^[^\p{C}/\\]{1,240}$/u;
const TIPO_ARQUIVO = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/;

/** Entrada interna da fatia de documentos; não registra rota nem concede privilégios. */
export function criarEntradaDocumentoCasoNativa(dependencias: Dependencias) {
  return {
    async atender(request: Request): Promise<Response> {
      const erro = (codigo: CodigoErro, id: string = crypto.randomUUID()) =>
        Response.json(criarErroPublicoSemCampos(codigo, id), {
          status: statusErroHttp[codigo],
          headers,
        });
      const url = new URL(request.url);
      const caminho = /^\/api\/pacientes\/([^/]+)\/documentos(?:\/([^/]+)\/arquivo)?$/.exec(
        url.pathname,
      );
      if (
        !caminho ||
        (request.method !== 'GET' && request.method !== 'POST') ||
        (caminho[2] && request.method !== 'GET')
      )
        return erro('nao_encontrado');
      const paciente = uuidSchema.safeParse(caminho[1]);
      if (!paciente.success || url.hash || url.search) return erro('entrada_invalida');
      if (!uuidSchema.safeParse(request.headers.get('x-sessao')).success)
        return erro('nao_autenticado');
      let comando: ComandoDocumento = { operacao: 'ler', paciente_id: paciente.data };
      if (caminho[2]) {
        const documento = uuidSchema.safeParse(caminho[2]);
        if (!documento.success) return erro('entrada_invalida');
        comando = {
          operacao: 'entregar',
          paciente_id: paciente.data,
          documento_id: documento.data,
        };
      }
      if (request.method === 'POST') {
        if (
          !chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia')).success ||
          !request.body
        )
          return erro('entrada_invalida');
        const tipo = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
        try {
          const bytesCorpo = await lerCorpoLimitado(request);
          const corpoLimitado = new Response(bytesCorpo, {
            headers: { 'content-type': request.headers.get('content-type') ?? '' },
          });
          if (tipo === 'application/json') {
            const bruto: unknown = await corpoLimitado.json();
            const corpo = gravarDocumentoSchema.safeParse(bruto);
            if (!corpo.success) return erro('entrada_invalida');
            comando = { operacao: 'gravar', paciente_id: paciente.data, ...corpo.data };
          } else if (tipo === 'multipart/form-data') {
            const formulario = await corpoLimitado.formData();
            const arquivo = formulario.get('arquivo');
            const metadadoBruto = formulario.get('metadado');
            const conteudoBruto = formulario.get('conteudo');
            const documentoId = formulario.get('documento_id');
            const versaoEsperada = formulario.get('versao_esperada');
            if (
              !(arquivo instanceof File) ||
              typeof metadadoBruto !== 'string' ||
              typeof conteudoBruto !== 'string' ||
              typeof documentoId !== 'string' ||
              typeof versaoEsperada !== 'string'
            )
              return erro('entrada_invalida');
            if (arquivo.size === 0 || arquivo.size > TAMANHO_MAXIMO_ARQUIVO)
              return erro('entrada_invalida');
            const nome = arquivo.name.trim();
            const tipoArquivo = (arquivo.type || 'application/octet-stream').toLowerCase();
            if (!NOME_ARQUIVO.test(nome) || !TIPO_ARQUIVO.test(tipoArquivo))
              return erro('entrada_invalida');
            const corpo = gravarDocumentoSchema.safeParse({
              documento_id: documentoId,
              versao_esperada: Number(versaoEsperada),
              metadado: JSON.parse(metadadoBruto),
              conteudo: JSON.parse(conteudoBruto),
            });
            if (!corpo.success) return erro('entrada_invalida');
            const bytes = new Uint8Array(await arquivo.arrayBuffer());
            if (bytes.byteLength !== arquivo.size) return erro('entrada_invalida');
            comando = {
              operacao: 'gravar',
              paciente_id: paciente.data,
              ...corpo.data,
              arquivo: { nome, tipo: tipoArquivo, bytes },
            };
          } else {
            return erro('entrada_invalida');
          }
        } catch {
          return erro('entrada_invalida');
        }
      }
      try {
        const pedido = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          signal: request.signal,
        });
        const resultado = await comporDocumentoCasoNativo(pedido, comando, dependencias);
        if (!resultado.ok) return erro(resultado.erro.codigo, resultado.request_id);
        if (comando.operacao === 'entregar') {
          if (!('arquivo' in resultado.dados)) throw new Error();
          const arquivo = resultado.dados.arquivo;
          const nome =
            arquivo.nome
              .replace(/[\p{C}/\\"<>:|?*]/gu, '_')
              .trim()
              .slice(0, 180) || 'documento';
          const codificado = encodeURIComponent(nome).replace(
            /['()*]/g,
            (caractere) => `%${caractere.charCodeAt(0).toString(16).toUpperCase()}`,
          );
          return new Response(arquivo.bytes, {
            headers: {
              ...headers,
              'Content-Type': 'application/octet-stream',
              'Content-Disposition': `attachment; filename="documento"; filename*=UTF-8''${codificado}`,
              'Content-Length': String(arquivo.bytes.byteLength),
            },
          });
        }
        if (!('documentos' in resultado.dados)) throw new Error();
        const schema =
          request.method === 'GET'
            ? documentoCasoHttp.consultar.saida
            : documentoCasoHttp.gravar.saida;
        const dados = schema.parse(resultado.dados);
        return Response.json({ dados, request_id: resultado.request_id }, { headers });
      } catch (erroResposta) {
        return erro(
          request.method === 'POST' ? 'pendencia_externa' : 'servico_indisponivel',
          registrarFalhaDeResposta('documento-caso', erroResposta),
        );
      }
    },
  };
}

async function lerCorpoLimitado(request: Request): Promise<Uint8Array<ArrayBuffer>> {
  const declarado = request.headers.get('content-length');
  if (
    declarado !== null &&
    (!/^\d+$/.test(declarado) || Number(declarado) > TAMANHO_MAXIMO_CORPO_DOCUMENTO)
  ) {
    void request.body?.cancel().catch(() => undefined);
    throw new Error('Corpo inválido.');
  }
  const leitor = request.body?.getReader();
  if (!leitor) throw new Error('Corpo ausente.');
  const partes: Uint8Array[] = [];
  let total = 0;
  const sinal = AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]);
  const cancelar = () => {
    void leitor.cancel().catch(() => undefined);
  };
  sinal.addEventListener('abort', cancelar, { once: true });
  try {
    while (true) {
      if (sinal.aborted) throw new Error('Pedido cancelado.');
      const parte = await leitor.read();
      if (sinal.aborted) throw new Error('Pedido cancelado.');
      if (parte.done) break;
      total += parte.value.byteLength;
      if (total > TAMANHO_MAXIMO_CORPO_DOCUMENTO || request.signal.aborted)
        throw new Error('Corpo inválido.');
      partes.push(parte.value);
    }
  } catch (erro) {
    void leitor.cancel().catch(() => undefined);
    throw erro;
  } finally {
    sinal.removeEventListener('abort', cancelar);
    leitor.releaseLock();
  }
  const bytes = new Uint8Array(new ArrayBuffer(total));
  let posicao = 0;
  for (const parte of partes) {
    bytes.set(parte, posicao);
    posicao += parte.byteLength;
  }
  return bytes;
}
