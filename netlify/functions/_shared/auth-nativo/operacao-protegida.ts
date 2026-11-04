import { sessaoNativaSchema } from '../../../../packages/contracts/src/identidade.ts';
import type { FonteDeConfiguracao } from '../../../../supabase/functions/_shared/configuracao.ts';
import { criarContextoAuthNativo } from './cliente.ts';

/** A operação no banco deve autorizar novamente, de forma transacional. */
export async function autorizarOperacaoNativa(request: Request, fonte: FonteDeConfiguracao) {
  const alvo = request.headers.get('x-sessao');
  if (
    !alvo ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(alvo)
  )
    return { estado: 'entrada_invalida' } as const;
  try {
    const contexto = criarContextoAuthNativo(request, fonte);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      if (
        request.headers.get('origin') !== contexto.origem ||
        request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
          'application/json'
      )
        return { estado: 'entrada_invalida' } as const;
    }
    const identidade = await contexto.cliente.auth.getUser();
    if (identidade.error) {
      const erro = identidade.error;
      if (erro.name === 'AuthSessionMissingError' || erro.status === 401 || erro.status === 403)
        return { estado: 'nao_autenticado' } as const;
      return { estado: 'servico_indisponivel' } as const;
    }
    if (contexto.cookiesAlterados) return { estado: 'nao_autenticado' } as const;
    if (!identidade.data.user) return { estado: 'nao_autenticado' } as const;
    const resultado = await contexto.cliente.schema('api').rpc('consultar_sessao_nativa', {
      p_request_id: crypto.randomUUID(),
    });
    if (contexto.cookiesAlterados) return { estado: 'nao_autenticado' } as const;
    if (resultado.error) return { estado: 'servico_indisponivel' } as const;
    const sessao = sessaoNativaSchema.safeParse(resultado.data);
    if (
      !sessao.success ||
      !sessao.data.usuario.ativo ||
      sessao.data.usuario.id !== identidade.data.user.id ||
      sessao.data.session_id !== alvo
    )
      return { estado: 'nao_autenticado' } as const;
    return Object.defineProperty(
      { estado: 'autorizado' as const, sessao: sessao.data },
      'contexto',
      {
        value: contexto,
        enumerable: false,
      },
    ) as {
      readonly estado: 'autorizado';
      readonly sessao: typeof sessao.data;
      readonly contexto: typeof contexto;
    };
  } catch {
    return { estado: 'servico_indisponivel' } as const;
  }
}
