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
  consultarDesconexao(
    subject: string,
    operacaoId: string,
  ): Promise<
    | { estado: 'desconhecido' }
    | {
        estado: 'desconectado' | 'conflito' | 'cancelada';
        conexao_atual: 'conectado' | 'desconectado';
        versao_atual: string;
      }
  >;
  cancelarDesconexao(
    subject: string,
    geracao: string,
    operacaoId: string,
  ): Promise<{
    estado: 'desconectado' | 'conflito' | 'cancelada';
    conexao_atual: 'conectado' | 'desconectado';
    versao_atual: string;
  }>;
  statusConexao(subject: string): Promise<{ estado: 'conectado' | 'desconectado'; versao: string }>;
  desconectar(
    subject: string,
    geracao: string,
    operacaoId: string,
  ): Promise<{
    estado: 'desconectado' | 'conflito' | 'cancelada';
    conexao_atual: 'conectado' | 'desconectado';
    versao_atual: string;
  }>;
  consultarVinculos(
    eventos: readonly string[],
    subject: string,
    geracao: string,
  ): Promise<readonly { evento_id: string; paciente: unknown }[]>;
  vincularPaciente(
    eventoId: string,
    pacienteId: string,
    subject: string,
    geracao: string,
  ): Promise<'vinculado' | 'conflito'>;
  pendencia(): Promise<
    | {
        operacao_id: string;
        evento_id: string;
        acao: 'criar' | 'alterar' | 'cancelar';
      }
    | { conta_anterior: true }
    | null
  >;
  reservarEscrita(
    operacaoId: string,
    eventoId: string,
    acao: string,
    subject: string,
  ): Promise<boolean>;
  resolverEscrita(
    operacaoId: string,
    subject: string,
    desfecho: 'confirmada' | 'nao_realizada',
  ): Promise<boolean>;
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
    async pendencia() {
      const resultado = await canal.chamar('agenda_google_pendencia', {});
      if (resultado === null) return null;
      if (
        typeof resultado === 'object' &&
        'conta_anterior' in resultado &&
        resultado.conta_anterior === true
      )
        return { conta_anterior: true as const };
      if (
        typeof resultado !== 'object' ||
        !('operacao_id' in resultado) ||
        typeof resultado.operacao_id !== 'string' ||
        !('evento_id' in resultado) ||
        typeof resultado.evento_id !== 'string' ||
        !('acao' in resultado) ||
        (resultado.acao !== 'criar' &&
          resultado.acao !== 'alterar' &&
          resultado.acao !== 'cancelar')
      )
        throw new Error('Conexão indisponível.');
      return {
        operacao_id: resultado.operacao_id,
        evento_id: resultado.evento_id,
        acao: resultado.acao,
      };
    },
    async reservarEscrita(operacaoId, eventoId, acao, subject) {
      return (
        (await canal.chamar('agenda_google_reservar_escrita', {
          p_operacao_id: operacaoId,
          p_evento_id: eventoId,
          p_acao: acao,
          p_subject: subject,
        })) === true
      );
    },
    async resolverEscrita(operacaoId, subject, desfecho) {
      return (
        (await canal.chamar('agenda_google_resolver_escrita', {
          p_operacao_id: operacaoId,
          p_subject: subject,
          p_desfecho: desfecho,
        })) === true
      );
    },
    async consultarVinculos(eventos, subject, geracao) {
      const resposta = await canal.chamar('agenda_google_consultar_vinculos', {
        p_eventos: JSON.stringify(eventos),
        p_subject: subject,
        p_geracao: geracao,
      });
      if (
        !Array.isArray(resposta) ||
        resposta.length > eventos.length ||
        resposta.some(
          (item) =>
            typeof item !== 'object' ||
            item === null ||
            typeof item.evento_id !== 'string' ||
            !eventos.includes(item.evento_id) ||
            !('paciente' in item) ||
            typeof item.paciente !== 'object' ||
            item.paciente === null,
        )
      )
        throw new Error('Conexão indisponível.');
      return resposta.map((item) => ({
        evento_id: item.evento_id as string,
        paciente: item.paciente as unknown,
      }));
    },
    async vincularPaciente(eventoId, pacienteId, subject, geracao) {
      const resultado = await canal.chamar('agenda_google_vincular', {
        p_evento_id: eventoId,
        p_paciente_id: pacienteId,
        p_subject: subject,
        p_geracao: geracao,
      });
      if (
        typeof resultado !== 'object' ||
        resultado === null ||
        !('estado' in resultado) ||
        (resultado.estado !== 'vinculado' && resultado.estado !== 'conflito')
      )
        throw new Error('Conexão indisponível.');
      return resultado.estado;
    },
    async consultarDesconexao(subject, operacaoId) {
      const resultado = await canal.chamar('agenda_google_consultar_desconexao', {
        p_subject: subject,
        p_operacao_id: operacaoId,
      });
      if (typeof resultado !== 'object' || resultado === null || !('estado' in resultado))
        throw new Error('Conexão indisponível.');
      if (resultado.estado === 'desconhecido') return { estado: 'desconhecido' as const };
      if (
        (resultado.estado !== 'desconectado' &&
          resultado.estado !== 'conflito' &&
          resultado.estado !== 'cancelada') ||
        !('conexao_atual' in resultado) ||
        (resultado.conexao_atual !== 'conectado' && resultado.conexao_atual !== 'desconectado') ||
        !('versao_atual' in resultado) ||
        typeof resultado.versao_atual !== 'string' ||
        !/^[0-9]{1,18}$/.test(resultado.versao_atual)
      )
        throw new Error('Conexão indisponível.');
      return {
        estado: resultado.estado,
        conexao_atual: resultado.conexao_atual,
        versao_atual: resultado.versao_atual,
      };
    },
    async cancelarDesconexao(subject, geracao, operacaoId) {
      const resultado = await canal.chamar('agenda_google_cancelar_desconexao', {
        p_subject: subject,
        p_geracao: geracao,
        p_operacao_id: operacaoId,
      });
      if (
        typeof resultado !== 'object' ||
        resultado === null ||
        !('estado' in resultado) ||
        (resultado.estado !== 'desconectado' &&
          resultado.estado !== 'conflito' &&
          resultado.estado !== 'cancelada') ||
        !('conexao_atual' in resultado) ||
        (resultado.conexao_atual !== 'conectado' && resultado.conexao_atual !== 'desconectado') ||
        !('versao_atual' in resultado) ||
        typeof resultado.versao_atual !== 'string' ||
        !/^[0-9]{1,18}$/.test(resultado.versao_atual)
      )
        throw new Error('Conexão indisponível.');
      return {
        estado: resultado.estado,
        conexao_atual: resultado.conexao_atual,
        versao_atual: resultado.versao_atual,
      };
    },
    async statusConexao(subject) {
      const resultado = await canal.chamar('agenda_google_status_conexao', { p_subject: subject });
      if (
        typeof resultado !== 'object' ||
        resultado === null ||
        !('estado' in resultado) ||
        (resultado.estado !== 'conectado' && resultado.estado !== 'desconectado') ||
        !('versao' in resultado) ||
        typeof resultado.versao !== 'string' ||
        !/^[0-9]{1,18}$/.test(resultado.versao)
      )
        throw new Error('Conexão indisponível.');
      return { estado: resultado.estado, versao: resultado.versao };
    },
    async desconectar(subject, geracao, operacaoId) {
      const resultado = await canal.chamar('agenda_google_desconectar', {
        p_subject: subject,
        p_geracao: geracao,
        p_operacao_id: operacaoId,
      });
      if (
        typeof resultado !== 'object' ||
        resultado === null ||
        !('estado' in resultado) ||
        (resultado.estado !== 'desconectado' &&
          resultado.estado !== 'conflito' &&
          resultado.estado !== 'cancelada') ||
        !('conexao_atual' in resultado) ||
        (resultado.conexao_atual !== 'conectado' && resultado.conexao_atual !== 'desconectado') ||
        !('versao_atual' in resultado) ||
        typeof resultado.versao_atual !== 'string' ||
        !/^[0-9]{1,18}$/.test(resultado.versao_atual)
      )
        throw new Error('Conexão indisponível.');
      return {
        estado: resultado.estado,
        conexao_atual: resultado.conexao_atual,
        versao_atual: resultado.versao_atual,
      };
    },
    async revogarCredencial() {
      if ((await canal.chamar('agenda_google_revogar_credencial', {})) !== true)
        throw new Error('Conexão indisponível.');
    },
  };
}
