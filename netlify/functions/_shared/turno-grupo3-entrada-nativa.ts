import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import { turnoGrupo3Http } from '../../../packages/contracts/src/turno-passagem.ts';
import {
  codigosErro,
  criarErroPublicoSemCampos,
  statusErroHttp,
  type CodigoErro,
} from '../../../packages/contracts/src/erros.ts';
import { comporTurnoGrupo3 } from './turno-grupo3-compor-nativo.ts';
import type { ComandoGrupo3, OperacaoGrupo3 } from './turno-grupo3-nativo.ts';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
/** Despacho literal: escala nunca é interpretada como UUID de turno. */
export function rotaGrupo3(
  request: Request,
): { operacao: OperacaoGrupo3; paciente_id: string; escala_id?: string; turno_id?: string } | null {
  const caminho = new URL(request.url).pathname;
  let alvo = /^\/api\/pacientes\/([^/]+)\/turnos\/escala$/.exec(caminho);
  if (alvo && (request.method === 'GET' || request.method === 'POST'))
    return {
      operacao: request.method === 'GET' ? 'escala' : 'criarEscala',
      paciente_id: alvo[1] as string,
    };
  alvo = /^\/api\/pacientes\/([^/]+)\/turnos\/escala\/([^/]+)$/.exec(caminho);
  if (alvo && request.method === 'PATCH')
    return {
      operacao: 'alterarEscala',
      paciente_id: alvo[1] as string,
      escala_id: alvo[2] as string,
    };
  alvo = /^\/api\/pacientes\/([^/]+)\/turnos\/([^/]+)\/passagem(\/ciencia)?$/.exec(caminho);
  if (alvo && (request.method === 'GET' || request.method === 'POST')) {
    if (alvo[3] && request.method !== 'POST') return null;
    return {
      operacao: alvo[3] ? 'ciencia' : request.method === 'GET' ? 'passagem' : 'publicar',
      paciente_id: alvo[1] as string,
      turno_id: alvo[2] as string,
    };
  }
  return null;
}
export function criarEntradaTurnoGrupo3(
  dependencias: Parameters<typeof comporTurnoGrupo3>[2],
  operar = comporTurnoGrupo3,
) {
  return {
    async atender(request: Request): Promise<Response> {
      const erro = (codigo: CodigoErro, requestId = crypto.randomUUID()) =>
        Response.json(criarErroPublicoSemCampos(codigo, requestId), {
          status: statusErroHttp[codigo],
          headers,
        });
      const rota = rotaGrupo3(request);
      if (!rota) return erro('nao_encontrado');
      const url = new URL(request.url);
      if (
        (url.search && rota.operacao !== 'escala') ||
        url.hash ||
        !uuidSchema.safeParse(rota.paciente_id).success ||
        (rota.escala_id && !uuidSchema.safeParse(rota.escala_id).success) ||
        (rota.turno_id && !uuidSchema.safeParse(rota.turno_id).success)
      )
        return erro('entrada_invalida');
      if (!uuidSchema.safeParse(request.headers.get('x-sessao')).success)
        return erro('nao_autenticado');
      const contrato = turnoGrupo3Http[rota.operacao];
      let entrada: unknown = {};
      if (contrato.metodo === 'GET') {
        if (request.body) return erro('entrada_invalida');
        if (rota.operacao === 'escala') {
          const parametros = [...url.searchParams.entries()];
          if (
            parametros.some(([chave]) => !['cursor_escala_id', 'cursor_versao'].includes(chave)) ||
            new Set(parametros.map(([chave]) => chave)).size !== parametros.length
          )
            return erro('entrada_invalida');
          entrada = Object.fromEntries(
            parametros.map(([chave, valor]) => [
              chave,
              chave === 'cursor_versao' && /^[1-9][0-9]*$/.test(valor) ? Number(valor) : valor,
            ]),
          );
        }
      } else {
        if (
          !request.body ||
          request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
            'application/json' ||
          !chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia')).success
        )
          return erro('entrada_invalida');
        const leitor = request.body.getReader();
        const sinal = AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]);
        const cancelar = () => {
          void leitor.cancel().catch(() => {});
        };
        sinal.addEventListener('abort', cancelar, { once: true });
        const partes: Uint8Array[] = [];
        let tamanho = 0;
        try {
          if (sinal.aborted) throw new Error();
          while (true) {
            const parte = await leitor.read();
            if (sinal.aborted) throw new Error();
            if (parte.done) break;
            tamanho += parte.value.byteLength;
            if (tamanho > 32_768) throw new Error();
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
          cancelar();
          return erro('entrada_invalida');
        } finally {
          sinal.removeEventListener('abort', cancelar);
          leitor.releaseLock();
        }
      }
      const corpo = contrato.entrada.safeParse(entrada);
      if (!corpo.success) return erro('entrada_invalida');
      try {
        const comando: ComandoGrupo3 = { ...rota, entrada: corpo.data };
        const resultado = await operar(request, comando, dependencias);
        if (!resultado.ok) {
          const codigo =
            codigosErro.find((c) => c === resultado.erro.codigo) ?? 'servico_indisponivel';
          return erro(codigo, resultado.request_id);
        }
        // Conferência pública final impede qualquer envelope cifrado/metadado interno sair.
        const dados = contrato.saida.parse(resultado.dados);
        return Response.json({ dados, request_id: resultado.request_id }, { headers });
      } catch {
        return erro(contrato.metodo === 'GET' ? 'servico_indisponivel' : 'pendencia_externa');
      }
    },
  };
}
