import { criarContatoReservadoHttpSchema } from '../../../packages/contracts/src/barreira-contato-servidor.ts';
import {
  cabecalhosMutacaoSchema,
  contratosRotas,
  criarErroPublicoSemCampos,
  statusErroHttp,
  uuidSchema,
  type CodigoErro,
} from '../../../packages/contracts/src/index.ts';
import { comporContatoNativo } from './compor-contato-nativo.ts';

type Dependencias = Parameters<typeof comporContatoNativo>[2];
const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
export function criarEntradaContatoNativo(dependencias: Dependencias) {
  return {
    async atender(request: Request): Promise<Response> {
      const erro = (codigo: CodigoErro, id: string = crypto.randomUUID()) =>
        Response.json(criarErroPublicoSemCampos(codigo, id), {
          status: statusErroHttp[codigo],
          headers,
        });
      const url = new URL(request.url);
      const item = /^\/api\/pacientes\/([^/]+)\/contatos$/.exec(url.pathname);
      if (request.method !== 'POST' || !item) return erro('nao_encontrado');
      if (url.search || url.hash || !uuidSchema.safeParse(item[1]).success)
        return erro('entrada_invalida');
      if (!uuidSchema.safeParse(request.headers.get('x-sessao')).success)
        return erro('nao_autenticado');
      const cabecalhos = cabecalhosMutacaoSchema.safeParse({
        'x-chave-idempotencia': request.headers.get('x-chave-idempotencia'),
      });
      if (
        !cabecalhos.success ||
        request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
          'application/json' ||
        !request.body
      )
        return erro('entrada_invalida');
      let entrada: unknown;
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
      const validada = criarContatoReservadoHttpSchema.safeParse(entrada);
      if (!validada.success) return erro('entrada_invalida');
      try {
        const pedido = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          signal: request.signal,
        });
        const resultado = await comporContatoNativo(
          pedido,
          {
            pacienteId: item[1] as string,
            corpo: validada.data.entrada,
            cabecalhos: cabecalhos.data,
            reservaId: validada.data.reserva_id,
            geracaoReserva: validada.data.geracao_reserva,
          },
          dependencias,
        );
        if (!resultado.ok) return erro(resultado.erro.codigo as CodigoErro, resultado.request_id);
        return Response.json(
          {
            dados: contratosRotas.criarContato.saida.parse(resultado.dados),
            request_id: resultado.request_id,
          },
          { headers },
        );
      } catch {
        return erro('pendencia_externa');
      }
    },
  };
}
