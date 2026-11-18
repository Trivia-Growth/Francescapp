import {
  converterDiarioTarefaSchema,
  reciboConversaoDiarioTarefaSchema,
} from '../../../packages/contracts/src/conversao-diario-tarefa.ts';
import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  codigosErro,
  criarErroPublicoSemCampos,
  statusErroHttp,
  type CodigoErro,
} from '../../../packages/contracts/src/erros.ts';
import { comporConversaoDiarioNativa } from './conversao-diario-compor-nativa.ts';
import type { ComandoConversaoDiario } from './conversao-diario-nativa.ts';

type Dependencias = Parameters<typeof comporConversaoDiarioNativa>[2];
const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

/** Adapter HTTP limitado; não interpreta valores clínicos ou confia em identidade do corpo. */
export function criarEntradaConversaoDiarioNativa(
  dependencias: Dependencias,
  operar = comporConversaoDiarioNativa,
) {
  return {
    async atender(request: Request): Promise<Response> {
      const erro = (codigo: CodigoErro, id = crypto.randomUUID()) =>
        Response.json(criarErroPublicoSemCampos(codigo, id), {
          status: statusErroHttp[codigo],
          headers,
        });
      const url = new URL(request.url);
      const caminho = /^\/api\/pacientes\/([^/]+)\/diario\/([^/]+)\/conversao-tarefa$/.exec(
        url.pathname,
      );
      if (!caminho || !['GET', 'POST'].includes(request.method)) return erro('nao_encontrado');
      const paciente = uuidSchema.safeParse(caminho[1]);
      const origem = uuidSchema.safeParse(caminho[2]);
      if (!paciente.success || !origem.success || url.search || url.hash)
        return erro('entrada_invalida');
      if (!uuidSchema.safeParse(request.headers.get('x-sessao')).success)
        return erro('nao_autenticado');
      try {
        let comando: ComandoConversaoDiario;
        if (request.method === 'GET') {
          if (request.body) return erro('entrada_invalida');
          comando = { operacao: 'consultar', paciente_id: paciente.data, origem_id: origem.data };
        } else {
          if (
            !request.body ||
            request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
              'application/json' ||
            !chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia')).success
          )
            return erro('entrada_invalida');
          const leitor = request.body.getReader();
          const controle = AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]);
          const cancelar = () => {
            void leitor.cancel().catch(() => {});
          };
          controle.addEventListener('abort', cancelar, { once: true });
          const partes: Uint8Array[] = [];
          let tamanho = 0;
          try {
            if (controle.aborted) throw new Error();
            while (true) {
              const parte = await leitor.read();
              if (controle.aborted) throw new Error();
              if (parte.done) break;
              tamanho += parte.value.byteLength;
              if (tamanho > 32_768) throw new Error();
              partes.push(parte.value);
            }
          } catch {
            cancelar();
            return erro('entrada_invalida');
          } finally {
            controle.removeEventListener('abort', cancelar);
            leitor.releaseLock();
          }
          const bytes = new Uint8Array(tamanho);
          let posicao = 0;
          for (const parte of partes) {
            bytes.set(parte, posicao);
            posicao += parte.length;
          }
          let corpo: unknown;
          try {
            corpo = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
          } catch {
            return erro('entrada_invalida');
          }
          const entrada = converterDiarioTarefaSchema.safeParse(corpo);
          if (!entrada.success) return erro('entrada_invalida');
          comando = {
            operacao: 'converter',
            paciente_id: paciente.data,
            origem_id: origem.data,
            entrada: entrada.data,
          };
        }
        const resultado = await operar(request, comando, dependencias);
        if (!resultado.ok) {
          const codigo =
            resultado.erro.codigo === 'conflito'
              ? 'conflito_versao'
              : codigosErro.find((item) => item === resultado.erro.codigo);
          return erro(codigo ?? 'servico_indisponivel', resultado.request_id);
        }
        const dados = (
          request.method === 'GET'
            ? reciboConversaoDiarioTarefaSchema.nullable()
            : reciboConversaoDiarioTarefaSchema
        ).parse(resultado.dados);
        return Response.json({ dados, request_id: resultado.request_id }, { headers });
      } catch {
        return erro('servico_indisponivel');
      }
    },
  };
}
