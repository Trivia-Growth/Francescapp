import {
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
  uuidSchema,
  type ResultadoAtestacao,
} from '@ffcmapp/contratos';

type Comando =
  | {
      operacao: 'api.reservar_edicao_paciente';
      epoca: number;
      reserva_id: string;
      paciente_id: string;
    }
  | {
      operacao: 'api.encerrar_edicao_paciente';
      epoca: number;
      reserva_id: string | null;
      comando_id: string;
    }
  | { operacao: 'api.consultar_barreira_edicao_paciente' }
  | { operacao: 'api.reconhecer_barreira_edicao_paciente'; comando_id: string };

/** Composição privada: contexto deve vir de sessão verificada, nunca do navegador. */
export async function prepararBarreiraEdicaoPacientePrivada(
  comando: Comando,
  contexto: unknown,
  atestador: {
    canonicalizar(valor: unknown): string;
    atestarEntrada(dados: unknown, entrada: Record<string, unknown>): Promise<ResultadoAtestacao>;
  },
) {
  try {
    const c = dadosAtestadoSchema.omit({ digest_entrada: true, operacao: true }).parse(contexto);
    const normalizado = {
      ...c,
      usuario_id: c.usuario_id.toLowerCase(),
      session_id: c.session_id.toLowerCase(),
      request_id: c.request_id.toLowerCase(),
    };
    let operacao: Comando;
    switch (comando.operacao) {
      case 'api.reservar_edicao_paciente':
        if (!Number.isSafeInteger(comando.epoca) || comando.epoca < 1) throw new Error();
        operacao = {
          operacao: comando.operacao,
          epoca: comando.epoca,
          reserva_id: uuidSchema.parse(comando.reserva_id).toLowerCase(),
          paciente_id: uuidSchema.parse(comando.paciente_id).toLowerCase(),
        };
        break;
      case 'api.encerrar_edicao_paciente':
        if (!Number.isSafeInteger(comando.epoca) || comando.epoca < 1) throw new Error();
        operacao = {
          operacao: comando.operacao,
          epoca: comando.epoca,
          reserva_id:
            comando.reserva_id === null ? null : uuidSchema.parse(comando.reserva_id).toLowerCase(),
          comando_id: uuidSchema.parse(comando.comando_id).toLowerCase(),
        };
        break;
      case 'api.consultar_barreira_edicao_paciente':
        operacao = { operacao: comando.operacao };
        break;
      case 'api.reconhecer_barreira_edicao_paciente':
        operacao = {
          operacao: comando.operacao,
          comando_id: uuidSchema.parse(comando.comando_id).toLowerCase(),
        };
        break;
      default:
        throw new Error();
    }
    const entrada = { request_id: normalizado.request_id, ...operacao };
    const prova = resultadoAtestacaoSchema.parse(
      await atestador.atestarEntrada({ ...normalizado, operacao: operacao.operacao }, entrada),
    );
    const dados = dadosAtestadoSchema.parse(JSON.parse(prova.dadosCanonicos));
    if (
      atestador.canonicalizar(entrada) !== prova.entradaCanonica ||
      atestador.canonicalizar(dados) !== prova.dadosCanonicos ||
      dados.operacao !== operacao.operacao ||
      dados.key_id !== normalizado.key_id ||
      dados.usuario_id !== normalizado.usuario_id ||
      dados.session_id !== normalizado.session_id ||
      dados.request_id !== normalizado.request_id ||
      dados.emitido_em !== normalizado.emitido_em ||
      dados.expira_em !== normalizado.expira_em
    )
      throw new Error();
    return {
      entrada: { ...entrada, atestado: { ...dados, mac: prova.atestado.mac } },
      entrada_canonica: prova.entradaCanonica,
      dados_canonicos: prova.dadosCanonicos,
    };
  } catch {
    throw new Error('Não foi possível preparar a barreira de edição.');
  }
}
