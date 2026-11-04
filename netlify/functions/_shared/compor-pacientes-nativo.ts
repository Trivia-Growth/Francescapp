import type { Pool } from 'pg';
import {
  criarErroPublicoSemCampos,
  statusErroHttp,
} from '../../../packages/contracts/src/erros.ts';
import { sessaoNativaSchema } from '../../../packages/contracts/src/identidade.ts';
import type { FonteDeConfiguracao } from '../../../supabase/functions/_shared/configuracao.ts';
import type { ReferenciasCifraCofre } from '../../../supabase/functions/_shared/cofre-vault.ts';
import { credencialAuthRejeitada, criarContextoAuthNativo } from './auth-nativo/cliente.ts';
import { processarBarreiraNativa } from './barreira-handler-nativo.ts';
import { criarPacienteNativo } from './cadastro-handler-nativo.ts';
import { consultarCarteiraNativa } from './carteira-handler-nativo.ts';
import { consultarCarteiraFamiliar } from './carteira-familiar-handler.ts';
import { consultarPacienteFamiliar } from './paciente-familiar-handler.ts';
import { carregarCofreNativo } from './cofre-nativo.ts';
import { executarBarreiraNativa } from './executor-barreira-nativo.ts';
import { executarCarteiraNativa } from './executor-carteira-nativo.ts';
import { executarPacienteNativo } from './executor-paciente-nativo.ts';
import { criarIdempotenciaNativa } from './idempotencia-nativa.ts';

type OperacaoBarreira = Parameters<typeof processarBarreiraNativa>[1];

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
export async function comporPacientesNativo(
  request: Request,
  rota: 'cadastro' | 'carteira' | 'carteira-familiar' | 'paciente-familiar' | OperacaoBarreira,
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
      const resultado = await contexto.cliente
        .schema('api')
        .rpc(
          rota === 'carteira-familiar' || rota === 'paciente-familiar'
            ? 'consultar_sessao_familiar_privada'
            : 'consultar_sessao_nativa',
          {
            p_request_id: crypto.randomUUID(),
          },
        );
      verificarCancelamento();
      if (contexto.cookiesAlterados) return { estado: 'nao_autenticado' as const };
      if (resultado.error) return { estado: 'servico_indisponivel' as const };
      const sessao = sessaoNativaSchema.safeParse(resultado.data);
      if (
        !sessao.success ||
        !sessao.data.usuario.ativo ||
        ((rota === 'carteira-familiar' || rota === 'paciente-familiar') &&
          sessao.data.usuario.perfil !== 'familia') ||
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
    if (rota === 'paciente-familiar')
      return await noPrazo(() =>
        consultarPacienteFamiliar(pedidoHandler, {
          autorizar,
          cifra: cofre.cifra,
          consultar: async (entrada) => {
            verificarCancelamento();
            const resultado = await contexto.cliente
              .schema('api')
              .rpc('consultar_paciente_familiar_privado', {
                p_request_id: entrada.request_id,
                p_paciente_id: entrada.paciente_id,
              });
            if (resultado.error || contexto.cookiesAlterados) throw new Error();
            return resultado.data;
          },
        }),
      );
    if (rota === 'carteira-familiar')
      return await noPrazo(() =>
        consultarCarteiraFamiliar(pedidoHandler, {
          autorizar,
          cifra: cofre.cifra,
          cursor: cofre.cursor,
          consultar: async (entrada) => {
            verificarCancelamento();
            const resultado = await contexto.cliente
              .schema('api')
              .rpc('listar_pacientes_familiar_privado', {
                p_request_id: entrada.request_id,
                p_limite: entrada.limite,
                p_cursor: entrada.cursor ?? null,
              });
            if (resultado.error || contexto.cookiesAlterados) throw new Error();
            return resultado.data;
          },
        }),
      );
    if (rota === 'cadastro')
      return await noPrazo(() =>
        criarPacienteNativo(pedidoHandler, {
          ...comum,
          cifra: cofre.cifra,
          idempotencia: criarIdempotenciaNativa(cofre.cifra),
          executar: (_request, transporte) => {
            verificarCancelamento();
            mutacaoIniciada = true;
            return executarPacienteNativo(contexto.cliente, transporte);
          },
        }),
      );
    if (rota === 'carteira')
      return await noPrazo(() =>
        consultarCarteiraNativa(pedidoHandler, {
          ...comum,
          cifra: cofre.cifra,
          cursor: cofre.cursor,
          executar: (_request, entrada) => {
            verificarCancelamento();
            return executarCarteiraNativa(contexto.cliente, entrada);
          },
        }),
      );
    return await noPrazo(() =>
      processarBarreiraNativa(pedidoHandler, rota, {
        ...comum,
        validarOrigem: async () => request.headers.get('origin') === contexto.origem,
        executar: (_request, transporte) => {
          verificarCancelamento();
          mutacaoIniciada = rota !== 'consultar';
          return executarBarreiraNativa(contexto.cliente, transporte);
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
