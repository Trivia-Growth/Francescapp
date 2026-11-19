import { tipoImagemExecucao } from './turno-execucao-imagem.ts';
import {
  turnoExecucaoHttp,
  type ComandoExecucaoTurno,
  type OperacaoExecucaoTurno,
} from '../../../packages/contracts/src/turno-execucao-http.ts';
import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  codigosErro,
  criarErroPublicoSemCampos,
  statusErroHttp,
  type CodigoErro,
} from '../../../packages/contracts/src/erros.ts';
import {
  comporExecucaoTurno,
  type DependenciasExecucaoTurno,
} from './turno-execucao-compor-nativo.ts';
export const headersExecucaoTurno = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
export function rotaExecucaoTurno(request: Request) {
  const url = new URL(request.url);
  for (const [nome, contrato] of Object.entries(turnoExecucaoHttp)) {
    if (contrato.metodo !== request.method) continue;
    const expressao = new RegExp(
      `^${contrato.caminho.replace(':paciente_id', '([^/]+)').replace(':anexo_id', '([^/]+)')}$`,
    );
    const m = expressao.exec(url.pathname);
    if (m?.[1])
      return {
        operacao: nome as OperacaoExecucaoTurno,
        paciente_id: m[1],
        ...(m[2] ? { anexo_id: m[2] } : {}),
      };
  }
  return null;
}
async function lerJsonLimitado(request: Request, limite: number): Promise<unknown> {
  if (!request.body) throw new Error('Corpo ausente.');
  const leitor = request.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  const sinal = AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]);
  const cancelar = () => {
    void leitor.cancel().catch(() => {});
  };
  sinal.addEventListener('abort', cancelar, { once: true });
  try {
    while (true) {
      if (sinal.aborted) throw new Error('Pedido cancelado.');
      const p = await leitor.read();
      if (sinal.aborted) throw new Error('Pedido cancelado.');
      if (p.done) break;
      total += p.value.byteLength;
      if (total > limite) throw new Error('Corpo excede limite.');
      partes.push(p.value);
    }
    const bytes = new Uint8Array(total);
    let posicao = 0;
    for (const parte of partes) {
      bytes.set(parte, posicao);
      posicao += parte.length;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (falha) {
    await leitor.cancel().catch(() => {});
    throw falha;
  } finally {
    sinal.removeEventListener('abort', cancelar);
    leitor.releaseLock();
  }
}
export function criarEntradaExecucaoTurno(
  dependencias: DependenciasExecucaoTurno,
  operar = comporExecucaoTurno,
) {
  return {
    async atender(request: Request): Promise<Response> {
      const erro = (codigo: CodigoErro, id = crypto.randomUUID()) =>
        Response.json(criarErroPublicoSemCampos(codigo, id), {
          status: statusErroHttp[codigo],
          headers: headersExecucaoTurno,
        });
      const rota = rotaExecucaoTurno(request);
      if (!rota) return erro('nao_encontrado');
      const url = new URL(request.url);
      if (
        url.hash ||
        !uuidSchema.safeParse(rota.paciente_id).success ||
        (rota.anexo_id && !uuidSchema.safeParse(rota.anexo_id).success)
      )
        return erro('entrada_invalida');
      if (!uuidSchema.safeParse(request.headers.get('x-sessao')).success)
        return erro('nao_autenticado');
      const contrato = turnoExecucaoHttp[rota.operacao];
      let entrada: unknown;
      let iniciada = false;
      try {
        if (contrato.metodo === 'GET') {
          if (request.body) throw new Error('Corpo inesperado.');
          const pares = [...url.searchParams.entries()];
          if (new Set(pares.map(([k]) => k)).size !== pares.length)
            throw new Error('Parâmetro repetido.');
          entrada = Object.fromEntries(
            pares.map(([k, v]) => [
              k,
              ['limite', 'cursor_versao'].includes(k) && /^[1-9][0-9]*$/.test(v)
                ? Number(v)
                : k === 'historico' && ['true', 'false'].includes(v)
                  ? v === 'true'
                  : v,
            ]),
          );
        } else {
          if (
            url.search ||
            request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
              'application/json' ||
            !chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia')).success
          )
            throw new Error('Entrada inválida.');
          entrada = await lerJsonLimitado(
            request,
            rota.operacao === 'enviarAnexo' ? 4 * 1024 * 1024 + 32_768 : 131_072,
          );
        }
        const validada = contrato.entrada.safeParse(entrada);
        if (!validada.success) return erro('entrada_invalida');
        const comando = { ...rota, entrada: validada.data } as ComandoExecucaoTurno;
        iniciada = true;
        const r = await operar(request, comando, dependencias);
        if (!r.ok)
          return erro(
            codigosErro.find((c) => c === r.erro.codigo) ?? 'servico_indisponivel',
            r.request_id,
          );
        const dados = contrato.saida.parse(r.dados);
        if (dados instanceof Uint8Array) {
          const pdf = rota.operacao === 'pdf' || rota.operacao === 'exportarLocalizacao';
          const tipo = pdf ? 'application/pdf' : tipoImagemExecucao(dados);
          if (!tipo) throw new Error('Anexo inválido.');
          return new Response(new Uint8Array(dados), {
            headers: {
              ...headersExecucaoTurno,
              'Content-Type': tipo,
              'Content-Disposition': `attachment; filename="${pdf ? 'relatorio.pdf' : 'anexo'}"`,
              'Content-Length': String(dados.byteLength),
              'Content-Security-Policy': "default-src 'none'; sandbox",
            },
          });
        }
        return Response.json(
          { dados, request_id: r.request_id },
          { headers: headersExecucaoTurno },
        );
      } catch {
        return erro(
          !iniciada
            ? 'entrada_invalida'
            : contrato.metodo === 'GET'
              ? 'servico_indisponivel'
              : 'pendencia_externa',
        );
      }
    },
  };
}
