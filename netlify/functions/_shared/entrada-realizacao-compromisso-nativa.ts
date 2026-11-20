import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  criarErroPublicoSemCampos,
  statusErroHttp,
  type CodigoErro,
} from '../../../packages/contracts/src/erros.ts';
import { realizacaoCompromissoHttp } from '../../../packages/contracts/src/realizacao-compromisso-http.ts';
import { comporRealizacaoCompromissoNativo } from './compor-realizacao-compromisso-nativo.ts';
import { registrarFalhaDeResposta } from './falha-operacional.ts';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
type Dependencias = Parameters<typeof comporRealizacaoCompromissoNativo>[2];

/** Lê o corpo com teto antes da decodificação: o limite evita acumular corpo arbitrário
 * em memória, e o prazo evita um envio lento segurar a função até o fim do tempo da rota. */
async function lerCorpo(request: Request): Promise<unknown> {
  if (!request.body) throw new Error();
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
      if (tamanho > 524_288) throw new Error();
      partes.push(parte.value);
    }
    const bytes = new Uint8Array(tamanho);
    let posicao = 0;
    for (const parte of partes) {
      bytes.set(parte, posicao);
      posicao += parte.length;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (erro) {
    void leitor.cancel().catch(() => {});
    throw erro;
  } finally {
    clearTimeout(prazo);
    request.signal.removeEventListener('abort', cancelar);
  }
}

/** Entrada interna do registro de realização; não registra rota nem concede privilégios. */
export function criarEntradaRealizacaoCompromissoNativa(dependencias: Dependencias) {
  return {
    async atender(request: Request): Promise<Response> {
      const erro = (codigo: CodigoErro, id = crypto.randomUUID()) =>
        Response.json(criarErroPublicoSemCampos(codigo, id), {
          status: statusErroHttp[codigo],
          headers,
        });
      const url = new URL(request.url);
      const consulta = url.pathname === realizacaoCompromissoHttp.consultar.caminho;
      const registro = url.pathname === realizacaoCompromissoHttp.registrar.caminho;
      if (!consulta && !registro) return erro('nao_encontrado');
      if (request.method !== 'POST') return erro('nao_encontrado');
      if (url.hash || url.search) return erro('entrada_invalida');
      if (!uuidSchema.safeParse(request.headers.get('x-sessao')).success)
        return erro('nao_autenticado');
      if (
        request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
        'application/json'
      )
        return erro('entrada_invalida');
      if (
        registro &&
        !chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia')).success
      )
        return erro('entrada_invalida');
      let bruto: unknown;
      try {
        bruto = await lerCorpo(request);
      } catch {
        return erro('entrada_invalida');
      }
      let comando: Parameters<typeof comporRealizacaoCompromissoNativo>[1];
      if (consulta) {
        const corpo = realizacaoCompromissoHttp.consultar.entrada.safeParse(bruto);
        if (!corpo.success) return erro('entrada_invalida');
        comando = { operacao: 'consultar', ...corpo.data };
      } else {
        const corpo = realizacaoCompromissoHttp.registrar.entrada.safeParse(bruto);
        if (!corpo.success) return erro('entrada_invalida');
        comando = { operacao: 'registrar', ...corpo.data };
      }
      try {
        const pedido = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          signal: request.signal,
        });
        const resultado = await comporRealizacaoCompromissoNativo(pedido, comando, dependencias);
        if (!resultado.ok) return erro(resultado.erro.codigo, resultado.request_id);
        const dados = (
          consulta
            ? realizacaoCompromissoHttp.consultar.saida
            : realizacaoCompromissoHttp.registrar.saida
        ).parse(resultado.dados);
        return Response.json({ dados, request_id: resultado.request_id }, { headers });
      } catch (erroResposta) {
        return erro(
          consulta ? 'servico_indisponivel' : 'pendencia_externa',
          registrarFalhaDeResposta('realizacao-compromisso', erroResposta),
        );
      }
    },
  };
}
