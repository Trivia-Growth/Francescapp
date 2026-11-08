import { executarCriacaoContatoPrivado } from '../../../packages/cadastro/src/executor-contato-privado.ts';
import { sessaoNativaSchema } from '../../../packages/contracts/src/identidade.ts';
import { credencialAuthRejeitada, criarContextoAuthNativo } from './auth-nativo/cliente.ts';
import { carregarCofreNativo } from './cofre-nativo.ts';
import { metadadosAtestadoNativo } from './compor-pacientes-nativo.ts';
import { criarIdempotenciaNativa } from './idempotencia-nativa.ts';
import type { configurarDependenciasNativas } from './configurar-dependencias-nativas.ts';

export async function comporContatoNativo(
  request: Request,
  solicitacao: {
    pacienteId: string;
    corpo: unknown;
    cabecalhos: unknown;
    reservaId?: unknown;
    geracaoReserva?: unknown;
  },
  dependencias: ReturnType<typeof configurarDependenciasNativas>,
) {
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
    const pedido = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      signal: controle.signal,
    });
    const contexto = criarContextoAuthNativo(pedido, dependencias.fonte);
    const autorizar = async () => {
      const alvo = request.headers.get('x-sessao');
      if (!alvo || (request.method !== 'GET' && request.headers.get('origin') !== contexto.origem))
        return { estado: 'nao_autenticado' as const };
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
      if (
        sessao.data.usuario.perfil !== 'administrador' ||
        !sessao.data.capacidades.includes('administrar_cadastro')
      )
        return { estado: 'sem_permissao' as const };
      return {
        estado: 'autorizado' as const,
        identidade: { usuario_id: sessao.data.usuario.id, session_id: sessao.data.session_id },
      };
    };
    const inicial = await noPrazo(autorizar);
    if (inicial.estado !== 'autorizado')
      return {
        ok: false as const,
        erro: { codigo: inicial.estado },
        request_id: crypto.randomUUID(),
      };
    const cofre = await noPrazo(() =>
      carregarCofreNativo(
        dependencias.pool,
        dependencias.referencias,
        dependencias.keyIdAtestado,
        controle.signal,
      ),
    );
    const requestId = crypto.randomUUID();
    const resultado = await noPrazo(() =>
      executarCriacaoContatoPrivado(
        solicitacao,
        {
          ...metadadosAtestadoNativo(dependencias.keyIdAtestado, requestId, Date.now()),
          ...inicial.identidade,
          request_id: requestId,
        },
        {
          cifra: cofre.cifra,
          atestador: cofre.atestador,
          idempotencia: criarIdempotenciaNativa(cofre.cifra),
          rpc: {
            executar: async (transporte) => {
              verificarCancelamento();
              mutacaoIniciada = true;
              const resposta = await contexto.cliente
                .schema('api')
                .rpc('criar_contato_paciente', { p_transporte: transporte.p_entrada });
              if (resposta.error) throw new Error();
              return resposta.data;
            },
          },
        },
      ),
    );
    const atual = await noPrazo(autorizar);
    if (
      atual.estado !== 'autorizado' ||
      atual.identidade.usuario_id.toLowerCase() !== inicial.identidade.usuario_id.toLowerCase() ||
      atual.identidade.session_id.toLowerCase() !== inicial.identidade.session_id.toLowerCase()
    )
      return {
        ok: false as const,
        erro: { codigo: 'pendencia_externa' as const },
        request_id: requestId,
      };
    return resultado;
  } catch {
    return {
      ok: false as const,
      erro: {
        codigo: mutacaoIniciada
          ? ('pendencia_externa' as const)
          : ('servico_indisponivel' as const),
      },
      request_id: crypto.randomUUID(),
    };
  } finally {
    clearTimeout(temporizador);
    request.signal.removeEventListener('abort', cancelar);
  }
}
