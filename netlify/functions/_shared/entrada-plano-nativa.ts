import { planoHttp } from '../../../packages/contracts/src/plano-http.ts';
import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  criarErroPublicoSemCampos,
  statusErroHttp,
  type CodigoErro,
} from '../../../packages/contracts/src/erros.ts';
import { comporPlanoCuidadoNativo } from './compor-plano-cuidado-nativo.ts';
import { comporBarreiraPlanoNativa } from './compor-barreira-plano-nativa.ts';

type Dependencias = Parameters<typeof comporPlanoCuidadoNativo>[2];
const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
/** Entrada interna, não registrada no dispatcher protegido. */
export function criarEntradaPlanoNativa(
  dependencias: Dependencias,
  composicoes = { plano: comporPlanoCuidadoNativo, barreira: comporBarreiraPlanoNativa },
) {
  return {
    async atender(request: Request): Promise<Response> {
      const erro = (codigo: CodigoErro, id: string = crypto.randomUUID()) =>
        Response.json(criarErroPublicoSemCampos(codigo, id), {
          status: statusErroHttp[codigo],
          headers,
        });
      const url = new URL(request.url);
      if (url.hash) return erro('entrada_invalida');
      const item = /^\/api\/pacientes\/([^/]+)\/plano(?:\/([^/]+)(\/historico)?)?$/.exec(
        url.pathname,
      );
      const barreiras = {
        '/api/plano/reserva/consultar': 'consultarReserva',
        '/api/plano/reserva': 'reservar',
        '/api/plano/reserva/encerrar': 'encerrar',
        '/api/plano/reserva/reconhecer': 'reconhecer',
      } as const;
      const barreira: (typeof barreiras)[keyof typeof barreiras] | undefined = Object.hasOwn(
        barreiras,
        url.pathname,
      )
        ? barreiras[url.pathname as keyof typeof barreiras]
        : undefined;
      const nome =
        barreira ??
        (item && request.method === 'GET' && !item[2]
          ? 'consultar'
          : item && request.method === 'GET' && item[2] && item[3]
            ? 'historico'
            : item && request.method === 'POST' && !item[2]
              ? 'criar'
              : item && request.method === 'PATCH' && item[2] && !item[3]
                ? 'revisar'
                : null);
      if (!nome || request.method !== planoHttp[nome].metodo) return erro('nao_encontrado');
      if (!uuidSchema.safeParse(request.headers.get('x-sessao')).success)
        return erro('nao_autenticado');
      if (
        item &&
        (!uuidSchema.safeParse(item[1]).success ||
          (item[2] && !uuidSchema.safeParse(item[2]).success))
      )
        return erro('entrada_invalida');
      let entrada: unknown = {};
      if (request.method === 'GET') {
        const consulta: Record<string, string> = {};
        for (const [chave, valor] of url.searchParams) {
          if ((chave !== 'cursor' && chave !== 'limite') || Object.hasOwn(consulta, chave))
            return erro('entrada_invalida');
          consulta[chave] = valor;
        }
        entrada = consulta;
      } else if (url.search) return erro('entrada_invalida');
      if (request.method !== 'GET') {
        if (
          request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
            'application/json' ||
          !request.body
        )
          return erro('entrada_invalida');
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
            tamanho += parte.value.length;
            if (tamanho > 32768) throw new Error();
            partes.push(parte.value);
          }
          const bytes = new Uint8Array(tamanho);
          let posicao = 0;
          for (const parte of partes) {
            bytes.set(parte, posicao);
            posicao += parte.length;
          }
          entrada = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        } catch {
          void leitor.cancel().catch(() => {});
          return erro('entrada_invalida');
        } finally {
          leitor.releaseLock();
        }
      }
      const validada = planoHttp[nome].entrada.safeParse(entrada);
      if (!validada.success) return erro('entrada_invalida');
      if (
        (nome === 'criar' || nome === 'revisar') &&
        !chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia')).success
      )
        return erro('entrada_invalida');
      try {
        const pedido = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          signal: request.signal,
        });
        if (barreira) {
          const operacoes = {
            consultarReserva: 'api.consultar_barreira_plano',
            reservar: 'api.reservar_plano',
            encerrar: 'api.encerrar_plano',
            reconhecer: 'api.reconhecer_barreira_plano',
          } as const;
          const resultado = await composicoes.barreira(
            pedido,
            { operacao: operacoes[barreira], ...validada.data },
            dependencias,
          );
          if (!resultado.ok) return erro(resultado.erro.codigo as CodigoErro, resultado.request_id);
          return Response.json(
            {
              dados: planoHttp[nome].saida.parse(resultado.dados),
              request_id: resultado.request_id,
            },
            { headers },
          );
        }
        if (!item) return erro('entrada_invalida');
        const paciente_id = item[1] as string;
        let comando: Parameters<typeof comporPlanoCuidadoNativo>[1];
        if (nome === 'consultar')
          comando = {
            operacao: 'ler',
            paciente_id,
            ...planoHttp.consultar.entrada.parse(validada.data),
          };
        else if (nome === 'historico')
          comando = {
            operacao: 'historico',
            paciente_id,
            objetivo_id: item[2] as string,
            ...planoHttp.historico.entrada.parse(validada.data),
          };
        else if (nome === 'criar') {
          const dados = planoHttp.criar.entrada.parse(validada.data);
          comando = { operacao: 'gravar', paciente_id, versao_esperada: 0, ...dados };
        } else {
          const dados = planoHttp.revisar.entrada.parse(validada.data);
          comando = { operacao: 'gravar', paciente_id, objetivo_id: item[2] as string, ...dados };
        }
        const resultado = await composicoes.plano(pedido, comando, dependencias);
        if (!resultado.ok) return erro(resultado.erro.codigo, resultado.request_id);
        return Response.json(
          { dados: planoHttp[nome].saida.parse(resultado.dados), request_id: resultado.request_id },
          { headers },
        );
      } catch {
        return erro(request.method === 'GET' ? 'servico_indisponivel' : 'pendencia_externa');
      }
    },
  };
}
