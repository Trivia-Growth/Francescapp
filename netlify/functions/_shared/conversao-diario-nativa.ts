import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  converterDiarioTarefaSchema,
  respostaConversaoDiarioTarefaPrivadaSchema,
  transporteConversaoDiarioTarefaSchema,
  type ConverterDiarioTarefa,
} from '../../../packages/contracts/src/conversao-diario-tarefa.ts';
import { salvarRegistroDiarioSchema } from '../../../packages/contracts/src/diario.ts';
import type { CampoCifrado, MetadadosAad } from '../../../packages/contracts/src/rpc.ts';
import { prepararGravacaoTarefaNativa } from './tarefa-cuidado-nativo.ts';
import { prepararGravacaoDiarioNativa } from './diario-nativo.ts';
import {
  prepararAtestadoConversao,
  type PortasAtestadoConversao,
} from './conversao-diario-atestado.ts';

type Identidade = { usuario_id: string; session_id: string };
type Autorizacao =
  | { estado: 'autorizado'; identidade: Identidade }
  | { estado: 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel' };
export type ComandoConversaoDiario = { paciente_id: string; origem_id: string } & (
  | { operacao: 'consultar' }
  | { operacao: 'converter'; entrada: ConverterDiarioTarefa }
);
export type PortasConversaoDiario = PortasAtestadoConversao & {
  autorizar(request: Request): Promise<Autorizacao>;
  revalidar(request: Request): Promise<Autorizacao>;
  areas: readonly string[];
  cifra: {
    cifrar(valor: string, aad: MetadadosAad): Promise<CampoCifrado>;
    decifrar(valor: CampoCifrado, aad: MetadadosAad): Promise<string>;
  };
  idempotencia: { calcularDigestIdempotencia(comando: string): Promise<string> };
  executar(
    request: Request,
    transporte: ReturnType<typeof transporteConversaoDiarioTarefaSchema.parse>,
  ): Promise<unknown>;
};
/** Prepara os transportes sem executar filhas; somente a RPC agregada pode gravar. */
export async function operarConversaoDiarioNativa(
  request: Request,
  comando: ComandoConversaoDiario,
  portas: PortasConversaoDiario,
) {
  const requestId = crypto.randomUUID();
  const erro = (codigo: string) => ({
    ok: false as const,
    erro: { codigo },
    request_id: requestId,
  });
  let iniciada = false;
  try {
    const paciente = uuidSchema.safeParse(comando.paciente_id);
    const origem = uuidSchema.safeParse(comando.origem_id);
    if (
      !paciente.success ||
      !origem.success ||
      !['consultar', 'converter'].includes(comando.operacao)
    )
      return erro('entrada_invalida');
    const pacienteId = paciente.data.toLowerCase();
    const origemId = origem.data.toLowerCase();
    const autorizacao = await portas.autorizar(request);
    if (autorizacao.estado !== 'autorizado') return erro(autorizacao.estado);
    const identidade = {
      usuario_id: uuidSchema.parse(autorizacao.identidade.usuario_id).toLowerCase(),
      session_id: uuidSchema.parse(autorizacao.identidade.session_id).toLowerCase(),
    };
    const vigente = async () => {
      const atual = await portas.revalidar(request);
      return (
        !request.signal.aborted &&
        atual.estado === 'autorizado' &&
        atual.identidade.usuario_id.toLowerCase() === identidade.usuario_id &&
        atual.identidade.session_id.toLowerCase() === identidade.session_id
      );
    };
    if (
      request.signal.aborted ||
      request.headers.get('x-sessao')?.toLowerCase() !== identidade.session_id
    )
      return erro('nao_autenticado');
    const autorizacaoTarefa = await prepararAtestadoConversao(
      { request_id: requestId, paciente_id: pacienteId, autorizacao_somente: true },
      'api.ler_tarefas_cuidado',
      identidade,
      requestId,
      portas,
    );
    const entrada: Record<string, unknown> = {
      request_id: requestId,
      paciente_id: pacienteId,
      origem_id: origemId,
      autorizacao_tarefa: autorizacaoTarefa,
    };
    if (comando.operacao === 'converter') {
      const validada = converterDiarioTarefaSchema.safeParse(comando.entrada);
      const chave = chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia'));
      if (!validada.success || !chave.success || !portas.areas.includes(validada.data.area))
        return erro('entrada_invalida');
      const humano = validada.data;
      const tarefaId = humano.tarefa_id.toLowerCase();
      // IDs de reserva, tarefa, evolução e envelopes não definem o comando humano repetido.
      const {
        tarefa_id: _tarefa,
        reserva_id: _reserva,
        geracao_reserva: _geracao,
        ...camposHumanos
      } = humano;
      const digest = await portas.idempotencia.calcularDigestIdempotencia(
        portas.atestador.canonicalizar({
          paciente_id: pacienteId,
          origem_id: origemId,
          ...camposHumanos,
        }),
      );
      if (!/^[A-Za-z0-9_-]{43}$/.test(digest)) throw new Error('Digest inválido.');
      const tarefa = await prepararGravacaoTarefaNativa(
        {
          requestId,
          pacienteId,
          registroId: crypto.randomUUID(),
          identidade,
          chave: chave.data,
          comando: {
            operacao: 'gravar',
            paciente_id: pacienteId,
            tarefa_id: tarefaId,
            reserva_id: humano.reserva_id,
            geracao_reserva: humano.geracao_reserva,
            versao_esperada: 0,
            tarefa: {
              descricao: humano.encaminhamento,
              responsavel: humano.responsavel,
              prazo: humano.prazo,
              prioridade: humano.prioridade,
              estado: 'pendente',
            },
          },
        },
        portas,
      );
      const diarioId = crypto.randomUUID();
      const salvar = salvarRegistroDiarioSchema.parse({
        versao_esperada: 0,
        tipo: 'evolucao_profissional',
        estado: 'publicado',
        audiencia: 'equipe',
        atencao: true,
        retorno_solicitado: false,
        origem_conteudo: 'texto',
        tarefa_id: tarefaId,
        conteudo: {
          data: humano.data_atencao,
          area: humano.area,
          atividade: humano.motivo,
          proximoPasso: humano.encaminhamento,
        },
      });
      const diario = await prepararGravacaoDiarioNativa(
        {
          requestId,
          pacienteId,
          diarioId,
          registroId: crypto.randomUUID(),
          identidade,
          chaveIdempotencia: chave.data,
          salvar,
        },
        portas,
      );
      Object.assign(entrada, {
        origem_versao: humano.origem_versao,
        chave_idempotencia: chave.data,
        digest_idempotencia: digest,
        tarefa,
        diario,
      });
    }
    const transporte = transporteConversaoDiarioTarefaSchema.parse({
      p_transporte: await prepararAtestadoConversao(
        entrada,
        comando.operacao === 'consultar'
          ? 'api.consultar_conversao_diario_tarefa'
          : 'api.converter_diario_tarefa',
        identidade,
        requestId,
        portas,
      ),
    });
    if (!(await vigente())) return erro('nao_autenticado');
    iniciada = comando.operacao === 'converter';
    const resposta = respostaConversaoDiarioTarefaPrivadaSchema.parse(
      await portas.executar(request, transporte),
    );
    if (request.signal.aborted || resposta.request_id !== requestId)
      throw new Error('Resposta não confirmada.');
    if (!resposta.ok)
      return erro(resposta.erro.codigo === 'conflito' ? 'conflito_versao' : resposta.erro.codigo);
    if (
      (comando.operacao === 'converter' && !resposta.dados) ||
      (resposta.dados &&
        (resposta.dados.paciente_id.toLowerCase() !== pacienteId ||
          resposta.dados.origem_id.toLowerCase() !== origemId))
    )
      throw new Error('Recibo incompatível.');
    if (
      comando.operacao === 'converter' &&
      resposta.dados &&
      !resposta.repeticao &&
      (resposta.dados.tarefa_id.toLowerCase() !== comando.entrada.tarefa_id.toLowerCase() ||
        resposta.dados.origem_versao !== comando.entrada.origem_versao ||
        resposta.dados.ator_usuario_id.toLowerCase() !== identidade.usuario_id)
    )
      throw new Error('Recibo incompatível.');
    if (!(await vigente())) return erro(iniciada ? 'pendencia_externa' : 'nao_autenticado');
    return { ok: true as const, dados: resposta.dados, request_id: requestId };
  } catch {
    return erro(iniciada ? 'pendencia_externa' : 'servico_indisponivel');
  }
}
