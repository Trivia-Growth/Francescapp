import { contratosRotas } from '../../../packages/contracts/src/rotas.ts';
import { uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  criarErroPublicoSemCampos,
  statusErroHttp,
  type CodigoErro,
} from '../../../packages/contracts/src/erros.ts';
import { comporConsultaAuditoriaNativa } from './compor-consulta-auditoria-nativa.ts';
import { registrarFalhaDeResposta } from './falha-operacional.ts';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
const FILTROS = [
  'limite',
  'cursor',
  'ator_id',
  'objeto_id',
  'paciente_id',
  'acao',
  'resultado',
  'instante_de',
  'instante_ate',
] as const;
type Dependencias = Parameters<typeof comporConsultaAuditoriaNativa>[2];

/** Entrada interna; não registra rota nem concede privilégios.
 *
 * O cursor trafega em claro (o id do evento), diferente de `concessoes-equipe`, que sela o seu.
 * Aqui o chamador já é administrador e o mesmo id aparece em `itens[].id` da própria resposta:
 * selar esconderia do admin algo que ele acabou de receber, sem reduzir exposição a mais ninguém. */
export function criarEntradaConsultaAuditoriaNativa(dependencias: Dependencias) {
  return {
    async atender(request: Request): Promise<Response> {
      const erro = (codigo: CodigoErro, id = crypto.randomUUID()) =>
        Response.json(criarErroPublicoSemCampos(codigo, id), {
          status: statusErroHttp[codigo],
          headers,
        });
      const url = new URL(request.url);
      if (url.pathname !== '/api/admin/auditoria' || request.method !== 'GET' || url.hash)
        return erro('nao_encontrado');
      if (!uuidSchema.safeParse(request.headers.get('x-sessao')).success)
        return erro('nao_autenticado');
      const consulta: Record<string, unknown> = {};
      for (const [chave, valor] of url.searchParams) {
        if (!(FILTROS as readonly string[]).includes(chave) || Object.hasOwn(consulta, chave))
          return erro('entrada_invalida');
        consulta[chave] = chave === 'limite' && /^\d{1,3}$/.test(valor) ? Number(valor) : valor;
      }
      const validada = contratosRotas.consultarAuditoria.entrada.safeParse(consulta);
      if (!validada.success) return erro('entrada_invalida');
      try {
        const pedido = new Request(request.url, {
          method: 'GET',
          headers: request.headers,
          signal: request.signal,
        });
        const resultado = await comporConsultaAuditoriaNativa(pedido, validada.data, dependencias);
        if (!resultado.ok) return erro(resultado.erro.codigo, resultado.request_id);
        const dados = contratosRotas.consultarAuditoria.saida.parse(resultado.dados);
        return Response.json({ dados, request_id: resultado.request_id }, { headers });
      } catch (erroResposta) {
        return erro(
          'servico_indisponivel',
          registrarFalhaDeResposta('consulta-auditoria', erroResposta),
        );
      }
    },
  };
}
