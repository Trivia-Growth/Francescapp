import { createClient } from '@supabase/supabase-js';
import { uuidSchema } from '../../../../packages/contracts/src/comum.ts';
import type { FonteDeConfiguracao } from '../../../../supabase/functions/_shared/configuracao.ts';
import { carregarConfiguracaoAuthNativo } from './cliente.ts';

/**
 * Preparação privada, sem rota. O chamador precisará antes reservar a tentativa
 * autorizada e auditada no banco e usar somente o email decifrado dessa reserva.
 * Não classificar falha de transporte como rejeição definitiva: Auth pode ter
 * aceitado o envio. Não registrar email, chave, resposta do Auth ou link.
 */
export async function enviarConviteFamiliarNativo(
  fonte: FonteDeConfiguracao,
  emailReservado: string,
  conviteId: string,
  signal: AbortSignal,
): Promise<'enviado' | 'resultado_incerto'> {
  // O callback, o template, a recuperação e as provas integradas ainda não existem.
  const integracaoComprovada = false;
  if (!integracaoComprovada || fonte.FFCM_CONVITE_FAMILIAR_ATIVO !== 'true')
    throw new Error('Convite indisponível.');
  const config = carregarConfiguracaoAuthNativo(fonte);
  const segredo = fonte.FFCM_SUPABASE_AUTH_SECRET_KEY;
  const email = emailReservado.trim().toLowerCase();
  if (
    !segredo ||
    segredo !== segredo.trim() ||
    !email ||
    email.length > 254 ||
    !/^[!-~]+@[!-~]+$/.test(email) ||
    !uuidSchema.safeParse(conviteId).success ||
    signal.aborted
  )
    throw new Error('Convite indisponível.');
  const cliente = createClient(config.supabaseUrl.href, segredo, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.any([
            signal,
            AbortSignal.timeout(10_000),
            ...(init?.signal ? [init.signal] : []),
          ]),
        }),
    },
  });
  try {
    const resultado = await cliente.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${config.origem}/convite-familiar?convite=${conviteId.toLowerCase()}`,
    });
    if (resultado.error || !resultado.data.user || signal.aborted) return 'resultado_incerto';
    return 'enviado';
  } catch {
    return 'resultado_incerto';
  }
}
