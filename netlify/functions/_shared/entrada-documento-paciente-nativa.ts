import type { z } from 'zod';
import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  criarErroPublicoSemCampos,
  statusErroHttp,
  type CodigoErro,
} from '../../../packages/contracts/src/erros.ts';
import type { DefinicaoDocumentoPaciente } from './documento-paciente-nativo.ts';
import { comporDocumentoPacienteNativo } from './compor-documento-paciente-nativo.ts';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
type Dependencias = Parameters<typeof comporDocumentoPacienteNativo>[3];

/** Entrada interna; não registra rota nem concede privilégios. O contrato de rota
 * fica aqui, e não em `rotas.ts`, porque estas duas rotas nascem desligadas por flag. */
export function criarEntradaDocumentoPacienteNativa<T>(
  definicao: DefinicaoDocumentoPaciente<T>,
  segmento: string,
  corpoSchema: z.ZodType<{ versao_esperada: number; conteudo: unknown }, unknown>,
  saidaSchema: z.ZodType<{ versao: number; conteudo: T } | null, unknown>,
  dependencias: Dependencias,
) {
  const caminhoEsperado = new RegExp(`^/api/pacientes/([^/]+)/${segmento}$`);
  return {
    async atender(request: Request): Promise<Response> {
      const erro = (codigo: CodigoErro, id = crypto.randomUUID()) =>
        Response.json(criarErroPublicoSemCampos(codigo, id), {
          status: statusErroHttp[codigo],
          headers,
        });
      const url = new URL(request.url);
      const caminho = caminhoEsperado.exec(url.pathname);
      if (!caminho || (request.method !== 'GET' && request.method !== 'PATCH'))
        return erro('nao_encontrado');
      const paciente = uuidSchema.safeParse(caminho[1]);
      if (!paciente.success || url.hash || url.search) return erro('entrada_invalida');
      if (!uuidSchema.safeParse(request.headers.get('x-sessao')).success)
        return erro('nao_autenticado');
      let comando: Parameters<typeof comporDocumentoPacienteNativo>[2] = {
        operacao: 'ler',
        paciente_id: paciente.data,
      };
      if (request.method === 'PATCH') {
        if (
          !chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia')).success ||
          request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
            'application/json' ||
          !request.body
        )
          return erro('entrada_invalida');
        // Limite antes da decodificação evita acumular corpo arbitrário em memória.
        const leitor = request.body.getReader();
        const partes: Uint8Array[] = [];
        let tamanho = 0;
        const controle = new AbortController();
        const cancelar = () => controle.abort();
        request.signal.addEventListener('abort', cancelar, { once: true });
        if (request.signal.aborted) cancelar();
        const prazo = setTimeout(cancelar, 15_000);
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
            if (tamanho > 32_768) {
              void leitor.cancel().catch(() => {});
              return erro('entrada_invalida');
            }
            partes.push(parte.value);
          }
          const bytes = new Uint8Array(tamanho);
          let posicao = 0;
          for (const parte of partes) {
            bytes.set(parte, posicao);
            posicao += parte.length;
          }
          const corpo = corpoSchema.safeParse(
            JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
          );
          if (!corpo.success) return erro('entrada_invalida');
          comando = {
            operacao: 'gravar',
            paciente_id: paciente.data,
            versao_esperada: corpo.data.versao_esperada,
            conteudo: corpo.data.conteudo,
          };
        } catch {
          void leitor.cancel().catch(() => {});
          return erro('entrada_invalida');
        } finally {
          clearTimeout(prazo);
          request.signal.removeEventListener('abort', cancelar);
        }
      }
      try {
        const pedido = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          signal: request.signal,
        });
        const resultado = await comporDocumentoPacienteNativo<T>(
          pedido,
          definicao,
          comando,
          dependencias,
        );
        if (!resultado.ok) return erro(resultado.erro.codigo, resultado.request_id);
        // A saída passa pelo contrato antes de sair: o que a rota devolve é só o
        // que o contrato descreve, mesmo que a composição mude depois.
        const dados = saidaSchema.parse(resultado.dados);
        return Response.json({ dados, request_id: resultado.request_id }, { headers });
      } catch {
        return erro(request.method === 'PATCH' ? 'pendencia_externa' : 'servico_indisponivel');
      }
    },
  };
}
