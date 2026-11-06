import {
  consultaBarreiraPlanoResultadoSchema,
  objetivoSchema,
  estadoEncerramentoPlanoSchema,
  estadoReconhecimentoPlanoSchema,
  estadoReservaPlanoSchema,
  uuidSchema,
  type Objetivo,
} from '../packages/contracts/src/index.ts';

type Consulta = ReturnType<typeof consultaBarreiraPlanoResultadoSchema.parse>;
type Identidade = Readonly<{ usuario_id: string; session_id: string }>;
export type PortasCicloPlano = {
  identidadeAtual(): Identidade | null;
  consultar(identidade: Identidade): Promise<unknown>;
  reservar(
    entrada: { epoca: number; reserva_id: string; paciente_id: string },
    identidade: Identidade,
  ): Promise<unknown>;
  criar(
    entrada: {
      entrada: Objetivo;
      paciente_id: string;
      chave: string;
      reserva_id: string;
      geracao_reserva: number;
    },
    identidade: Identidade,
  ): Promise<unknown>;
  encerrar(
    entrada: {
      epoca: number;
      reserva_id: string | null;
      comando_id: string;
    },
    identidade: Identidade,
  ): Promise<unknown>;
  reconhecer(entrada: { comando_id: string }, identidade: Identidade): Promise<unknown>;
};

/** Não persiste dados. Portas devem vincular cada pedido à identidade capturada,
 * autenticar, autorizar e validar transporte no servidor.
 * Resultado incerto exige encerramento autorizado e consulta, inclusive após recarga. */
export function criarCicloPlano(
  portas: PortasCicloPlano,
  novoId: () => string = () => crypto.randomUUID(),
) {
  const inicial = portas.identidadeAtual();
  if (!inicial) throw new Error('Sessão indisponível');
  const identidade = Object.freeze({
    usuario_id: uuidSchema.parse(inicial.usuario_id).toLowerCase(),
    session_id: uuidSchema.parse(inicial.session_id).toLowerCase(),
  });
  let ocupado = false;
  let invalidado = false;
  let consulta: Consulta | null = null;
  let inseguro = true;
  let cercado = false;
  let encerramento: { epoca: number; reserva_id: string | null; comando_id: string } | null = null;
  let reconhecimento: string | null = null;
  const id = () => uuidSchema.parse(novoId());
  const verificarIdentidade = () => {
    let atual: Identidade | null = null;
    try {
      atual = portas.identidadeAtual();
    } catch {
      // Indisponibilidade não prova identidade vigente.
    }
    if (
      invalidado ||
      !atual ||
      typeof atual.usuario_id !== 'string' ||
      atual.usuario_id.toLowerCase() !== identidade.usuario_id ||
      typeof atual.session_id !== 'string' ||
      atual.session_id.toLowerCase() !== identidade.session_id
    ) {
      invalidado = true;
      consulta = null;
      encerramento = null;
      reconhecimento = null;
      inseguro = true;
      cercado = false;
      throw new Error('Sessão alterada');
    }
  };
  const chamar = async <T>(acao: () => Promise<T>): Promise<T> => {
    verificarIdentidade();
    try {
      const resultado = await acao();
      verificarIdentidade();
      return resultado;
    } catch (erro) {
      verificarIdentidade();
      throw erro;
    }
  };
  const executar = async <T>(acao: () => Promise<T>): Promise<T> => {
    verificarIdentidade();
    if (ocupado) throw new Error('Operação em andamento');
    ocupado = true;
    try {
      return await acao();
    } finally {
      ocupado = false;
    }
  };

  return {
    consultar: () =>
      executar(async () => {
        consulta = null;
        try {
          const atual = consultaBarreiraPlanoResultadoSchema.parse(
            await chamar(() => portas.consultar(identidade)),
          );
          verificarIdentidade();
          consulta = atual;
          return atual;
        } catch (erro) {
          inseguro = true;
          throw erro;
        }
      }),
    criar: (pacienteId: string, dados: Objetivo) =>
      executar(async () => {
        const entrada = objetivoSchema.parse(dados);
        const paciente_id = uuidSchema.parse(pacienteId);
        if (
          !consulta ||
          consulta.reserva ||
          consulta.resultado_pendente ||
          inseguro ||
          encerramento ||
          reconhecimento
        )
          throw new Error('Plano bloqueado');
        const epoca = consulta.epoca;
        const reserva_id = id();
        const chave = id();
        // A chamada pode chegar ao servidor mesmo quando sua resposta se perde.
        inseguro = true;
        cercado = false;
        consulta = null;
        const estado = estadoReservaPlanoSchema.parse(
          await chamar(() => portas.reservar({ epoca, reserva_id, paciente_id }, identidade)),
        );
        verificarIdentidade();
        if (estado !== 'aberta') throw new Error('Reserva não confirmada');
        await chamar(() =>
          portas.criar(
            { entrada, paciente_id, chave, reserva_id, geracao_reserva: epoca },
            identidade,
          ),
        );
        verificarIdentidade();
      }),
    encerrar: () =>
      executar(async () => {
        if (!encerramento) {
          if (!consulta || consulta.resultado_pendente) throw new Error('Consulta necessária');
          encerramento = {
            epoca: consulta.epoca,
            reserva_id: consulta.reserva?.id ?? null,
            comando_id: id(),
          };
        }
        inseguro = true;
        const comando = encerramento;
        const estado = estadoEncerramentoPlanoSchema.parse(
          await chamar(() => portas.encerrar(comando, identidade)),
        );
        verificarIdentidade();
        if (estado !== 'vazia' && estado !== 'cancelada' && estado !== 'confirmada')
          throw new Error('Encerramento não confirmado');
        encerramento = null;
        cercado = true;
        consulta = null;
        return estado;
      }),
    reconhecer: () =>
      executar(async () => {
        if (!reconhecimento) {
          if (!consulta?.resultado_pendente) throw new Error('Resultado pendente necessário');
          reconhecimento = consulta.resultado_pendente.recibo_id;
        }
        inseguro = true;
        const comando_id = reconhecimento;
        const estado = estadoReconhecimentoPlanoSchema.parse(
          await chamar(() => portas.reconhecer({ comando_id }, identidade)),
        );
        verificarIdentidade();
        if (estado !== 'reconhecido') throw new Error('Reconhecimento não confirmado');
        reconhecimento = null;
        cercado = true;
        consulta = null;
        return estado;
      }),
    /** Só após encerramento/reconhecimento confirmado e nova consulta vazia. */
    liberar: () => {
      verificarIdentidade();
      if (
        ocupado ||
        !cercado ||
        encerramento ||
        reconhecimento ||
        !consulta ||
        consulta.reserva ||
        consulta.resultado_pendente
      )
        throw new Error('Plano bloqueado');
      inseguro = false;
    },
  };
}
