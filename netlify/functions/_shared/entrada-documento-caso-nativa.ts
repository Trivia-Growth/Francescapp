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

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
type Dependencias = Parameters<typeof comporDocumentoCasoNativo>[2];

/** Teto do arquivo enviado. Exame e laudo cabem folgado; o limite existe para que um envio
 * absurdo não ocupe memória da função nem espaço do Drive institucional por engano. */
const TAMANHO_MAXIMO_ARQUIVO = 8 * 1024 * 1024;
const NOME_ARQUIVO = /^[^\p{C}/\\]{1,240}$/u;
const TIPO_ARQUIVO = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/;

/** Entrada interna da fatia de documentos; não registra rota nem concede privilégios. */
export function criarEntradaDocumentoCasoNativa(dependencias: Dependencias) {
  return {
    async atender(request: Request): Promise<Response> {
      const erro = (codigo: CodigoErro, id = crypto.randomUUID()) =>
        Response.json(criarErroPublicoSemCampos(codigo, id), {
          status: statusErroHttp[codigo],
          headers,
        });
      const url = new URL(request.url);
      const caminho = /^\/api\/pacientes\/([^/]+)\/documentos$/.exec(url.pathname);
      if (!caminho || (request.method !== 'GET' && request.method !== 'POST'))
        return erro('nao_encontrado');
      const paciente = uuidSchema.safeParse(caminho[1]);
      if (!paciente.success || url.hash || url.search) return erro('entrada_invalida');
      if (!uuidSchema.safeParse(request.headers.get('x-sessao')).success)
        return erro('nao_autenticado');
      let comando: ComandoDocumento = { operacao: 'ler', paciente_id: paciente.data };
      if (request.method === 'POST') {
        if (
          !chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia')).success ||
          !request.body
        )
          return erro('entrada_invalida');
        const tipo = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
        try {
          if (tipo === 'application/json') {
            const bruto: unknown = await request.json();
            const corpo = gravarDocumentoSchema.safeParse(bruto);
            if (!corpo.success) return erro('entrada_invalida');
            comando = { operacao: 'gravar', paciente_id: paciente.data, ...corpo.data };
          } else if (tipo === 'multipart/form-data') {
            const formulario = await request.formData();
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
        const schema =
          request.method === 'GET'
            ? documentoCasoHttp.consultar.saida
            : documentoCasoHttp.gravar.saida;
        const dados = schema.parse(resultado.dados);
        return Response.json({ dados, request_id: resultado.request_id }, { headers });
      } catch {
        return erro(request.method === 'POST' ? 'pendencia_externa' : 'servico_indisponivel');
      }
    },
  };
}
