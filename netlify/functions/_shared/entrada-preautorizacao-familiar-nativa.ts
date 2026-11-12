import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  cancelarPreautorizacaoFamiliarSchema,
  listaPreautorizacoesFamiliaresSchema,
} from '../../../packages/contracts/src/identidade.ts';
import {
  criarErroPublicoSemCampos,
  statusErroHttp,
  type CodigoErro,
} from '../../../packages/contracts/src/erros.ts';
import { comporPreautorizacaoFamiliarNativo } from './compor-preautorizacao-familiar-nativo.ts';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
const rota = '/api/admin/preautorizacoes-familiares';
type Dependencias = Parameters<typeof comporPreautorizacaoFamiliarNativo>[2];

/** Entrada interna; não registra rota nem concede privilégios. */
export function criarEntradaPreautorizacaoFamiliarNativa(dependencias: Dependencias) {
  return {
    async atender(request: Request): Promise<Response> {
      const erro = (codigo: CodigoErro, id = crypto.randomUUID()) =>
        Response.json(criarErroPublicoSemCampos(codigo, id), {
          status: statusErroHttp[codigo],
          headers,
        });
      const url = new URL(request.url);
      if (
        url.pathname !== rota ||
        (request.method !== 'GET' && request.method !== 'POST') ||
        url.hash
      )
        return erro('nao_encontrado');
      if (!uuidSchema.safeParse(request.headers.get('x-sessao')).success)
        return erro('nao_autenticado');
      let comando: Parameters<typeof comporPreautorizacaoFamiliarNativo>[1];
      if (request.method === 'GET') {
        const parametros = [...url.searchParams.keys()];
        const paciente = url.searchParams.get('paciente_id');
        if (
          parametros.length !== 1 ||
          parametros[0] !== 'paciente_id' ||
          !uuidSchema.safeParse(paciente).success
        )
          return erro('entrada_invalida');
        comando = { operacao: 'listar', paciente_id: paciente as string };
      } else {
        if (
          url.search ||
          !chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia')).success ||
          request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
            'application/json' ||
          !request.body
        )
          return erro('entrada_invalida');
        const leitor = request.body.getReader();
        const partes: Uint8Array[] = [];
        let tamanho = 0;
        try {
          while (true) {
            const parte = await leitor.read();
            if (parte.done) break;
            tamanho += parte.value.byteLength;
            if (tamanho > 8192) {
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
          const corpo = cancelarPreautorizacaoFamiliarSchema.safeParse(
            JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
          );
          if (!corpo.success) return erro('entrada_invalida');
          comando = { operacao: 'cancelar', ...corpo.data };
        } catch {
          void leitor.cancel().catch(() => {});
          return erro('entrada_invalida');
        } finally {
          leitor.releaseLock();
        }
      }
      try {
        const resultado = await comporPreautorizacaoFamiliarNativo(request, comando, dependencias);
        if (!resultado.ok) return erro(resultado.erro.codigo, resultado.request_id);
        const dados =
          request.method === 'GET'
            ? listaPreautorizacoesFamiliaresSchema.parse(resultado.dados)
            : resultado.dados;
        return Response.json({ dados, request_id: resultado.request_id }, { headers });
      } catch {
        return erro(request.method === 'POST' ? 'pendencia_externa' : 'servico_indisponivel');
      }
    },
  };
}
