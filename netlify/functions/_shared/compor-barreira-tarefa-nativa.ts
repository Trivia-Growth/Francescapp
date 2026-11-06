import type { Pool } from 'pg';
import {
  criarErroPublicoSemCampos,
  statusErroHttp,
} from '../../../packages/contracts/src/erros.ts';
import { sessaoNativaSchema } from '../../../packages/contracts/src/identidade.ts';
import type { FonteDeConfiguracao } from '../../../supabase/functions/_shared/configuracao.ts';
import type { ReferenciasCifraCofre } from '../../../supabase/functions/_shared/cofre-vault.ts';
import { credencialAuthRejeitada, criarContextoAuthNativo } from './auth-nativo/cliente.ts';
import { processarBarreiraTarefaNativa } from './barreira-tarefa-handler-nativo.ts';
import { carregarCofreNativo } from './cofre-nativo.ts';

type OperacaoBarreira = Parameters<typeof processarBarreiraTarefaNativa>[1];

export function metadadosAtestadoNativo(keyId: string, requestId: string, agora: number) {
  return {
    key_id: keyId,
    emitido_em: new Date(agora).toISOString(),
    expira_em: new Date(agora + 30_000).toISOString(),
    request_id: requestId,
  };
}

/** Composição interna não publicada: S-02 e provas transacionais continuam pendentes.
 * Pool e referências do Vault são dependências server-only. */
export async function comporBarreiraTarefaNativa(
  request: Request,
  rota: OperacaoBarreira,
  dependencias: {
    fonte: FonteDeConfiguracao;
    pool: Pool;
    referencias: ReferenciasCifraCofre;
    keyIdAtestado: string;
  },
): Promise<Response> {
  const controle = new AbortController();
  const cancelar = () => controle.abort();
  if (request.signal.aborted) cancelar();
  else request.signal.addEventListener('abort', cancelar, { once: true });
  const temporizador = setTimeout(cancelar, 15_000);
  let mutacaoIniciada = false;
  const verificarCancelamento = () => {
    if (controle.signal.aborted) throw new Error('Pedido cancelado.');
  };
  const noPrazo = async <T>(operacao: () => Promise<T>): Promise<T> => {
    verificarCancelamento();
    let abortar!: () => void;
    const cancelamento = new Promise<never>((_, rejeitar) => {
      abortar = () => rejeitar(new Error('Pedido cancelado.'));
      controle.signal.addEventListener('abort', abortar, { once: true });
    });
    try {
      const resultado = await Promise.race([operacao(), cancelamento]);
      verificarCancelamento();
      return resultado;
    } finally {
      controle.signal.removeEventListener('abort', abortar);
    }
  };
  try {
    verificarCancelamento();
    const pedidoContexto = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      signal: controle.signal,
    });
    const contexto = criarContextoAuthNativo(pedidoContexto, dependencias.fonte);
    const autorizar = async () => {
      const alvo = request.headers.get('x-sessao');
      if (!alvo) return { estado: 'entrada_invalida' as const };
      if (request.method !== 'GET' && request.headers.get('origin') !== contexto.origem)
        return { estado: 'entrada_invalida' as const };
      const usuario = await contexto.cliente.auth.getUser();
      verificarCancelamento();
      if (contexto.cookiesAlterados) return { estado: 'nao_autenticado' as const };
      if (usuario.error)
        return {
          estado: credencialAuthRejeitada(usuario.error)
            ? ('nao_autenticado' as const)
            : ('servico_indisponivel' as const),
        };
      if (!usuario.data.user) return { estado: 'nao_autenticado' as const };
      const resultado = await contexto.cliente.schema('api').rpc('consultar_sessao_nativa', {
        p_request_id: crypto.randomUUID(),
      });
      verificarCancelamento();
      if (contexto.cookiesAlterados) return { estado: 'nao_autenticado' as const };
      if (resultado.error) return { estado: 'servico_indisponivel' as const };
      const sessao = sessaoNativaSchema.safeParse(resultado.data);
      if (
        !sessao.success ||
        !sessao.data.usuario.ativo ||
        sessao.data.usuario.id !== usuario.data.user.id ||
        sessao.data.session_id.toLowerCase() !== alvo.toLowerCase()
      )
        return { estado: 'nao_autenticado' as const };
      return {
        estado: 'autorizado' as const,
        identidade: { usuario_id: sessao.data.usuario.id, session_id: sessao.data.session_id },
      };
    };
    const inicial = await noPrazo(autorizar);
    if (inicial.estado !== 'autorizado')
      return Response.json(criarErroPublicoSemCampos(inicial.estado, crypto.randomUUID()), {
        status: statusErroHttp[inicial.estado],
        headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
      });
    const cofre = await noPrazo(() =>
      carregarCofreNativo(
        dependencias.pool,
        dependencias.referencias,
        dependencias.keyIdAtestado,
        controle.signal,
      ),
    );
    const pedidoHandler = new Request(request, { signal: controle.signal });
    const metadados = (requestId: string) =>
      metadadosAtestadoNativo(dependencias.keyIdAtestado, requestId, Date.now());
    const comum = {
      autorizar: async () => inicial,
      revalidar: autorizar,
      metadados,
      atestador: cofre.atestador,
    };
    return await noPrazo(() =>
      processarBarreiraTarefaNativa(pedidoHandler, rota, {
        ...comum,
        validarOrigem: async () => request.headers.get('origin') === contexto.origem,
        executar: async (_request, transporte) => {
          verificarCancelamento();
          mutacaoIniciada = rota !== 'consultar';
          const resultado = await contexto.cliente
            .schema('api')
            .rpc('tarefa_barreira_composicao', transporte);
          if (resultado.error) throw new Error();
          return resultado.data;
        },
      }),
    );
  } catch {
    const codigo = mutacaoIniciada ? 'pendencia_externa' : 'servico_indisponivel';
    return Response.json(criarErroPublicoSemCampos(codigo, crypto.randomUUID()), {
      status: statusErroHttp[codigo],
      headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  } finally {
    clearTimeout(temporizador);
    request.signal.removeEventListener('abort', cancelar);
  }
}
