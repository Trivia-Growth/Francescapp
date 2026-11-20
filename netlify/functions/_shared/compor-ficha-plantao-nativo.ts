import type { Pool } from 'pg';
import { sessaoNativaSchema } from '../../../packages/contracts/src/identidade.ts';
import type { FonteDeConfiguracao } from '../../../supabase/functions/_shared/configuracao.ts';
import type { ReferenciasCifraCofre } from '../../../supabase/functions/_shared/cofre-vault.ts';
import { criarIdempotenciaNativa } from './idempotencia-nativa.ts';
import { operarFichaPlantaoNativa } from './ficha-plantao-nativa.ts';
import { credencialAuthRejeitada, criarContextoAuthNativo } from './auth-nativo/cliente.ts';
import { carregarCofreNativo } from './cofre-nativo.ts';
import { metadadosAtestadoNativo } from './compor-pacientes-nativo.ts';
import { executarFichaPlantaoNativo } from './executor-ficha-plantao-nativo.ts';

type Comando = Parameters<typeof operarFichaPlantaoNativa>[1];
type Resultado = Awaited<ReturnType<typeof operarFichaPlantaoNativa>>;

/** FR-073 a FR-077, FR-081. Composição server-only, sem concessão de privilégio à RPC. A
 * checagem de perfil aqui é defesa em profundidade e espelha a da própria SQL: ela não
 * substitui a autorização do banco, que confere vínculo vivo no caso, turno aberto do
 * próprio profissional e gate administrado a cada escrita. Família não escreve nem lê a
 * ficha por este caminho — a audiência familiar continua sendo a de FR-062. */
export async function comporFichaPlantaoNativo(
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
  const mutacao =
    comando.operacao === 'submeter' ||
    comando.operacao === 'resolver' ||
    comando.operacao === 'rascunho_salvar';
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
    if (mutacao && request.headers.get('origin') !== contexto.origem)
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
      // Espelha a SQL: quem escreve a ficha é o profissional do plantão; o Administrador
      // apenas consulta. Perfil familiar não alcança este caminho em hipótese nenhuma.
      if (
        comando.operacao === 'consultar'
          ? !['administrador', 'profissional'].includes(sessao.data.usuario.perfil)
          : sessao.data.usuario.perfil !== 'profissional'
      )
        return { estado: 'sem_permissao' as const };
      return {
        estado: 'autorizado' as const,
        identidade: { usuario_id: sessao.data.usuario.id, session_id: sessao.data.session_id },
      };
    };
    const inicial = await noPrazo(autorizar);
    if (inicial.estado !== 'autorizado')
      return { ok: false, erro: { codigo: inicial.estado }, request_id: crypto.randomUUID() };
    const cofre = await noPrazo(() =>
      carregarCofreNativo(
        dependencias.pool,
        dependencias.referencias,
        dependencias.keyIdAtestado,
        controle.signal,
      ),
    );
    return await noPrazo(() =>
      operarFichaPlantaoNativa(pedido, comando, {
        autorizar: async () => inicial,
        revalidar: autorizar,
        metadados: (requestId) =>
          metadadosAtestadoNativo(dependencias.keyIdAtestado, requestId, Date.now()),
        cifra: cofre.cifra,
        idempotencia: criarIdempotenciaNativa(cofre.cifra),
        atestador: cofre.atestador,
        executar: (_request, transporte) => {
          verificarCancelamento();
          mutacaoIniciada = mutacao;
          return executarFichaPlantaoNativo(contexto.cliente, transporte);
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
