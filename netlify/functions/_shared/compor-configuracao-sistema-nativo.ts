import type { Pool } from 'pg';
import { sessaoNativaSchema } from '../../../packages/contracts/src/identidade.ts';
import type { FonteDeConfiguracao } from '../../../supabase/functions/_shared/configuracao.ts';
import type { ReferenciasCifraCofre } from '../../../supabase/functions/_shared/cofre-vault.ts';
import { causaDaFalha, registrarFalhaOperacional } from './falha-operacional.ts';
import { criarIdempotenciaNativa } from './idempotencia-nativa.ts';
import { operarConfiguracaoSistemaNativo } from './configuracao-sistema-nativo.ts';
import { credencialAuthRejeitada, criarContextoAuthNativo } from './auth-nativo/cliente.ts';
import { carregarCofreNativo } from './cofre-nativo.ts';
import { metadadosAtestadoNativo } from './compor-pacientes-nativo.ts';
import { executarConfiguracaoSistemaNativo } from './executor-configuracao-sistema-nativo.ts';

type Comando = Parameters<typeof operarConfiguracaoSistemaNativo>[1];
type Resultado = Awaited<ReturnType<typeof operarConfiguracaoSistemaNativo>>;

/** Composição server-only, sem rota pública ou concessão de privilégio à RPC.
 * Administrador-only: espelha a autorização da própria SQL (defesa em profundidade,
 * não substitui a checagem no banco). */
export async function comporConfiguracaoSistemaNativo(
  request: Request,
  comando: Comando,
  dependencias: {
    fonte: FonteDeConfiguracao;
    pool: Pool;
    referencias: ReferenciasCifraCofre;
    keyIdAtestado: string;
  },
): Promise<Resultado> {
  const controle = new AbortController();
  const cancelar = () => controle.abort();
  if (request.signal.aborted) cancelar();
  else request.signal.addEventListener('abort', cancelar, { once: true });
  const temporizador = setTimeout(cancelar, 15_000);
  // Um identificador por requisição: a linha do log e a resposta carregam o mesmo, senão
  // não há como ligar o que a pessoa viu ao que o servidor registrou.
  const requestIdFalha = crypto.randomUUID();
  let etapa: 'autorizacao' | 'cofre' | 'operacao' = 'autorizacao';
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
    const pedido = new Request(request, { signal: controle.signal });
    const contexto = criarContextoAuthNativo(pedido, dependencias.fonte);
    if (comando.operacao === 'gravar' && request.headers.get('origin') !== contexto.origem)
      return {
        ok: false,
        erro: { codigo: 'entrada_invalida' as const },
        request_id: crypto.randomUUID(),
      };
    const autorizar = async () => {
      const alvo = request.headers.get('x-sessao');
      if (!alvo) return { estado: 'nao_autenticado' as const };
      const usuario = await contexto.cliente.auth.getUser();
      verificarCancelamento();
      if (contexto.cookiesAlterados) return { estado: 'nao_autenticado' as const };
      if (usuario.error) {
        if (credencialAuthRejeitada(usuario.error)) return { estado: 'nao_autenticado' as const };
        registrarFalhaOperacional({
          rota: 'configuracao-sistema',
          etapa: 'autorizacao',
          request_id: requestIdFalha,
          causa: causaDaFalha(usuario.error),
        });
        return { estado: 'servico_indisponivel' as const };
      }
      if (!usuario.data.user) return { estado: 'nao_autenticado' as const };
      const resultado = await contexto.cliente.schema('api').rpc('consultar_sessao_nativa', {
        p_request_id: crypto.randomUUID(),
      });
      verificarCancelamento();
      if (contexto.cookiesAlterados) return { estado: 'nao_autenticado' as const };
      if (resultado.error) {
        registrarFalhaOperacional({
          rota: 'configuracao-sistema',
          etapa: 'autorizacao',
          request_id: requestIdFalha,
          causa: causaDaFalha(resultado.error),
        });
        return { estado: 'servico_indisponivel' as const };
      }
      const sessao = sessaoNativaSchema.safeParse(resultado.data);
      if (
        !sessao.success ||
        !sessao.data.usuario.ativo ||
        sessao.data.usuario.id !== usuario.data.user.id ||
        sessao.data.session_id.toLowerCase() !== alvo.toLowerCase()
      )
        return { estado: 'nao_autenticado' as const };
      if (sessao.data.usuario.perfil !== 'administrador')
        return { estado: 'sem_permissao' as const };
      return {
        estado: 'autorizado' as const,
        identidade: { usuario_id: sessao.data.usuario.id, session_id: sessao.data.session_id },
      };
    };
    const inicial = await noPrazo(autorizar);
    if (inicial.estado !== 'autorizado')
      return { ok: false, erro: { codigo: inicial.estado }, request_id: requestIdFalha };
    etapa = 'cofre';
    const cofre = await noPrazo(() =>
      carregarCofreNativo(
        dependencias.pool,
        dependencias.referencias,
        dependencias.keyIdAtestado,
        controle.signal,
      ),
    );
    etapa = 'operacao';
    return await noPrazo(() =>
      operarConfiguracaoSistemaNativo(pedido, comando, {
        autorizar: async () => inicial,
        revalidar: autorizar,
        metadados: (requestId) =>
          metadadosAtestadoNativo(dependencias.keyIdAtestado, requestId, Date.now()),
        idempotencia: criarIdempotenciaNativa(cofre.cifra),
        atestador: cofre.atestador,
        executar: (_request, transporte) => {
          verificarCancelamento();
          mutacaoIniciada = comando.operacao === 'gravar';
          return executarConfiguracaoSistemaNativo(contexto.cliente, transporte);
        },
      }),
    );
  } catch (erro) {
    registrarFalhaOperacional({
      rota: 'configuracao-sistema',
      etapa,
      request_id: requestIdFalha,
      causa: causaDaFalha(erro),
    });
    return {
      ok: false,
      erro: { codigo: mutacaoIniciada ? 'pendencia_externa' : 'servico_indisponivel' },
      request_id: requestIdFalha,
    };
  } finally {
    clearTimeout(temporizador);
    request.signal.removeEventListener('abort', cancelar);
  }
}
