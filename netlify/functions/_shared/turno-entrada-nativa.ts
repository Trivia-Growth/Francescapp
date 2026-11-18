import {
  aberturaTurnoSchema,
  encerramentoTurnoSchema,
} from '../../../packages/contracts/src/turno.ts';
import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  codigosErro,
  criarErroPublicoSemCampos,
  statusErroHttp,
  type CodigoErro,
} from '../../../packages/contracts/src/erros.ts';
import { comporTurnoNativo } from './turno-compor-nativo.ts';
import type { ComandoTurno } from './turno-nativo.ts';

type Dependencias = Parameters<typeof comporTurnoNativo>[2];
const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

/** Adapter HTTP limitado; não interpreta valores clínicos ou confia em identidade do corpo. */
export function criarEntradaTurnoNativa(dependencias: Dependencias, operar = comporTurnoNativo) {
  return {
    async atender(request: Request): Promise<Response> {
      const erro = (codigo: CodigoErro, id = crypto.randomUUID()) =>
        Response.json(criarErroPublicoSemCampos(codigo, id), {
          status: statusErroHttp[codigo],
          headers,
        });
      const url = new URL(request.url);
      const caminho = /^\/api\/pacientes\/([^/]+)\/turnos\/(abrir|encerrar|[^/]+)$/.exec(
        url.pathname,
      );
      if (!caminho || !['GET', 'POST'].includes(request.method)) return erro('nao_encontrado');
      const paciente = uuidSchema.safeParse(caminho[1]);
      if (!paciente.success || url.search || url.hash) return erro('entrada_invalida');
      if (!uuidSchema.safeParse(request.headers.get('x-sessao')).success)
        return erro('nao_autenticado');
      try {
        let comando: ComandoTurno;
        if (request.method === 'GET') {
          const turno = uuidSchema.safeParse(caminho[2]);
          if (!turno.success || request.body) return erro('entrada_invalida');
          comando = { operacao: 'consultar', paciente_id: paciente.data, turno_id: turno.data };
        } else {
          if (
            !['abrir', 'encerrar'].includes(caminho[2] ?? '') ||
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
              if (tamanho > 16_384) throw new Error();
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
          // Descarta somente os carimbos temporais conhecidos; jamais os encaminha ao banco.
          // Demais campos desconhecidos, especialmente autoria, permanecem rejeitados por strict().
          if (corpo && typeof corpo === 'object' && !Array.isArray(corpo)) {
            const {
              aberto_em: _abertura,
              encerrado_em: _encerramento,
              ...restante
            } = corpo as Record<string, unknown>;
            corpo = restante;
          }
          if (caminho[2] === 'abrir') {
            const entrada = aberturaTurnoSchema.safeParse(corpo);
            if (!entrada.success) return erro('entrada_invalida');
            comando = { ...entrada.data, operacao: 'abrir', paciente_id: paciente.data };
          } else {
            const entrada = encerramentoTurnoSchema.safeParse(corpo);
            if (!entrada.success) return erro('entrada_invalida');
            comando = { ...entrada.data, operacao: 'encerrar', paciente_id: paciente.data };
          }
        }
        const resultado = await operar(request, comando, dependencias);
        if (!resultado.ok) {
          const codigo =
            resultado.erro.codigo === 'conflito'
              ? 'conflito_versao'
              : codigosErro.find((item) => item === resultado.erro.codigo);
          return erro(codigo ?? 'servico_indisponivel', resultado.request_id);
        }
        return Response.json(
          { dados: resultado.dados, request_id: resultado.request_id },
          { headers },
        );
      } catch {
        return erro('servico_indisponivel');
      }
    },
  };
}
