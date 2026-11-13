import { edicaoPacienteHttp } from '../../../packages/contracts/src/edicao-paciente-http.ts';
import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  criarErroPublicoSemCampos,
  statusErroHttp,
  type CodigoErro,
} from '../../../packages/contracts/src/erros.ts';
import { comporEdicaoPacienteNativa } from './compor-edicao-paciente-nativa.ts';
import { registrarFalhaDeResposta } from './falha-operacional.ts';

type Dependencias = Parameters<typeof comporEdicaoPacienteNativa>[2];
const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
export function criarEntradaEdicaoPacienteNativa(dependencias: Dependencias) {
  return {
    async atender(request: Request): Promise<Response> {
      const erro = (codigo: CodigoErro, id: string = crypto.randomUUID()) =>
        Response.json(criarErroPublicoSemCampos(codigo, id), {
          status: statusErroHttp[codigo],
          headers,
        });
      const url = new URL(request.url);
      if (url.hash || url.search) return erro('entrada_invalida');
      const barreiras = {
        '/api/pacientes/edicao/reserva/consultar': 'consultarReserva',
        '/api/pacientes/edicao/reserva': 'reservar',
        '/api/pacientes/edicao/reserva/encerrar': 'encerrar',
        '/api/pacientes/edicao/reserva/reconhecer': 'reconhecer',
      } as const;
      const barreira = Object.hasOwn(barreiras, url.pathname)
        ? barreiras[url.pathname as keyof typeof barreiras]
        : undefined;
      const item = /^\/api\/pacientes\/([^/]+)$/.exec(url.pathname);
      const nome =
        barreira ??
        (item && request.method === 'GET'
          ? 'consultarPaciente'
          : item && request.method === 'PATCH'
            ? 'editar'
            : undefined);
      if (!nome || request.method !== edicaoPacienteHttp[nome].metodo)
        return erro('nao_encontrado');
      if (!uuidSchema.safeParse(request.headers.get('x-sessao')).success)
        return erro('nao_autenticado');
      if (item && !uuidSchema.safeParse(item[1]).success) return erro('entrada_invalida');
      if (
        nome === 'editar' &&
        !chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia')).success
      )
        return erro('entrada_invalida');
      let entrada: unknown = {};
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

      const validada = edicaoPacienteHttp[nome].entrada.safeParse(entrada);
      if (!validada.success) return erro('entrada_invalida');
      try {
        const pedido = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          signal: request.signal,
        });
        let comando: Parameters<typeof comporEdicaoPacienteNativa>[1];
        if (barreira) {
          const operacoes = {
            consultarReserva: 'api.consultar_barreira_edicao_paciente',
            reservar: 'api.reservar_edicao_paciente',
            encerrar: 'api.encerrar_edicao_paciente',
            reconhecer: 'api.reconhecer_barreira_edicao_paciente',
          } as const;
          comando = {
            tipo: 'barreira',
            entrada: { operacao: operacoes[barreira], ...validada.data },
          };
        } else if (nome === 'consultarPaciente' && item)
          comando = { tipo: 'consultar', pacienteId: item[1] as string };
        else if (nome === 'editar' && item) {
          const dados = edicaoPacienteHttp.editar.entrada.parse(validada.data);
          comando = {
            tipo: 'editar',
            entrada: {
              pacienteId: item[1],
              reservaId: dados.reserva_id,
              geracaoReserva: dados.geracao_reserva,
              corpo: dados.entrada,
              cabecalhos: { 'x-chave-idempotencia': request.headers.get('x-chave-idempotencia') },
            },
          };
        } else return erro('entrada_invalida');
        const resultado = await comporEdicaoPacienteNativa(pedido, comando, dependencias);
        if (!resultado.ok) return erro(resultado.erro.codigo as CodigoErro, resultado.request_id);
        return Response.json(
          {
            dados: edicaoPacienteHttp[nome].saida.parse(resultado.dados),
            request_id: resultado.request_id,
          },
          { headers },
        );
      } catch (erroResposta) {
        return erro(
          request.method === 'GET' ? 'servico_indisponivel' : 'pendencia_externa',
          registrarFalhaDeResposta('edicao-paciente', erroResposta),
        );
      }
    },
  };
}
