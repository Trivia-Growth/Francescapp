import {
  contratosRotas,
  criarErroPublico,
  statusErroHttp,
  uuidSchema,
  type CodigoErro,
} from '@ffcmapp/contratos';
import { consultarReconciliacaoExperimental } from './reconciliacao-experimental.ts';
import type { criarCursorReconciliacao } from './cursor-reconciliacao.ts';

type Identidade = Readonly<{ usuario_id: string; session_id: string }>;
type Autorizacao =
  | { estado: 'nao_autenticado' | 'sem_permissao' }
  | { estado: 'autorizado'; identidade: Identidade };
type Consulta = Parameters<
  Parameters<typeof consultarReconciliacaoExperimental>[1]['consultar']
>[0];

/** Apenas experimento; não exportado nem ligado ao Netlify. Antes de integração:
 * S-02, verificação real de JWT/autoridade no banco, auditoria, cursor opaco e
 * não registrar query na infraestrutura. Esta porta não comprova esses controles. */
export function criarHandlerReconciliacaoExperimental(portas: {
  autorizar(request: Request): Promise<Autorizacao>;
  consultar(identidade: Identidade, consulta: Consulta): Promise<unknown>;
  cursores: ReturnType<typeof criarCursorReconciliacao>;
}) {
  const autorizar = portas.autorizar.bind(portas);
  const consultar = portas.consultar.bind(portas);
  const abrir = portas.cursores.abrir.bind(portas.cursores);
  const emitir = portas.cursores.emitir.bind(portas.cursores);
  return async (request: Request): Promise<Response> => {
    const requestId = crypto.randomUUID();
    const responder = (corpo: unknown, status: number) =>
      Response.json(corpo, {
        status,
        headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
      });
    const falha = (codigo: CodigoErro) =>
      responder(criarErroPublico(codigo, requestId), statusErroHttp[codigo]);
    try {
      const url = new URL(request.url);
      if (
        request.method !== 'GET' ||
        url.pathname !== contratosRotas.consultarOperacoesCadastro.caminho
      )
        return falha('entrada_invalida');
      const consulta: Record<string, unknown> = {};
      for (const [chave, valor] of url.searchParams) {
        if ((chave !== 'cursor' && chave !== 'limite') || Object.hasOwn(consulta, chave))
          return falha('entrada_invalida');
        consulta[chave] = chave === 'limite' && /^\d{1,3}$/.test(valor) ? Number(valor) : valor;
      }
      const validada = contratosRotas.consultarOperacoesCadastro.entrada.safeParse(consulta);
      if (!validada.success) return falha('entrada_invalida');
      const primeira = await autorizar(request);
      if (primeira.estado !== 'autorizado') return falha(primeira.estado);
      const identidade = Object.freeze({
        usuario_id: uuidSchema.parse(primeira.identidade.usuario_id).toLowerCase(),
        session_id: uuidSchema.parse(primeira.identidade.session_id).toLowerCase(),
      });
      const vinculo = { usuarioId: identidade.usuario_id, sessaoId: identidade.session_id };
      let cursor: string | undefined;
      if (validada.data.cursor !== undefined) {
        try {
          cursor = await abrir(validada.data.cursor, vinculo);
        } catch {
          return falha('entrada_invalida');
        }
      }
      const resultado = await consultarReconciliacaoExperimental(
        { ...validada.data, ...(cursor === undefined ? {} : { cursor }) },
        { consultar: (entrada) => consultar(identidade, entrada) },
        requestId,
      );
      if (!resultado.ok) return falha(resultado.erro.codigo);
      const proximo_cursor =
        resultado.dados.proximo_cursor === null
          ? null
          : await emitir(resultado.dados.proximo_cursor, vinculo);
      const segunda = await autorizar(request);
      if (segunda.estado !== 'autorizado') return falha(segunda.estado);
      if (
        uuidSchema.parse(segunda.identidade.usuario_id).toLowerCase() !== identidade.usuario_id ||
        uuidSchema.parse(segunda.identidade.session_id).toLowerCase() !== identidade.session_id
      )
        return falha('nao_autenticado');
      return responder(
        { dados: { ...resultado.dados, proximo_cursor }, request_id: requestId },
        200,
      );
    } catch {
      return falha('servico_indisponivel');
    }
  };
}
