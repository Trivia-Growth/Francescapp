import { prepararGravacaoTarefaNativa } from './tarefa-cuidado-nativo.ts';
import { prepararGravacaoDiarioNativa } from './diario-nativo.ts';
import {
  prepararAtestadoConversao,
  type PortasAtestadoConversao,
} from './conversao-diario-atestado.ts';
import { salvarRegistroDiarioSchema } from '../../../packages/contracts/src/diario.ts';
import type { turnoExecucaoHttp } from '../../../packages/contracts/src/turno-execucao-http.ts';
import type { CifraExecucao } from './turno-execucao-projecao.ts';
import type { z } from 'zod';
export async function prepararConversaoOcorrencia(
  humano: z.output<typeof turnoExecucaoHttp.converterOcorrencia.entrada>,
  contexto: {
    paciente: string;
    requestId: string;
    chave: string;
    digest: string;
    identidade: { usuario_id: string; session_id: string };
  },
  portas: PortasAtestadoConversao & {
    cifra: CifraExecucao;
    idempotencia: { calcularDigestIdempotencia(comando: string): Promise<string> };
    areas: readonly string[];
  },
) {
  if (!portas.areas.includes(humano.area)) throw new Error('Área indisponível.');
  const { paciente, requestId, chave, digest, identidade } = contexto;
  const autorizacao = await prepararAtestadoConversao(
    { request_id: requestId, paciente_id: paciente, autorizacao_somente: true },
    'api.ler_tarefas_cuidado',
    identidade,
    requestId,
    portas,
  );
  const tarefa = await prepararGravacaoTarefaNativa(
    {
      requestId,
      pacienteId: paciente,
      registroId: crypto.randomUUID(),
      identidade,
      chave,
      comando: {
        operacao: 'gravar',
        paciente_id: paciente,
        tarefa_id: humano.tarefa_id,
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
  const diario = await prepararGravacaoDiarioNativa(
    {
      requestId,
      pacienteId: paciente,
      diarioId: crypto.randomUUID(),
      registroId: crypto.randomUUID(),
      identidade,
      chaveIdempotencia: chave,
      salvar: salvarRegistroDiarioSchema.parse({
        versao_esperada: 0,
        tipo: 'evolucao_profissional',
        estado: 'publicado',
        audiencia: 'equipe',
        atencao: true,
        retorno_solicitado: false,
        origem_conteudo: 'texto',
        tarefa_id: humano.tarefa_id,
        conteudo: {
          data: humano.data_atencao,
          area: humano.area,
          atividade: humano.motivo,
          proximoPasso: humano.encaminhamento,
        },
      }),
    },
    portas,
  );
  return {
    registro_id: humano.registro_id,
    versao_esperada: humano.origem_versao,
    chave_idempotencia: chave,
    digest_idempotencia: digest,
    autorizacao_tarefa: autorizacao,
    tarefa,
    diario,
  };
}
