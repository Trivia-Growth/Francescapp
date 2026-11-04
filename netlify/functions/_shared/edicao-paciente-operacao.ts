import {
  comandoBarreiraEdicaoPacienteSchema,
  consultaBarreiraEdicaoPacienteResultadoSchema,
  estadoReservaEdicaoPacienteSchema,
  estadoEncerramentoEdicaoPacienteSchema,
  estadoReconhecimentoEdicaoPacienteSchema,
  respostaBarreiraEdicaoPacienteSchema,
} from '../../../packages/contracts/src/barreira-edicao-paciente.ts';
import { prepararBarreiraEdicaoPacientePrivada } from '../../../packages/cadastro/src/barreira-edicao-paciente-privada.ts';
import {
  prepararEdicaoPacientePrivada,
  executarEdicaoPacientePrivada,
} from '../../../packages/cadastro/src/editar-paciente-privado.ts';

type Identidade = { usuario_id: string; session_id: string };
type Autorizacao =
  | { estado: 'autorizado'; identidade: Identidade }
  | { estado: 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel' };
type Comum = {
  autorizar(request: Request): Promise<Autorizacao>;
  revalidar(request: Request): Promise<Autorizacao>;
  metadados(requestId: string): {
    key_id: string;
    emitido_em: string;
    expira_em: string;
    request_id: string;
  };
  atestador: Parameters<typeof prepararBarreiraEdicaoPacientePrivada>[2];
};
async function mesmaSessao(
  request: Request,
  identidade: Identidade,
  revalidar: Comum['revalidar'],
) {
  const atual = await revalidar(request);
  return (
    atual.estado === 'autorizado' &&
    atual.identidade.usuario_id.toLowerCase() === identidade.usuario_id.toLowerCase() &&
    atual.identidade.session_id.toLowerCase() === identidade.session_id.toLowerCase()
  );
}
/** Operação interna; portas devem validar origem e sessão e executar SQL no contexto do solicitante. */
export async function operarBarreiraEdicaoPaciente(
  request: Request,
  entrada: unknown,
  portas: Comum & {
    executar(
      transporte: Awaited<ReturnType<typeof prepararBarreiraEdicaoPacientePrivada>>,
    ): Promise<unknown>;
  },
) {
  const requestId = crypto.randomUUID();
  const erro = (codigo: string) => ({
    ok: false as const,
    erro: { codigo },
    request_id: requestId,
  });
  let iniciada = false;
  try {
    const comando = comandoBarreiraEdicaoPacienteSchema.parse(entrada);
    if (request.signal.aborted) throw new Error();
    const autorizacao = await portas.autorizar(request);
    if (autorizacao.estado !== 'autorizado') return erro(autorizacao.estado);
    if (
      request.headers.get('x-sessao')?.toLowerCase() !==
      autorizacao.identidade.session_id.toLowerCase()
    )
      return erro('nao_autenticado');
    const transporte = await prepararBarreiraEdicaoPacientePrivada(
      comando,
      { ...portas.metadados(requestId), ...autorizacao.identidade },
      portas.atestador,
    );
    if (request.signal.aborted || transporte.entrada.request_id !== requestId) throw new Error();
    iniciada = comando.operacao !== 'api.consultar_barreira_edicao_paciente';
    const resposta = respostaBarreiraEdicaoPacienteSchema.parse(await portas.executar(transporte));
    if (resposta.request_id !== requestId || request.signal.aborted) throw new Error();
    if (resposta.ok) {
      const dados = resposta.dados;
      const valido =
        comando.operacao === 'api.consultar_barreira_edicao_paciente'
          ? consultaBarreiraEdicaoPacienteResultadoSchema.safeParse(dados).success
          : 'estado' in dados &&
            (comando.operacao === 'api.reservar_edicao_paciente'
              ? estadoReservaEdicaoPacienteSchema
              : comando.operacao === 'api.encerrar_edicao_paciente'
                ? estadoEncerramentoEdicaoPacienteSchema
                : estadoReconhecimentoEdicaoPacienteSchema
            ).safeParse(dados.estado).success;
      if (!valido) throw new Error();
    }
    if (
      !(await mesmaSessao(request, autorizacao.identidade, portas.revalidar)) ||
      request.signal.aborted
    )
      return erro(iniciada ? 'pendencia_externa' : 'nao_autenticado');
    return resposta;
  } catch {
    return erro(iniciada ? 'pendencia_externa' : 'servico_indisponivel');
  }
}

/** A resposta privada contém somente ID e versão; leitura posterior exige nova autorização. */
export async function operarEdicaoPaciente(
  request: Request,
  solicitacao: Omit<Parameters<typeof prepararEdicaoPacientePrivada>[0], 'contexto'>,
  portas: Comum &
    Parameters<typeof prepararEdicaoPacientePrivada>[1] & {
      executar(
        entrada: Awaited<ReturnType<typeof prepararEdicaoPacientePrivada>>['p_entrada'],
      ): Promise<unknown>;
    },
) {
  const requestId = crypto.randomUUID();
  const erro = (codigo: string) => ({
    ok: false as const,
    erro: { codigo },
    request_id: requestId,
  });
  let iniciada = false;
  try {
    if (request.signal.aborted) throw new Error();
    const autorizacao = await portas.autorizar(request);
    if (autorizacao.estado !== 'autorizado') return erro(autorizacao.estado);
    if (
      request.headers.get('x-sessao')?.toLowerCase() !==
      autorizacao.identidade.session_id.toLowerCase()
    )
      return erro('nao_autenticado');
    const transporte = await prepararEdicaoPacientePrivada(
      { ...solicitacao, contexto: { ...portas.metadados(requestId), ...autorizacao.identidade } },
      portas,
    );
    if (request.signal.aborted || transporte.p_entrada.entrada.request_id !== requestId)
      throw new Error();
    iniciada = true;
    const resposta = await executarEdicaoPacientePrivada(transporte, portas.executar);
    if (
      request.signal.aborted ||
      !(await mesmaSessao(request, autorizacao.identidade, portas.revalidar))
    )
      return erro('pendencia_externa');
    return resposta;
  } catch {
    return erro(iniciada ? 'pendencia_externa' : 'servico_indisponivel');
  }
}
