import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  atualizacaoTarefaCuidadoSchema,
  criacaoTarefaCuidadoSchema,
} from '../../../packages/contracts/src/tarefa-cuidado.ts';
import {
  codigosErro,
  criarErroPublicoSemCampos,
  statusErroHttp,
  type CodigoErro,
} from '../../../packages/contracts/src/erros.ts';
import { comporTarefaCuidadoNativo } from './compor-tarefa-cuidado-nativo.ts';
import { registrarFalhaDeResposta } from './falha-operacional.ts';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
type Dependencias = Parameters<typeof comporTarefaCuidadoNativo>[2];

/** Leitura isolada; escrita depende de contrato de idempotência e revisão. */
export function criarEntradaTarefaCuidadoNativa(dependencias: Dependencias) {
  return {
    // Preparação isolada: atender() não encaminha POST até revisão e ativação explícita.
    async atenderCriacao(request: Request): Promise<Response> {
      const erro = (codigo: CodigoErro, id = crypto.randomUUID()) =>
        Response.json(criarErroPublicoSemCampos(codigo, id), {
          status: statusErroHttp[codigo],
          headers,
        });
      const url = new URL(request.url);
      const caminho = /^\/api\/pacientes\/([^/]+)\/tarefas$/.exec(url.pathname);
      if (!caminho || request.method !== 'POST') return erro('nao_encontrado');
      const paciente = uuidSchema.safeParse(caminho[1]);
      if (
        !paciente.success ||
        url.search ||
        url.hash ||
        !chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia')).success ||
        request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
          'application/json' ||
        !request.body
      )
        return erro('entrada_invalida');
      if (!uuidSchema.safeParse(request.headers.get('x-sessao')).success)
        return erro('nao_autenticado');
      try {
        const leitor = request.body.getReader();
        const partes: Uint8Array[] = [];
        let tamanho = 0;
        const controle = AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]);
        const interrupcao = new Promise<never>((_, rejeitar) => {
          if (controle.aborted) rejeitar(new Error());
          else controle.addEventListener('abort', () => rejeitar(new Error()), { once: true });
        });
        try {
          while (true) {
            const parte = await Promise.race([leitor.read(), interrupcao]);
            if (parte.done) break;
            tamanho += parte.value.byteLength;
            if (tamanho > 32_768) throw new Error();
            partes.push(parte.value);
          }
        } catch {
          void leitor.cancel().catch(() => {});
          return erro('entrada_invalida');
        } finally {
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
        const criacao = criacaoTarefaCuidadoSchema.safeParse(corpo);
        const atualizacao = atualizacaoTarefaCuidadoSchema.safeParse(corpo);
        if (!criacao.success && !atualizacao.success) return erro('entrada_invalida');
        const dados = atualizacao.success
          ? atualizacao.data
          : criacao.success
            ? criacao.data
            : null;
        if (!dados) return erro('entrada_invalida');
        const resultado = await comporTarefaCuidadoNativo(
          request,
          {
            operacao: 'gravar',
            paciente_id: paciente.data,
            tarefa_id: dados.tarefa_id,
            reserva_id: dados.reserva_id,
            geracao_reserva: dados.geracao_reserva,
            versao_esperada: atualizacao.success ? atualizacao.data.versao_esperada : 0,
            tarefa: dados.tarefa,
          },
          dependencias,
        );
        if (!resultado.ok) {
          const codigo =
            resultado.erro.codigo === 'conflito'
              ? 'conflito_versao'
              : codigosErro.find((item) => item === resultado.erro.codigo);
          return erro(codigo ?? 'servico_indisponivel', resultado.request_id);
        }
        if (!resultado.dados || Array.isArray(resultado.dados)) return erro('servico_indisponivel');
        return Response.json(
          { dados: resultado.dados, request_id: resultado.request_id },
          { headers },
        );
      } catch (erroResposta) {
        return erro(
          'servico_indisponivel',
          registrarFalhaDeResposta('tarefa-cuidado', erroResposta),
        );
      }
    },
    async atender(request: Request): Promise<Response> {
      const erro = (codigo: CodigoErro, id = crypto.randomUUID()) =>
        Response.json(criarErroPublicoSemCampos(codigo, id), {
          status: statusErroHttp[codigo],
          headers,
        });
      const url = new URL(request.url);
      const caminho = /^\/api\/pacientes\/([^/]+)\/tarefas$/.exec(url.pathname);
      if (!caminho || request.method !== 'GET') return erro('nao_encontrado');
      const paciente = uuidSchema.safeParse(caminho[1]);
      if (!paciente.success || url.search || url.hash) return erro('entrada_invalida');
      if (!uuidSchema.safeParse(request.headers.get('x-sessao')).success)
        return erro('nao_autenticado');
      try {
        const resultado = await comporTarefaCuidadoNativo(
          request,
          { operacao: 'ler', paciente_id: paciente.data },
          dependencias,
        );
        if (!resultado.ok) {
          const codigo =
            resultado.erro.codigo === 'conflito'
              ? 'conflito_versao'
              : codigosErro.find((item) => item === resultado.erro.codigo);
          return erro(codigo ?? 'servico_indisponivel', resultado.request_id);
        }
        if (!Array.isArray(resultado.dados)) return erro('servico_indisponivel');
        return Response.json(
          { dados: resultado.dados, request_id: resultado.request_id },
          { headers },
        );
      } catch (erroResposta) {
        return erro(
          'servico_indisponivel',
          registrarFalhaDeResposta('tarefa-cuidado', erroResposta),
        );
      }
    },
  };
}
