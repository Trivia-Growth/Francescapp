import { createClient } from '@supabase/supabase-js';
import type { FonteDeConfiguracao } from '../../../../supabase/functions/_shared/configuracao.ts';
import { carregarConfiguracaoAuthNativo } from './cliente.ts';

/** OTP numérico nativo não usa PKCE nem cookies do administrador/destinatário.
 * A sessão verificada existe somente neste cliente em memória até encerrar pedido. */
export function criarClienteOtpNativo(request: Request, fonte: FonteDeConfiguracao) {
  const config = carregarConfiguracaoAuthNativo(fonte);
  if (new URL(request.url).origin !== config.origem) throw new Error('Auth indisponível.');
  const cliente = createClient(config.supabaseUrl.href, config.chaveAnonSupabase, {
    auth: {
      flowType: 'implicit',
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.any([
            request.signal,
            AbortSignal.timeout(10_000),
            ...(init?.signal ? [init.signal] : []),
          ]),
        }),
    },
  });
  return { cliente, origem: config.origem };
}
