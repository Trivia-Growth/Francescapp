import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  criarErroPublicoSemCampos,
  statusErroHttp,
  type CodigoErro,
} from '../../../packages/contracts/src/erros.ts';
import { contratosRotas } from '../../../packages/contracts/src/rotas.ts';
import { comporDiarioNativo } from './compor-diario-nativo.ts';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
type Dependencias = Parameters<typeof comporDiarioNativo>[2];

/** Entrada interna; não registra rota nem concede privilégios. */
export function criarEntradaDiarioNativa(dependencias: Dependencias) {
  return {
    async atender(request: Request): Promise<Response> {
      const erro = (codigo: CodigoErro, id = crypto.randomUUID()) =>
        Response.json(criarErroPublicoSemCampos(codigo, id), {
          status: statusErroHttp[codigo],
          headers,
        });
      const url = new URL(request.url);
      const caminho = /^\/api\/pacientes\/([^/]+)\/diario$/.exec(url.pathname);
      if (!caminho || (request.method !== 'GET' && request.method !== 'POST'))
        return erro('nao_encontrado');
      const paciente = contratosRotas.consultarDiario.parametros.safeParse({
        paciente_id: caminho[1],
      });
      // O diário não tem filtro por parâmetro: a audiência é decidida no banco, não na query.
      if (!paciente.success || url.hash || url.search) return erro('entrada_invalida');
      if (!uuidSchema.safeParse(request.headers.get('x-sessao')).success)
        return erro('nao_autenticado');
      let comando: Parameters<typeof comporDiarioNativo>[1] = {
        operacao: 'ler',
        paciente_id: paciente.data.paciente_id,
      };
      if (request.method === 'POST') {
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
          const corpo = contratosRotas.salvarRegistroDiario.entrada.safeParse(
            JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
          );
          if (!corpo.success) return erro('entrada_invalida');
          comando = { operacao: 'gravar', paciente_id: paciente.data.paciente_id, ...corpo.data };
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
        const resultado = await comporDiarioNativo(pedido, comando, dependencias);
        if (!resultado.ok) return erro(resultado.erro.codigo, resultado.request_id);
        const schema =
          request.method === 'GET'
            ? contratosRotas.consultarDiario.saida
            : contratosRotas.salvarRegistroDiario.saida;
        const dados = schema.parse(resultado.dados);
        return Response.json({ dados, request_id: resultado.request_id }, { headers });
      } catch {
        return erro(request.method === 'POST' ? 'pendencia_externa' : 'servico_indisponivel');
      }
    },
  };
}
