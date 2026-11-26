import type { Pool } from 'pg';
import { sessaoNativaSchema } from '../../../packages/contracts/src/identidade.ts';
import { validarContextoCuidado } from '../../../packages/contracts/src/contexto-cuidado.ts';
import { validarRedeCuidado } from '../../../packages/contracts/src/rede-cuidado.ts';
import type { FonteDeConfiguracao } from '../../../supabase/functions/_shared/configuracao.ts';
import type { ReferenciasCifraCofre } from '../../../supabase/functions/_shared/cofre-vault.ts';
import {
  operarDocumentoPacienteNativo,
  type ComandoDocumentoPaciente,
  type DefinicaoDocumentoPaciente,
} from './documento-paciente-nativo.ts';
import { credencialAuthRejeitada, criarContextoAuthNativo } from './auth-nativo/cliente.ts';
import { carregarCofreNativo } from './cofre-nativo.ts';
import { metadadosAtestadoNativo } from './compor-pacientes-nativo.ts';
import { criarIdempotenciaNativa } from './idempotencia-nativa.ts';

/** FR-005: rotina, recursos, barreiras, preferências, pontos fortes e o que o paciente
 * considera importante, com vínculo descritivo a objetivos do plano. */
export const DOCUMENTO_CONTEXTO_CUIDADO: DefinicaoDocumentoPaciente<
  ReturnType<typeof validarContextoCuidado>
> = {
  tabela: 'cadastro.contexto_cuidado_versao',
  operacaoLer: 'api.ler_contexto_cuidado',
  operacaoGravar: 'api.gravar_contexto_cuidado',
  rpc: 'contexto_cuidado_privado',
  validar: validarContextoCuidado,
};

/** FR-002: mapa de pessoas com vínculos distintos. Vínculo não soma permissão. */
export const DOCUMENTO_REDE_CUIDADO: DefinicaoDocumentoPaciente<
  ReturnType<typeof validarRedeCuidado>
> = {
  tabela: 'cadastro.rede_cuidado_versao',
  operacaoLer: 'api.ler_rede_cuidado',
  operacaoGravar: 'api.gravar_rede_cuidado',
  rpc: 'rede_cuidado_privado',
  validar: validarRedeCuidado,
};

/** Composição server-only, sem rota pública ou concessão de privilégio à RPC. */
export async function comporDocumentoPacienteNativo<T>(
  request: Request,
  definicao: DefinicaoDocumentoPaciente<T>,
  comando: ComandoDocumentoPaciente,
  dependencias: {
    fonte: FonteDeConfiguracao;
    pool: Pool;
    referencias: ReferenciasCifraCofre;
    keyIdAtestado: string;
  },
): Promise<Awaited<ReturnType<typeof operarDocumentoPacienteNativo<T>>>> {
  const controle = new AbortController();
  const cancelar = () => controle.abort();
  if (request.signal.aborted) cancelar();
  else request.signal.addEventListener('abort', cancelar, { once: true });
  const temporizador = setTimeout(cancelar, 15_000);
  let mutacaoIniciada = false;
  const verificarCancelamento = () => {
    if (controle.signal.aborted) throw new Error('Pedido cancelado.');
  };
  const noPrazo = async <R>(operacao: () => Promise<R>): Promise<R> => {
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
    const autorizar = async () => {
      const alvo = request.headers.get('x-sessao');
      if (
        !alvo ||
        (comando.operacao === 'gravar' && request.headers.get('origin') !== contexto.origem)
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
      operarDocumentoPacienteNativo(pedido, definicao, comando, {
        autorizar: async () => inicial,
        revalidar: autorizar,
        metadados: (requestId) =>
          metadadosAtestadoNativo(dependencias.keyIdAtestado, requestId, Date.now()),
        cifra: cofre.cifra,
        idempotencia: criarIdempotenciaNativa(cofre.cifra),
        atestador: cofre.atestador,
        executar: async (_request, transporte) => {
          verificarCancelamento();
          mutacaoIniciada = comando.operacao === 'gravar';
          // As duas RPC ainda não existem nos tipos gerados do Supabase: elas só
          // aparecem depois que as migrations desta fatia forem aplicadas no alvo.
          const chamar = contexto.cliente.schema('api').rpc as unknown as (
            nome: string,
            argumentos: unknown,
          ) => Promise<{ data: unknown; error: unknown }>;
          const resposta = await chamar.call(
            contexto.cliente.schema('api'),
            definicao.rpc,
            transporte,
          );
          if (resposta.error) throw new Error('Não foi possível executar o documento.');
          return resposta.data;
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
