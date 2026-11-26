import type { Pool } from 'pg';
import { sessaoNativaSchema } from '../../../packages/contracts/src/identidade.ts';
import type { FonteDeConfiguracao } from '../../../supabase/functions/_shared/configuracao.ts';
import type { ReferenciasCifraCofre } from '../../../supabase/functions/_shared/cofre-vault.ts';
import { criarIdempotenciaNativa } from './idempotencia-nativa.ts';
import { operarPreautorizacaoFamiliarNativa } from './preautorizacao-familiar-nativa.ts';
import { credencialAuthRejeitada, criarContextoAuthNativo } from './auth-nativo/cliente.ts';
import { carregarCofreNativo } from './cofre-nativo.ts';
import { metadadosAtestadoNativo } from './compor-pacientes-nativo.ts';

/** O motivo chega em texto e é cifrado aqui, no servidor, com a AAD do registro de
 * acesso — o navegador nunca monta envelope. */
type Comando =
  | { operacao: 'listar'; paciente_id: string }
  | { operacao: 'cancelar'; convite_id: string; acesso_id: string; motivo: string };
type Resultado = Awaited<ReturnType<typeof operarPreautorizacaoFamiliarNativa>>;

/** Composição server-only. Administrador-only aqui é defesa em profundidade: a
 * autorização que vale é a do banco, conferida dentro das próprias RPCs. */
export async function comporPreautorizacaoFamiliarNativo(
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
    if (comando.operacao === 'cancelar' && request.headers.get('origin') !== contexto.origem)
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
      if (sessao.data.usuario.perfil !== 'administrador')
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
    const operacao =
      comando.operacao === 'listar'
        ? comando
        : {
            operacao: 'cancelar' as const,
            convite_id: comando.convite_id,
            motivo_cifrado: await noPrazo(() =>
              cofre.cifra.cifrar(comando.motivo, {
                tabela: 'cadastro.acesso_paciente',
                registro_id: comando.acesso_id,
                campo: 'motivo_revogacao',
                formato: 1,
              }),
            ),
          };
    return await noPrazo(() =>
      operarPreautorizacaoFamiliarNativa(pedido, operacao, {
        autorizar: async () => inicial,
        revalidar: autorizar,
        metadados: (requestId) =>
          metadadosAtestadoNativo(dependencias.keyIdAtestado, requestId, Date.now()),
        idempotencia: criarIdempotenciaNativa(cofre.cifra),
        atestador: cofre.atestador,
        listar: async (_request, entrada) => {
          verificarCancelamento();
          const resultado = await contexto.cliente
            .schema('api')
            .rpc('listar_preautorizacoes_familiares_privado', entrada);
          if (resultado.error) throw new Error();
          return resultado.data;
        },
        cancelar: async (_request, transporte) => {
          verificarCancelamento();
          mutacaoIniciada = true;
          const resultado = await contexto.cliente
            .schema('api')
            .rpc('cancelar_preautorizacao_familiar_privado', transporte);
          if (resultado.error) throw new Error();
          return resultado.data;
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
