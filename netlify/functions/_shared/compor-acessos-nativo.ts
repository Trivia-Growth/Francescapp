import type { FonteDeConfiguracao } from '../../../supabase/functions/_shared/configuracao.ts';
import { isAuthWeakPasswordError } from '@supabase/supabase-js';
import { criarAdministradorAuthNativo } from './auth-nativo/admin.ts';
import { autorizarOperacaoNativa } from './auth-nativo/operacao-protegida.ts';
import { carregarCofreNativo } from './cofre-nativo.ts';
import { configurarDependenciasNativas } from './configurar-dependencias-nativas.ts';
import { metadadosAtestadoNativo } from './compor-pacientes-nativo.ts';
import { operarAcessosNativo, type ComandoAcessos } from './acessos-nativo.ts';
import { criarErroPublicoSemCampos } from '../../../packages/contracts/src/erros.ts';
import { criarAcessoSchema } from '../../../packages/contracts/src/acessos.ts';

let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

/** Authadmin só é carregado quando há criação interna ou consulta daquele UUID. */
export async function comporAcessosNativo(
  request: Request,
  comando: ComandoAcessos,
  fonte: FonteDeConfiguracao,
): Promise<Response> {
  const controle = new AbortController();
  const cancelar = () => controle.abort();
  if (request.signal.aborted) cancelar();
  else request.signal.addEventListener('abort', cancelar, { once: true });
  const prazo = setTimeout(cancelar, 25_000);
  try {
    const pedido = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      signal: controle.signal,
    });
    const inicial = await autorizarOperacaoNativa(pedido, fonte);
    if (inicial.estado !== 'autorizado' || inicial.sessao.usuario.perfil !== 'administrador') {
      const codigo = inicial.estado === 'autorizado' ? 'sem_permissao' : inicial.estado;
      const status =
        codigo === 'sem_permissao'
          ? 403
          : codigo === 'nao_autenticado'
            ? 401
            : codigo === 'entrada_invalida'
              ? 422
              : 503;
      return Response.json(criarErroPublicoSemCampos(codigo, crypto.randomUUID()), {
        status,
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }
    if (comando.operacao === 'criar') {
      const entrada = criarAcessoSchema.safeParse(comando.entrada);
      if (
        entrada.success &&
        entrada.data.metodo === 'interno' &&
        (!fonte.FFCM_SUPABASE_AUTH_SECRET_KEY ||
          fonte.FFCM_SUPABASE_AUTH_SECRET_KEY !== fonte.FFCM_SUPABASE_AUTH_SECRET_KEY.trim())
      )
        return Response.json(
          criarErroPublicoSemCampos('servico_indisponivel', crypto.randomUUID()),
          { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
        );
    }
    dependencias ??= configurarDependenciasNativas(fonte);
    const configuradas = dependencias;
    const cofre = await carregarCofreNativo(
      configuradas.pool,
      configuradas.referencias,
      configuradas.keyIdAtestado,
      controle.signal,
    );
    return await operarAcessosNativo(pedido, comando, {
      autorizar: async () => {
        const atual = await autorizarOperacaoNativa(pedido, fonte);
        if (atual.estado !== 'autorizado') return atual;
        return {
          estado: 'autorizado',
          identidade: {
            usuario_id: atual.sessao.usuario.id,
            session_id: atual.sessao.session_id,
            perfil: atual.sessao.usuario.perfil,
          },
        };
      },
      cifra: cofre.cifra,
      atestador: cofre.atestador,
      metadados: (id) => metadadosAtestadoNativo(configuradas.keyIdAtestado, id, Date.now()),
      executar: async (transporte) => {
        if (controle.signal.aborted || inicial.contexto.cookiesAlterados) throw new Error();
        const resultado = await inicial.contexto.cliente
          .schema('api')
          .rpc('acesso_gerenciado_privado', { p_transporte: transporte });
        if (resultado.error || inicial.contexto.cookiesAlterados || controle.signal.aborted)
          throw new Error();
        return resultado.data;
      },
      auth: {
        criar: async (atributos) => {
          if (controle.signal.aborted) throw new Error();
          const resultado = await criarAdministradorAuthNativo(fonte, controle.signal).createUser(
            atributos,
          );
          if (controle.signal.aborted) throw new Error();
          if (resultado.error) {
            if (
              resultado.error.name === 'AuthApiError' &&
              ['email_exists', 'user_already_exists'].includes(resultado.error.code ?? '')
            )
              return { user: null, conflito: true };
            // Recusa nativa específica: nenhum timeout, texto de erro ou outro 400
            // permite liberar o e-mail. SQL ainda exige ausência do UUID reservado.
            if (
              isAuthWeakPasswordError(resultado.error) &&
              resultado.error.code === 'weak_password' &&
              [400, 422].includes(resultado.error.status ?? 0)
            )
              return { user: null, conflito: false, recusado: true };
            throw new Error('Resultado Auth não confirmado.');
          }
          return { user: resultado.data.user, conflito: false };
        },
        consultar: async (usuarioId) => {
          if (controle.signal.aborted) throw new Error();
          const resultado = await criarAdministradorAuthNativo(fonte, controle.signal).getUserById(
            usuarioId,
          );
          if (controle.signal.aborted) throw new Error();
          if (resultado.error) {
            if (resultado.error.code === 'user_not_found') return null;
            throw new Error('Resultado Auth não confirmado.');
          }
          return resultado.data.user;
        },
      },
    });
  } catch {
    return Response.json(criarErroPublicoSemCampos('servico_indisponivel', crypto.randomUUID()), {
      status: 503,
      headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  } finally {
    clearTimeout(prazo);
    request.signal.removeEventListener('abort', cancelar);
  }
}
