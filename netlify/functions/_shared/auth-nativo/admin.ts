import { createClient } from '@supabase/supabase-js';
import type { FonteDeConfiguracao } from '../../../../supabase/functions/_shared/configuracao.ts';
import { carregarConfiguracaoAuthNativo } from './cliente.ts';

/** Cliente privilegiado isolado: sem cookies, sessão de usuário ou RPC clínica. */
export function criarAdministradorAuthNativo(fonte: FonteDeConfiguracao, signal: AbortSignal) {
  const config = carregarConfiguracaoAuthNativo(fonte);
  const chave = fonte.FFCM_SUPABASE_AUTH_SECRET_KEY;
  if (!chave || chave !== chave.trim()) throw new Error('Auth indisponível.');
  const cliente = createClient(config.supabaseUrl.href, chave, {
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
  return cliente.auth.admin;
}
