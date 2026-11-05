import type { RepositorioStateAgenda } from './agenda-google-state.ts';

/** Canal exclusivo do executor interno, com JWT verificado e prova OAuth; não conectar a RPC exposta ao navegador. */
type CanalAgenda = Readonly<{
  identidade(): Promise<Readonly<{ usuarioId: string; sessaoId: string }> | null>;
  chamar(nome: string, argumentos: Record<string, string>): Promise<unknown>;
}>;

export function criarRepositorioAgenda(canal: CanalAgenda): RepositorioStateAgenda & {
  salvarCredencial(refresh: string, geracao: string, subject: string): Promise<void>;
  lerCredencial(): Promise<Readonly<{ refresh: string; geracao: string }> | null>;
  revogarCredencial(): Promise<void>;
} {
  const conferir = async (usuarioId: string, sessaoId: string) => {
    const identidade = await canal.identidade();
    if (!identidade || identidade.usuarioId !== usuarioId || identidade.sessaoId !== sessaoId)
      throw new Error('Conexão indisponível.');
  };
  return {
    async registrar({ hash, usuarioId, sessaoId, selado }) {
      await conferir(usuarioId, sessaoId);
      if (
        (await canal.chamar('agenda_google_registrar_state', {
          p_hash: hash,
          p_selado: selado,
        })) !== true
      )
        throw new Error('Conexão indisponível.');
    },
    async consumir({ hash, usuarioId, sessaoId }) {
      await conferir(usuarioId, sessaoId);
      const resultado = await canal.chamar('agenda_google_consumir_state', { p_hash: hash });
      if (resultado === null) return null;
      if (
        typeof resultado !== 'object' ||
        !('selado' in resultado) ||
        typeof resultado.selado !== 'string' ||
        !('geracao' in resultado) ||
        typeof resultado.geracao !== 'string' ||
        !/^[0-9]{1,19}$/.test(resultado.geracao)
      )
        throw new Error('Conexão indisponível.');
      return { selado: resultado.selado, geracao: resultado.geracao };
    },
    async salvarCredencial(refresh, geracao, subject) {
      if (
        !refresh ||
        refresh.length > 4096 ||
        !/^[0-9]{1,19}$/.test(geracao) ||
        !subject ||
        subject.length > 255 ||
        (await canal.chamar('agenda_google_salvar_credencial', {
          p_refresh: refresh,
          p_geracao: geracao,
          p_subject: subject,
        })) !== true
      )
        throw new Error('Conexão indisponível.');
    },
    async lerCredencial() {
      const resultado = await canal.chamar('agenda_google_ler_credencial', {});
      if (resultado === null) return null;
      if (
        typeof resultado !== 'object' ||
        !('refresh' in resultado) ||
        typeof resultado.refresh !== 'string' ||
        !resultado.refresh ||
        resultado.refresh.length > 4096 ||
        !('geracao' in resultado) ||
        typeof resultado.geracao !== 'string' ||
        !/^[0-9]{1,19}$/.test(resultado.geracao)
      )
        throw new Error('Conexão indisponível.');
      return { refresh: resultado.refresh, geracao: resultado.geracao };
    },
    async revogarCredencial() {
      if ((await canal.chamar('agenda_google_revogar_credencial', {})) !== true)
        throw new Error('Conexão indisponível.');
    },
  };
}
