import { contratosRotas } from '../../../packages/contracts/src/rotas.ts';
import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  criarErroPublicoSemCampos,
  statusErroHttp,
  type CodigoErro,
} from '../../../packages/contracts/src/erros.ts';
import { comporAprovarObjetivoPlanoNativo } from './compor-aprovar-objetivo-plano-nativo.ts';
import { registrarFalhaDeResposta } from './falha-operacional.ts';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
type Dependencias = Parameters<typeof comporAprovarObjetivoPlanoNativo>[2];

/** Entrada interna; não registra rota nem concede privilégios. Só POST: carimbo de
 * aprovação não tem consulta nem idempotência por chave (natural pelo par
 * registro_id/aprovador no banco) — o cabeçalho de chave é só o envelope padrão do
 * projeto para mutações, validado e descartado, nunca repassado à SQL. */
export function criarEntradaAprovarObjetivoPlanoNativa(dependencias: Dependencias) {
  return {
    async atender(request: Request): Promise<Response> {
      const erro = (codigo: CodigoErro, id = crypto.randomUUID()) =>
        Response.json(criarErroPublicoSemCampos(codigo, id), {
          status: statusErroHttp[codigo],
          headers,
        });
      const url = new URL(request.url);
      if (url.pathname !== '/api/plano/aprovar-objetivo' || request.method !== 'POST' || url.hash)
        return erro('nao_encontrado');
      if (!uuidSchema.safeParse(request.headers.get('x-sessao')).success)
        return erro('nao_autenticado');
      if (
        !chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia')).success ||
        request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
          'application/json' ||
        !request.body
      )
        return erro('entrada_invalida');
      const leitor = request.body.getReader();
      const partes: Uint8Array[] = [];
      let tamanho = 0;
      const controle = new AbortController();
      const cancelar = () => controle.abort();
      request.signal.addEventListener('abort', cancelar, { once: true });
      if (request.signal.aborted) cancelar();
      const prazo = setTimeout(cancelar, 15_000);
      let corpoValidado: ReturnType<typeof contratosRotas.aprovarObjetivoPlano.entrada.parse>;
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
        const corpo = contratosRotas.aprovarObjetivoPlano.entrada.safeParse(
          JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
        );
        if (!corpo.success) return erro('entrada_invalida');
        corpoValidado = corpo.data;
      } catch {
        void leitor.cancel().catch(() => {});
        return erro('entrada_invalida');
      } finally {
        clearTimeout(prazo);
        request.signal.removeEventListener('abort', cancelar);
      }
      try {
        const pedido = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          signal: request.signal,
        });
        const resultado = await comporAprovarObjetivoPlanoNativo(
          pedido,
          { registro_id: corpoValidado.registro_id },
          dependencias,
        );
        if (!resultado.ok) return erro(resultado.erro.codigo, resultado.request_id);
        const dados = contratosRotas.aprovarObjetivoPlano.saida.parse(resultado.dados);
        return Response.json({ dados, request_id: resultado.request_id }, { headers });
      } catch (erroResposta) {
        return erro(
          'pendencia_externa',
          registrarFalhaDeResposta('aprovar-objetivo-plano', erroResposta),
        );
      }
    },
  };
}
