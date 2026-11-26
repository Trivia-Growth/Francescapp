import { contratosRotas } from '../../../packages/contracts/src/rotas.ts';
import { uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  criarErroPublicoSemCampos,
  statusErroHttp,
  type CodigoErro,
} from '../../../packages/contracts/src/erros.ts';
import { comporRegrasAtendimentoNativa } from './compor-regras-atendimento-nativa.ts';
import { registrarFalhaDeResposta } from './falha-operacional.ts';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
type Dependencias = Parameters<typeof comporRegrasAtendimentoNativa>[1];

/** Entrada interna; não registra rota nem concede privilégios. Sem parâmetro: a consulta não
 * aceita filtro, então qualquer query string é entrada inválida. */
export function criarEntradaRegrasAtendimentoNativa(dependencias: Dependencias) {
  return {
    async atender(request: Request): Promise<Response> {
      const erro = (codigo: CodigoErro, id = crypto.randomUUID()) =>
        Response.json(criarErroPublicoSemCampos(codigo, id), {
          status: statusErroHttp[codigo],
          headers,
        });
      const url = new URL(request.url);
      if (
        url.pathname !== '/api/regras-atendimento' ||
        request.method !== 'GET' ||
        url.hash ||
        url.search
      )
        return erro('nao_encontrado');
      if (!uuidSchema.safeParse(request.headers.get('x-sessao')).success)
        return erro('nao_autenticado');
      try {
        const pedido = new Request(request.url, {
          method: 'GET',
          headers: request.headers,
          signal: request.signal,
        });
        const resultado = await comporRegrasAtendimentoNativa(pedido, dependencias);
        if (!resultado.ok) return erro(resultado.erro.codigo, resultado.request_id);
        const dados = contratosRotas.consultarRegrasAtendimento.saida.parse(resultado.dados);
        return Response.json({ dados, request_id: resultado.request_id }, { headers });
      } catch (erroResposta) {
        return erro(
          'servico_indisponivel',
          registrarFalhaDeResposta('regras-atendimento', erroResposta),
        );
      }
    },
  };
}
