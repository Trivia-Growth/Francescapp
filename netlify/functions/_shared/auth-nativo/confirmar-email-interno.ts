import {
  solicitarConfirmacaoInternaSchema,
  verificarConfirmacaoInternaSchema,
} from '../../../../packages/contracts/src/acessos.ts';
import { criarErroPublicoSemCampos } from '../../../../packages/contracts/src/erros.ts';
import { uuidSchema } from '../../../../packages/contracts/src/comum.ts';
import { z } from 'zod';
import type { FonteDeConfiguracao } from '../../../../supabase/functions/_shared/configuracao.ts';
import { criarClienteOtpNativo } from './cliente-otp.ts';
import { cabecalhosAuthInterno, lerEntradaInterna } from './entrada-interna.ts';

const confirmacaoSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), usuario_id: uuidSchema, request_id: uuidSchema }).strict(),
  z.object({ ok: z.literal(false), request_id: uuidSchema }).strict(),
]);

/** Depende de SMTP e templates nativos Confirm signup/Magic Link com {{ .Token }}
 * homologados. Pedido não comprova entrega. Nenhuma sessão OTP vira cookie ou admissão. */
export async function confirmarEmailInternoNativo(
  request: Request,
  fonte: FonteDeConfiguracao,
  acao: 'solicitar' | 'verificar',
) {
  const requestId = crypto.randomUUID();
  const recebido = () =>
    Response.json(
      { dados: { recebido: true }, request_id: requestId },
      { headers: cabecalhosAuthInterno },
    );
  const erro = (codigo: 'entrada_invalida' | 'servico_indisponivel', status: number) =>
    Response.json(criarErroPublicoSemCampos(codigo, requestId), {
      status,
      headers: cabecalhosAuthInterno,
    });
  const indisponivel = (erroAuth: { name: string; status?: number } | null) =>
    erroAuth !== null &&
    (erroAuth.name === 'AuthRetryableFetchError' || (erroAuth.status ?? 0) >= 500);
  let entrada: unknown;
  try {
    entrada = await lerEntradaInterna(request, `/api/auth/interno/confirmacao/${acao}`, false);
  } catch {
    return erro('entrada_invalida', 422);
  }
  try {
    const contexto = criarClienteOtpNativo(request, fonte);
    if (request.headers.get('origin') !== contexto.origem) return erro('entrada_invalida', 422);
    if (acao === 'solicitar') {
      const dados = solicitarConfirmacaoInternaSchema.safeParse(entrada);
      if (!dados.success) return erro('entrada_invalida', 422);
      // Native rate limits e shouldCreateUser:false impedem cadastro público acidental.
      const envio = await contexto.cliente.auth.signInWithOtp({
        email: dados.data.email.toLowerCase(),
        options: { shouldCreateUser: false },
      });
      if (indisponivel(envio.error) || request.signal.aborted)
        return erro('servico_indisponivel', 503);
      return recebido();
    }
    const dados = verificarConfirmacaoInternaSchema.safeParse(entrada);
    if (!dados.success) return erro('entrada_invalida', 422);
    const email = dados.data.email.toLowerCase();
    const verificacao = await contexto.cliente.auth.verifyOtp({
      email,
      token: dados.data.codigo,
      type: 'email',
    });
    if (indisponivel(verificacao.error)) return erro('servico_indisponivel', 503);
    if (verificacao.error || !verificacao.data.user || !verificacao.data.session) return recebido();
    const identidade = await contexto.cliente.auth.getUser();
    if (
      identidade.error ||
      !identidade.data.user ||
      identidade.data.user.id !== verificacao.data.user.id ||
      identidade.data.user.email?.trim().toLowerCase() !== email ||
      !identidade.data.user.email_confirmed_at ||
      request.signal.aborted
    )
      return recebido();
    // SQL confere UUID gerenciado, método interno, marcador da reserva e confirmação Auth.
    const resultado = await contexto.cliente
      .schema('api')
      .rpc('confirmar_email_acesso_interno_nativo', { p_request_id: requestId });
    if (resultado.error || request.signal.aborted) return erro('servico_indisponivel', 503);
    const confirmacao = confirmacaoSchema.safeParse(resultado.data);
    if (
      !confirmacao.success ||
      confirmacao.data.request_id !== requestId ||
      (confirmacao.data.ok && confirmacao.data.usuario_id !== identidade.data.user.id)
    )
      return erro('servico_indisponivel', 503);
    return recebido();
  } catch {
    return erro('servico_indisponivel', 503);
  }
}
