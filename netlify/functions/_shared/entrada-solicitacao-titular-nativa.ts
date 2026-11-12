import {
  consultaSolicitacaoTitularSchema,
  registrarSolicitacaoTitularSchema,
  responderSolicitacaoTitularSchema,
} from '../../../packages/contracts/src/solicitacao-titular.ts';
import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  criarErroPublicoSemCampos,
  statusErroHttp,
  type CodigoErro,
} from '../../../packages/contracts/src/erros.ts';
import { comporSolicitacaoTitularNativa } from './compor-solicitacao-titular-nativa.ts';
import type { ComandoSolicitacaoTitular } from './solicitacao-titular-nativa.ts';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
type Dependencias = Parameters<typeof comporSolicitacaoTitularNativa>[2];

/** Entrada interna; não registra rota nem concede privilégios.
 *
 * `POST` registra uma solicitação nova; `POST` com `solicitacao_id` responde uma existente. A
 * distinção é pelo corpo e não por caminho, porque é a mesma obrigação legal acompanhada em
 * dois momentos — e o banco trata as duas como ações separadas e auditadas. */
export function criarEntradaSolicitacaoTitularNativa(dependencias: Dependencias) {
  return {
    async atender(request: Request): Promise<Response> {
      const erro = (codigo: CodigoErro, id = crypto.randomUUID()) =>
        Response.json(criarErroPublicoSemCampos(codigo, id), {
          status: statusErroHttp[codigo],
          headers,
        });
      const url = new URL(request.url);
      if (
        url.pathname !== '/api/admin/solicitacoes-titular' ||
        (request.method !== 'GET' && request.method !== 'POST') ||
        url.hash ||
        (request.method === 'POST' && url.search)
      )
        return erro('nao_encontrado');
      if (!uuidSchema.safeParse(request.headers.get('x-sessao')).success)
        return erro('nao_autenticado');
      let comando: ComandoSolicitacaoTitular;
      if (request.method === 'GET') {
        const consulta: Record<string, unknown> = {};
        for (const [chave, valor] of url.searchParams) {
          if (
            !['limite', 'cursor', 'paciente_id'].includes(chave) ||
            Object.hasOwn(consulta, chave)
          )
            return erro('entrada_invalida');
          consulta[chave] = chave === 'limite' && /^\d{1,3}$/.test(valor) ? Number(valor) : valor;
        }
        const validada = consultaSolicitacaoTitularSchema.safeParse(consulta);
        if (!validada.success) return erro('entrada_invalida');
        comando = { operacao: 'listar', ...validada.data };
      } else {
        if (
          !chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia')).success ||
          request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
            'application/json' ||
          !request.body
        )
          return erro('entrada_invalida');
        let corpo: unknown;
        try {
          const bruto = await request.text();
          if (bruto.length > 32_768) return erro('entrada_invalida');
          corpo = JSON.parse(bruto);
        } catch {
          return erro('entrada_invalida');
        }
        if (corpo && typeof corpo === 'object' && 'solicitacao_id' in corpo) {
          const { paciente_id, ...resto } = corpo as Record<string, unknown>;
          const validada = responderSolicitacaoTitularSchema.safeParse(resto);
          if (!validada.success || !uuidSchema.safeParse(paciente_id).success)
            return erro('entrada_invalida');
          comando = {
            operacao: 'responder',
            ...validada.data,
            paciente_id: paciente_id as string,
          };
        } else {
          const validada = registrarSolicitacaoTitularSchema.safeParse(corpo);
          if (!validada.success) return erro('entrada_invalida');
          comando = { operacao: 'registrar', ...validada.data };
        }
      }
      try {
        const pedido = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          signal: request.signal,
        });
        const resultado = await comporSolicitacaoTitularNativa(pedido, comando, dependencias);
        if (!resultado.ok) return erro(resultado.erro.codigo, resultado.request_id);
        return Response.json(
          { dados: resultado.dados, request_id: resultado.request_id },
          { headers },
        );
      } catch {
        return erro(request.method === 'POST' ? 'pendencia_externa' : 'servico_indisponivel');
      }
    },
  };
}
