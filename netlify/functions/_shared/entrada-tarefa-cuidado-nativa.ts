import { uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  codigosErro,
  criarErroPublicoSemCampos,
  statusErroHttp,
  type CodigoErro,
} from '../../../packages/contracts/src/erros.ts';
import { comporTarefaCuidadoNativo } from './compor-tarefa-cuidado-nativo.ts';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
type Dependencias = Parameters<typeof comporTarefaCuidadoNativo>[2];

/** Leitura isolada; escrita depende de contrato de idempotência e revisão. */
export function criarEntradaTarefaCuidadoNativa(dependencias: Dependencias) {
  return {
    async atender(request: Request): Promise<Response> {
      const erro = (codigo: CodigoErro, id = crypto.randomUUID()) =>
        Response.json(criarErroPublicoSemCampos(codigo, id), {
          status: statusErroHttp[codigo],
          headers,
        });
      const url = new URL(request.url);
      const caminho = /^\/api\/pacientes\/([^/]+)\/tarefas$/.exec(url.pathname);
      if (!caminho || request.method !== 'GET') return erro('nao_encontrado');
      const paciente = uuidSchema.safeParse(caminho[1]);
      if (!paciente.success || url.search || url.hash) return erro('entrada_invalida');
      if (!uuidSchema.safeParse(request.headers.get('x-sessao')).success)
        return erro('nao_autenticado');
      try {
        const resultado = await comporTarefaCuidadoNativo(
          request,
          { operacao: 'ler', paciente_id: paciente.data },
          dependencias,
        );
        if (!resultado.ok) {
          const codigo = codigosErro.find((item) => item === resultado.erro.codigo);
          return erro(codigo ?? 'servico_indisponivel', resultado.request_id);
        }
        if (!Array.isArray(resultado.dados)) return erro('servico_indisponivel');
        return Response.json(
          { dados: resultado.dados, request_id: resultado.request_id },
          { headers },
        );
      } catch {
        return erro('servico_indisponivel');
      }
    },
  };
}
