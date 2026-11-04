import { prepararVinculoFamiliarPrivado } from '../../../packages/cadastro/src/vinculo-familiar-privado.ts';
import {
  entradaVinculoFamiliarPrivadoSchema,
  sessaoNativaSchema,
} from '../../../packages/contracts/src/identidade.ts';
import { credencialAuthRejeitada, criarContextoAuthNativo } from './auth-nativo/cliente.ts';
import { carregarCofreNativo } from './cofre-nativo.ts';
import type { configurarDependenciasNativas } from './configurar-dependencias-nativas.ts';
import { executarVinculoFamiliarNativo } from './executor-vinculo-familiar-nativo.ts';

const codigosVinculo = [
  'sem_permissao',
  'familiar_indisponivel',
  'paciente_indisponivel',
  'operacao_divergente',
  'acesso_revogado',
  'acesso_ja_existente',
] as const;

/** Preparação server-only. Não expor enquanto não houver reconciliação e provas de autorização. */
export async function comporVinculoFamiliarNativo(
  request: Request,
  entrada: unknown,
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
  const requestId = crypto.randomUUID();
  try {
    const pedido = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      signal: controle.signal,
    });
    const contexto = criarContextoAuthNativo(pedido, dependencias.fonte);
    const autorizar = async () => {
      const alvo = request.headers.get('x-sessao');
      if (!alvo || request.headers.get('origin') !== contexto.origem)
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
        p_request_id: requestId,
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
        usuarioId: sessao.data.usuario.id,
        sessionId: sessao.data.session_id,
      };
    };
    const inicial = await noPrazo(autorizar);
    if (inicial.estado !== 'autorizado')
      return { ok: false as const, erro: { codigo: inicial.estado }, request_id: requestId };
    const cofre = await noPrazo(() =>
      carregarCofreNativo(
        dependencias.pool,
        dependencias.referencias,
        dependencias.keyIdAtestado,
        controle.signal,
      ),
    );
    const dados = entradaVinculoFamiliarPrivadoSchema.omit({ request_id: true }).parse(entrada);
    const transporte = await noPrazo(() =>
      prepararVinculoFamiliarPrivado({ ...dados, request_id: requestId }, cofre.cifra),
    );
    verificarCancelamento();
    mutacaoIniciada = true;
    const resultado = await noPrazo(() =>
      executarVinculoFamiliarNativo(contexto.cliente, transporte),
    );
    const atual = await noPrazo(autorizar);
    if (
      atual.estado !== 'autorizado' ||
      atual.usuarioId !== inicial.usuarioId ||
      atual.sessionId !== inicial.sessionId
    )
      return {
        ok: false as const,
        erro: { codigo: 'pendencia_externa' as const },
        request_id: requestId,
      };
    if (!resultado || typeof resultado !== 'object' || Array.isArray(resultado))
      return {
        ok: false as const,
        erro: { codigo: 'pendencia_externa' as const },
        request_id: requestId,
      };
    const resposta = resultado as Record<string, unknown>;
    if (
      resposta.ok === true &&
      resposta.acesso_id === transporte.p_operacao_id &&
      Object.keys(resposta).length === 2
    )
      return { ok: true as const, acesso_id: transporte.p_operacao_id, request_id: requestId };
    const codigo = codigosVinculo.find((item) => item === resposta.codigo);
    if (resposta.ok === false && codigo && Object.keys(resposta).length === 2)
      return { ok: false as const, erro: { codigo }, request_id: requestId };
    return {
      ok: false as const,
      erro: { codigo: 'pendencia_externa' as const },
      request_id: requestId,
    };
  } catch {
    // Não recifrar nem repetir automaticamente: a RPC exige o mesmo envelope.
    return {
      ok: false as const,
      erro: {
        codigo: mutacaoIniciada
          ? ('pendencia_externa' as const)
          : ('servico_indisponivel' as const),
      },
      request_id: requestId,
    };
  } finally {
    clearTimeout(temporizador);
    request.signal.removeEventListener('abort', cancelar);
  }
}
