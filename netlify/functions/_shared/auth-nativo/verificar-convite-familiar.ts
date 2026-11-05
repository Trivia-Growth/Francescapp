import type { FonteDeConfiguracao } from '../../../../supabase/functions/_shared/configuracao.ts';
import { criarContextoAuthNativo, fluxoValido } from './cliente.ts';

/**
 * Preparação privada, sem rota. O chamador deve manter os cookies retidos até
 * ativar o convite e admitir a sessão no banco; falhas não chamam responder().
 * O token deve chegar no corpo de uma requisição same-origin, nunca na URL.
 */
export async function verificarConviteFamiliarNativo(
  request: Request,
  fonte: FonteDeConfiguracao,
  tokenHash: string,
  tipo: 'invite' | 'recovery',
) {
  if (
    request.method !== 'POST' ||
    request.headers.get('origin') !== new URL(request.url).origin ||
    !fluxoValido(request.headers.get('x-fluxo')) ||
    !/^[a-f0-9]{64}$/i.test(tokenHash)
  )
    throw new Error('Convite indisponível.');

  const contexto = criarContextoAuthNativo(request, fonte);
  if (request.headers.get('origin') !== contexto.origem) throw new Error('Convite indisponível.');
  const verificacao = await contexto.cliente.auth.verifyOtp({
    type: tipo,
    token_hash: tokenHash,
  });
  if (verificacao.error || !verificacao.data.session || !verificacao.data.user)
    throw new Error('Convite indisponível.');
  const identidade = await contexto.cliente.auth.getUser();
  if (
    identidade.error ||
    !identidade.data.user ||
    identidade.data.user.id !== verificacao.data.user.id ||
    !identidade.data.user.email_confirmed_at
  )
    throw new Error('Convite indisponível.');
  const email = identidade.data.user.email?.trim().toLowerCase();
  const sessao = uuidSchema.safeParse(decodeJwt(verificacao.data.session.access_token).session_id);
  if (!email || email.length > 254 || !/^[!-~]+@[!-~]+$/.test(email) || !sessao.success)
    throw new Error('Convite indisponível.');
  return { contexto, usuarioId: identidade.data.user.id, sessaoId: sessao.data, email };
}
import { decodeJwt } from 'jose';
import { uuidSchema } from '../../../../packages/contracts/src/comum.ts';
