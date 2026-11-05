import type { criarAtestadorOperacao } from './atestado-operacao.ts';
import type { criarExecutorAgendaPostgres } from './agenda-google-postgres.ts';

/** Somente servidor: identidade precisa resultar de JWT validado e autorização
 * vigente; salvar só pode ser chamado após validar state e ID token Google. */
export function criarCanalAgenda(config: {
  identidade: { usuarioId: string; sessaoId: string };
  keyId: string;
  atestador: ReturnType<typeof criarAtestadorOperacao>;
  executar: ReturnType<typeof criarExecutorAgendaPostgres>;
}) {
  const operacoes: Record<string, string> = {
    agenda_google_registrar_state: 'agenda.registrar',
    agenda_google_consumir_state: 'agenda.consumir',
    agenda_google_salvar_credencial: 'agenda.salvar',
    agenda_google_ler_credencial: 'agenda.ler',
    agenda_google_revogar_credencial: 'agenda.revogar',
  };
  return {
    async identidade() {
      return config.identidade;
    },
    async chamar(nome: string, argumentos: Record<string, string>): Promise<unknown> {
      const operacao = operacoes[nome];
      if (!operacao) throw new Error('Conexão indisponível.');
      const valor =
        nome === 'agenda_google_registrar_state'
          ? argumentos.p_selado
          : nome === 'agenda_google_salvar_credencial'
            ? argumentos.p_refresh
            : undefined;
      const permitidos =
        nome === 'agenda_google_registrar_state'
          ? ['p_hash', 'p_selado']
          : nome === 'agenda_google_consumir_state'
            ? ['p_hash']
            : nome === 'agenda_google_salvar_credencial'
              ? ['p_refresh', 'p_geracao']
              : [];
      if (
        Object.keys(argumentos).some((campo) => !permitidos.includes(campo)) ||
        permitidos.some((campo) => typeof argumentos[campo] !== 'string')
      )
        throw new Error('Conexão indisponível.');
      const digest =
        valor === undefined
          ? undefined
          : Array.from(
              new Uint8Array(
                await crypto.subtle.digest('SHA-256', new TextEncoder().encode(valor)),
              ),
              (byte) => byte.toString(16).padStart(2, '0'),
            ).join('');
      const requestId = crypto.randomUUID();
      const agora = Date.now();
      const entrada = {
        request_id: requestId,
        ...(argumentos.p_hash ? { hash: argumentos.p_hash } : {}),
        ...(argumentos.p_geracao ? { geracao: argumentos.p_geracao } : {}),
        ...(digest ? { valor_hash: digest } : {}),
      };
      const prova = await config.atestador.atestarEntrada(
        {
          key_id: config.keyId,
          usuario_id: config.identidade.usuarioId,
          session_id: config.identidade.sessaoId,
          request_id: requestId,
          operacao,
          emitido_em: new Date(agora).toISOString(),
          expira_em: new Date(agora + 15_000).toISOString(),
        },
        entrada,
      );
      return config.executar(
        {
          entrada: { ...entrada, atestado: prova.atestado },
          entrada_canonica: prova.entradaCanonica,
          dados_canonicos: prova.dadosCanonicos,
        },
        valor ?? null,
      );
    },
  };
}
