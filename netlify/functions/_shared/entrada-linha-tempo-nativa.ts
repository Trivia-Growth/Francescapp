import { uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  criarErroPublicoSemCampos,
  statusErroHttp,
  type CodigoErro,
} from '../../../packages/contracts/src/erros.ts';
import { consultarLinhaTempoSchema } from '../../../packages/contracts/src/linha-tempo.ts';
import { linhaTempoHttp } from '../../../packages/contracts/src/linha-tempo-http.ts';
import { comporLinhaTempoNativa } from './compor-linha-tempo-nativa.ts';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
type Dependencias = Parameters<typeof comporLinhaTempoNativa>[2];

/** Parâmetros aceitos na query. Chave desconhecida é entrada inválida, não ignorada em
 * silêncio: filtro que a aplicação não entende não pode virar "lista sem filtro". */
const PARAMETROS = [
  'de',
  'ate',
  'fontes',
  'areas',
  'autor_usuario_id',
  'objetivo_id',
  'cursor_em',
  'cursor_id',
  'limite',
];

/** Entrada interna da linha do tempo do caso; não registra rota nem concede privilégios. */
export function criarEntradaLinhaTempoNativa(dependencias: Dependencias) {
  return {
    async atender(request: Request): Promise<Response> {
      const erro = (codigo: CodigoErro, id = crypto.randomUUID()) =>
        Response.json(criarErroPublicoSemCampos(codigo, id), {
          status: statusErroHttp[codigo],
          headers,
        });
      const url = new URL(request.url);
      const caminho = /^\/api\/pacientes\/([^/]+)\/linha-tempo$/.exec(url.pathname);
      if (!caminho || request.method !== 'GET') return erro('nao_encontrado');
      const paciente = uuidSchema.safeParse(caminho[1]);
      if (!paciente.success || url.hash) return erro('entrada_invalida');
      const bruto: Record<string, unknown> = {};
      for (const [chave, valor] of url.searchParams) {
        if (!PARAMETROS.includes(chave) || chave in bruto) return erro('entrada_invalida');
        if (chave === 'fontes' || chave === 'areas') bruto[chave] = valor.split(',');
        else if (chave === 'limite') {
          if (!/^[1-9][0-9]{0,2}$/.test(valor)) return erro('entrada_invalida');
          bruto[chave] = Number(valor);
        } else bruto[chave] = valor;
      }
      const filtros = consultarLinhaTempoSchema.safeParse(bruto);
      if (!filtros.success) return erro('entrada_invalida');
      if (!uuidSchema.safeParse(request.headers.get('x-sessao')).success)
        return erro('nao_autenticado');
      try {
        const pedido = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          signal: request.signal,
        });
        const resultado = await comporLinhaTempoNativa(
          pedido,
          { operacao: 'ler', paciente_id: paciente.data, filtros: filtros.data },
          dependencias,
        );
        if (!resultado.ok) return erro(resultado.erro.codigo, resultado.request_id);
        const dados = linhaTempoHttp.consultar.saida.parse(resultado.dados);
        return Response.json({ dados, request_id: resultado.request_id }, { headers });
      } catch {
        return erro('servico_indisponivel');
      }
    },
  };
}
