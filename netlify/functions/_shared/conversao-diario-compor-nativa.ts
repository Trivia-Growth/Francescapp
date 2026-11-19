import { listaConfigurada } from './configuracao-servidor.ts';
import type { Pool } from 'pg';
import { sessaoNativaSchema } from '../../../packages/contracts/src/identidade.ts';
import type { FonteDeConfiguracao } from '../../../supabase/functions/_shared/configuracao.ts';
import type { ReferenciasCifraCofre } from '../../../supabase/functions/_shared/cofre-vault.ts';
import { operarConversaoDiarioNativa } from './conversao-diario-nativa.ts';
import { credencialAuthRejeitada, criarContextoAuthNativo } from './auth-nativo/cliente.ts';
import { carregarCofreNativo } from './cofre-nativo.ts';
import { metadadosAtestadoNativo } from './compor-pacientes-nativo.ts';
import { executarConversaoDiarioNativa } from './conversao-diario-executor-nativo.ts';
import { criarIdempotenciaNativa } from './idempotencia-nativa.ts';

type Comando = Parameters<typeof operarConversaoDiarioNativa>[1];
type Resultado = Awaited<ReturnType<typeof operarConversaoDiarioNativa>>;

/** Composição server-only, sem rota pública ou concessão de privilégio à RPC. */
export async function comporConversaoDiarioNativa(
  request: Request,
  comando: Comando,
  dependencias: {
    fonte: FonteDeConfiguracao;
    pool: Pool;
    referencias: ReferenciasCifraCofre;
    keyIdAtestado: string;
  },
): Promise<Resultado> {
  const requestIdNegacao = crypto.randomUUID();
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
    // O corpo já pode ter sido lido pelo handler; a composição usa apenas os
    // cabeçalhos e a URL para autenticação e autorização.
    const pedido = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      signal: controle.signal,
    });
    const contexto = criarContextoAuthNativo(pedido, dependencias.fonte);
    const registrarNegacao = async () => {
      const acoes = {
        converter: 'api.converter_diario_tarefa',
        consultar: 'api.consultar_conversao_diario_tarefa',
      } as const;
      const parametros = {
        p_request_id: requestIdNegacao,
        p_acao: acoes[comando.operacao],
        p_paciente_id: comando.paciente_id,
        p_origem_id: comando.origem_id,
      };
      const negacao = await contexto.cliente
        .schema('api')
        .rpc('registrar_negacao_conversao_diario_tarefa', parametros);
      verificarCancelamento();
      return negacao.error || negacao.data !== true
        ? { estado: 'servico_indisponivel' as const }
        : { estado: 'sem_permissao' as const };
    };
    const autorizar = async () => {
      const alvo = request.headers.get('x-sessao');
      if (
        !alvo ||
        (comando.operacao !== 'consultar' && request.headers.get('origin') !== contexto.origem)
      )
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
      // Sessão Auth válida sem admissão no produto também recebe negativa própria auditada.
      if (resultado.data === null) return registrarNegacao();
      const sessao = sessaoNativaSchema.safeParse(resultado.data);
      if (
        !sessao.success ||
        !sessao.data.usuario.ativo ||
        sessao.data.usuario.id !== usuario.data.user.id ||
        sessao.data.session_id.toLowerCase() !== alvo.toLowerCase()
      )
        return { estado: 'nao_autenticado' as const };
      // Recusa auditada antes do Vault; esta RPC só registra resultado negado.
      // Método aprovado pertence à admissão SQL vigente; provider não representa
      // autorização e pode manter identidade Google em uma sessão por password.
      if (sessao.data.usuario.perfil !== 'profissional') return registrarNegacao();
      return {
        estado: 'autorizado' as const,
        identidade: { usuario_id: sessao.data.usuario.id, session_id: sessao.data.session_id },
      };
    };
    const inicial = await noPrazo(autorizar);
    if (inicial.estado !== 'autorizado')
      return { ok: false, erro: { codigo: inicial.estado }, request_id: requestIdNegacao };
    const areas =
      comando.operacao === 'converter'
        ? await noPrazo(() => listaConfigurada(dependencias.pool, 'ffcm.diario.areas_sintese', []))
        : [];
    if (comando.operacao === 'converter' && !areas.includes(comando.entrada.area))
      return { ok: false, erro: { codigo: 'entrada_invalida' }, request_id: requestIdNegacao };
    const cofre = await noPrazo(() =>
      carregarCofreNativo(
        dependencias.pool,
        dependencias.referencias,
        dependencias.keyIdAtestado,
        controle.signal,
      ),
    );
    return await noPrazo(() =>
      operarConversaoDiarioNativa(pedido, comando, {
        areas,
        autorizar: async () => inicial,
        revalidar: autorizar,
        metadados: (requestId) =>
          metadadosAtestadoNativo(dependencias.keyIdAtestado, requestId, Date.now()),
        cifra: cofre.cifra,
        idempotencia: criarIdempotenciaNativa(cofre.cifra),
        atestador: cofre.atestador,
        executar: (_request, transporte) => {
          verificarCancelamento();
          mutacaoIniciada = comando.operacao !== 'consultar';
          return executarConversaoDiarioNativa(contexto.cliente, transporte);
        },
      }),
    );
  } catch {
    return {
      ok: false,
      erro: { codigo: mutacaoIniciada ? 'pendencia_externa' : 'servico_indisponivel' },
      request_id: crypto.randomUUID(),
    };
  } finally {
    clearTimeout(temporizador);
    request.signal.removeEventListener('abort', cancelar);
  }
}
