import { criarErroPublicoSemCampos } from '../../../../packages/contracts/src/erros.ts';
import type { FonteDeConfiguracao } from '../../../../supabase/functions/_shared/configuracao.ts';
import { credencialAuthRejeitada, criarContextoAuthNativo } from './cliente.ts';

/** Preparação privada: não registrar rota antes da validação integrada. */
export async function encerrarSessaoFamiliarPrivada(request: Request, fonte: FonteDeConfiguracao) {
  const requestId = crypto.randomUUID();
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
  const erro = (
    codigo: 'entrada_invalida' | 'nao_autenticado' | 'servico_indisponivel',
    status: number,
  ) => Response.json(criarErroPublicoSemCampos(codigo, requestId), { status, headers });
  const url = new URL(request.url);
  const alvo = request.headers.get('x-sessao');
  if (
    request.method !== 'POST' ||
    url.pathname !== '/api/familiar/sessao/sair' ||
    url.search ||
    url.hash ||
    !alvo ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(alvo) ||
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
  )
    return erro('entrada_invalida', 422);
  try {
    const contexto = criarContextoAuthNativo(request, fonte);
    if (request.headers.get('origin') !== contexto.origem) return erro('entrada_invalida', 422);
    const leitor = request.body?.getReader();
    let texto = '';
    let bytes = 0;
    if (leitor) {
      const decodificador = new TextDecoder();
      try {
        while (true) {
          const parte = await leitor.read();
          if (parte.done) break;
          bytes += parte.value.byteLength;
          if (bytes > 64) {
            void leitor.cancel().catch(() => {});
            return erro('entrada_invalida', 422);
          }
          texto += decodificador.decode(parte.value, { stream: true });
        }
        texto += decodificador.decode();
      } finally {
        leitor.releaseLock();
      }
    }
    if (texto.trim() !== '{}') return erro('entrada_invalida', 422);
    const identidade = await contexto.cliente.auth.getUser();
    if (identidade.error)
      return credencialAuthRejeitada(identidade.error)
        ? erro('nao_autenticado', 401)
        : erro('servico_indisponivel', 503);
    if (!identidade.data.user) return erro('nao_autenticado', 401);
    const resultado = await contexto.cliente
      .schema('api')
      .rpc('encerrar_sessao_familiar_privada', { p_session_id: alvo, p_request_id: requestId });
    if (resultado.error || (resultado.data !== true && resultado.data !== false))
      return erro('servico_indisponivel', 503);
    if (!resultado.data) return erro('nao_autenticado', 401);
    let pendencia = false;
    try {
      pendencia = !!(await contexto.cliente.auth.signOut({ scope: 'local' })).error;
    } catch {
      pendencia = true;
    }
    return Response.json(
      {
        dados: { encerrada_localmente: true, pendencia_externa: pendencia },
        request_id: requestId,
      },
      { headers },
    );
  } catch {
    return erro('servico_indisponivel', 503);
  }
}
