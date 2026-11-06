import {
  consultaBarreiraTarefaSchema,
  reservarTarefaSchema,
} from '../packages/contracts/src/barreira-tarefa-cuidado.ts';
import {
  estadoEncerramentoCadastroSchema,
  estadoReconhecimentoCadastroSchema,
  estadoReservaCadastroSchema,
  uuidSchema,
} from '../packages/contracts/src/index.ts';

// A conexão das portas exige autenticação, atestação e autorização transacional.
type Identidade = { usuario_id: string; session_id: string };
type Reserva = ReturnType<typeof reservarTarefaSchema.parse>;
type Portas = {
  identidadeAtual(): Identidade | null;
  consultar(identidade: Identidade): Promise<unknown>;
  reservar(entrada: Reserva, identidade: Identidade): Promise<unknown>;
  gravar(entrada: Reserva & { chave: string }, identidade: Identidade): Promise<unknown>;
  encerrar(
    entrada: { epoca: number; reserva_id: string | null; comando_id: string },
    identidade: Identidade,
  ): Promise<unknown>;
  reconhecer(entrada: { comando_id: string }, identidade: Identidade): Promise<unknown>;
};

/** A barreira remota é a fonte de verdade inclusive depois da recarga. */
export function criarCicloTarefaCuidado(portas: Portas, novoId = () => crypto.randomUUID()) {
  const atual = portas.identidadeAtual();
  if (!atual) throw new Error('Sessão indisponível');
  const identidade = Object.freeze({
    usuario_id: uuidSchema.parse(atual.usuario_id).toLowerCase(),
    session_id: uuidSchema.parse(atual.session_id).toLowerCase(),
  });
  let ocupado = false;
  let invalido = false;
  let cercado = false;
  let inseguro = true;
  let consulta: ReturnType<typeof consultaBarreiraTarefaSchema.parse> | null = null;
  let encerramento: { epoca: number; reserva_id: string | null; comando_id: string } | null = null;
  let reconhecimento: string | null = null;
  const id = () => uuidSchema.parse(novoId());
  const verificar = () => {
    const i = portas.identidadeAtual();
    if (
      invalido ||
      !i ||
      i.usuario_id.toLowerCase() !== identidade.usuario_id ||
      i.session_id.toLowerCase() !== identidade.session_id
    ) {
      invalido = true;
      consulta = null;
      encerramento = null;
      reconhecimento = null;
      inseguro = true;
      cercado = false;
      throw new Error('Sessão alterada');
    }
  };
  const chamar = async <T>(fn: () => Promise<T>) => {
    verificar();
    const resultado = await fn();
    verificar();
    return resultado;
  };
  const executar = async <T>(fn: () => Promise<T>) => {
    verificar();
    if (ocupado) throw new Error('Operação em andamento');
    ocupado = true;
    try {
      return await fn();
    } finally {
      ocupado = false;
    }
  };
  return {
    consultar: () =>
      executar(async () => {
        consulta = null;
        try {
          consulta = consultaBarreiraTarefaSchema.parse(
            await chamar(() => portas.consultar(identidade)),
          );
          return consulta;
        } catch (erro) {
          inseguro = true;
          throw erro;
        }
      }),
    gravar: (paciente_id: string, tarefa_id: string, versao_esperada: number) =>
      executar(async () => {
        if (
          !consulta ||
          consulta.reserva ||
          consulta.resultado_pendente ||
          inseguro ||
          encerramento ||
          reconhecimento
        )
          throw new Error('Tarefa bloqueada');
        const entrada = reservarTarefaSchema.parse({
          epoca: consulta.epoca,
          reserva_id: id(),
          paciente_id,
          tarefa_id,
          versao_esperada,
        });
        const chave = id();
        inseguro = true;
        cercado = false;
        consulta = null;
        const estado = estadoReservaCadastroSchema.parse(
          await chamar(() => portas.reservar(entrada, identidade)),
        );
        if (estado !== 'aberta') throw new Error('Reserva não confirmada');
        return chamar(() => portas.gravar({ ...entrada, chave }, identidade));
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
        const estado = estadoEncerramentoCadastroSchema.parse(
          await chamar(() => portas.encerrar(comando, identidade)),
        );
        if (!['vazia', 'cancelada', 'confirmada'].includes(estado))
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
        const estado = estadoReconhecimentoCadastroSchema.parse(
          await chamar(() => portas.reconhecer({ comando_id }, identidade)),
        );
        if (estado !== 'reconhecido') throw new Error('Reconhecimento não confirmado');
        reconhecimento = null;
        cercado = true;
        consulta = null;
        return estado;
      }),
    liberar: () => {
      verificar();
      if (
        ocupado ||
        !cercado ||
        encerramento ||
        reconhecimento ||
        !consulta ||
        consulta.reserva ||
        consulta.resultado_pendente
      )
        throw new Error('Tarefa bloqueada');
      inseguro = false;
    },
  };
}
