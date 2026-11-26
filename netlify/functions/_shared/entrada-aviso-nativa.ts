import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  criarErroPublicoSemCampos,
  statusErroHttp,
  type CodigoErro,
} from '../../../packages/contracts/src/erros.ts';
import { avisoHttp } from '../../../packages/contracts/src/aviso-http.ts';
import { comporAvisoNativo } from './compor-aviso-nativo.ts';
import { registrarFalhaDeResposta } from './falha-operacional.ts';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
type Dependencias = Parameters<typeof comporAvisoNativo>[2];

/** Lê o corpo com teto antes de decodificar, para não acumular entrada arbitrária. */
async function lerCorpo(request: Request): Promise<unknown | null> {
  if (
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
      'application/json' ||
    !request.body
  )
    return null;
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
      if (tamanho > 4_096) {
        void leitor.cancel().catch(() => {});
        return null;
      }
      partes.push(parte.value);
    }
    const bytes = new Uint8Array(tamanho);
    let posicao = 0;
    for (const parte of partes) {
      bytes.set(parte, posicao);
      posicao += parte.length;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    void leitor.cancel().catch(() => {});
    return null;
  } finally {
    clearTimeout(prazo);
    request.signal.removeEventListener('abort', cancelar);
  }
}

/** Entrada interna dos avisos no aplicativo; não registra rota nem concede privilégios.
 *
 * Nenhuma rota é por paciente: o aviso é da pessoa autenticada. O caso viaja dentro do
 * item, e o servidor refaz o filtro de audiência a cada chamada. */
export function criarEntradaAvisoNativa(dependencias: Dependencias) {
  return {
    async atender(request: Request): Promise<Response> {
      const erro = (codigo: CodigoErro, id = crypto.randomUUID()) =>
        Response.json(criarErroPublicoSemCampos(codigo, id), {
          status: statusErroHttp[codigo],
          headers,
        });
      const url = new URL(request.url);
      const leitura = url.pathname === '/api/avisos/leitura';
      if (!leitura && url.pathname !== '/api/avisos') return erro('nao_encontrado');
      const metodo = leitura ? 'POST' : 'GET';
      if (request.method !== metodo) return erro('nao_encontrado');
      if (url.hash || url.search) return erro('entrada_invalida');
      if (!uuidSchema.safeParse(request.headers.get('x-sessao')).success)
        return erro('nao_autenticado');
      let comando: Parameters<typeof comporAvisoNativo>[1] = { operacao: 'listar' };
      if (leitura) {
        if (!chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia')).success)
          return erro('entrada_invalida');
        const bruto = await lerCorpo(request);
        if (bruto === null) return erro('entrada_invalida');
        const corpo = avisoHttp.marcarLido.entrada.safeParse(bruto);
        if (!corpo.success) return erro('entrada_invalida');
        comando = { operacao: 'marcar_lido', ...corpo.data };
      }
      try {
        const pedido = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          signal: request.signal,
        });
        const resultado = await comporAvisoNativo(pedido, comando, dependencias);
        if (!resultado.ok) return erro(resultado.erro.codigo, resultado.request_id);
        const dados = avisoHttp.listar.saida.parse(resultado.dados);
        return Response.json({ dados, request_id: resultado.request_id }, { headers });
      } catch (erroResposta) {
        return erro(
          leitura ? 'pendencia_externa' : 'servico_indisponivel',
          registrarFalhaDeResposta('avisos', erroResposta),
        );
      }
    },
  };
}
