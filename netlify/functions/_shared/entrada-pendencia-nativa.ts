import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  criarErroPublicoSemCampos,
  statusErroHttp,
  type CodigoErro,
} from '../../../packages/contracts/src/erros.ts';
import { pendenciaHttp } from '../../../packages/contracts/src/pendencia-http.ts';
import { comporPendenciaNativa } from './compor-pendencia-nativa.ts';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
type Dependencias = Parameters<typeof comporPendenciaNativa>[2];

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

/** Entrada interna das pendências do caso; não registra rota nem concede privilégios. */
export function criarEntradaPendenciaNativa(dependencias: Dependencias) {
  return {
    async atender(request: Request): Promise<Response> {
      const erro = (codigo: CodigoErro, id = crypto.randomUUID()) =>
        Response.json(criarErroPublicoSemCampos(codigo, id), {
          status: statusErroHttp[codigo],
          headers,
        });
      const url = new URL(request.url);
      const caminho = /^\/api\/pacientes\/([^/]+)\/pendencias(\/acordo|\/tratativa)?$/.exec(
        url.pathname,
      );
      if (!caminho) return erro('nao_encontrado');
      const sufixo = caminho[2];
      const metodo =
        sufixo === undefined ? 'GET' : sufixo === '/acordo' ? 'PUT' : ('POST' as const);
      if (request.method !== metodo) return erro('nao_encontrado');
      const paciente = uuidSchema.safeParse(caminho[1]);
      if (!paciente.success || url.hash || url.search) return erro('entrada_invalida');
      if (!uuidSchema.safeParse(request.headers.get('x-sessao')).success)
        return erro('nao_autenticado');
      let comando: Parameters<typeof comporPendenciaNativa>[1] = {
        operacao: 'ler',
        paciente_id: paciente.data,
      };
      if (metodo !== 'GET') {
        if (!chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia')).success)
          return erro('entrada_invalida');
        const bruto = await lerCorpo(request);
        if (bruto === null) return erro('entrada_invalida');
        const contrato = metodo === 'PUT' ? pendenciaHttp.acordar : pendenciaHttp.tratar;
        const corpo = contrato.entrada.safeParse(bruto);
        if (!corpo.success) return erro('entrada_invalida');
        comando = {
          operacao: metodo === 'PUT' ? 'acordar' : 'tratar',
          paciente_id: paciente.data,
          ...corpo.data,
        };
      }
      try {
        const pedido = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          signal: request.signal,
        });
        const resultado = await comporPendenciaNativa(pedido, comando, dependencias);
        if (!resultado.ok) return erro(resultado.erro.codigo, resultado.request_id);
        const dados = pendenciaHttp.consultar.saida.parse(resultado.dados);
        return Response.json({ dados, request_id: resultado.request_id }, { headers });
      } catch {
        return erro(metodo === 'GET' ? 'servico_indisponivel' : 'pendencia_externa');
      }
    },
  };
}
