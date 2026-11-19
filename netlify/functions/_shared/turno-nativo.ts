import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  aberturaTurnoSchema,
  encerramentoTurnoSchema,
  respostaTurnoPrivadaSchema,
} from '../../../packages/contracts/src/turno.ts';
import {
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
} from '../../../packages/contracts/src/rpc.ts';
import type { operarTarefaCuidadoNativo } from './tarefa-cuidado-nativo.ts';

type Portas = Omit<Parameters<typeof operarTarefaCuidadoNativo>[2], 'cifra'>;
export type ComandoTurno =
  | { operacao: 'consultar_atual'; paciente_id: string }
  | { operacao: 'consultar_ultimo'; paciente_id: string }
  | { operacao: 'consultar'; paciente_id: string; turno_id: string }
  | {
      operacao: 'abrir';
      paciente_id: string;
      turno_id: string;
      reserva_id: string;
      geracao_reserva: number;
    }
  | {
      operacao: 'encerrar';
      paciente_id: string;
      turno_id: string;
      reserva_id: string;
      geracao_reserva: number;
      versao_esperada: number;
      sintese_registro_id: string;
    };

/** Identidade, relógio e parâmetros vêm das fronteiras confiáveis, nunca do navegador. */
export async function operarTurnoNativo(request: Request, comando: ComandoTurno, portas: Portas) {
  const requestId = crypto.randomUUID();
  const erro = (codigo: string) => ({
    ok: false as const,
    erro: { codigo },
    request_id: requestId,
  });
  let iniciada = false;
  try {
    const pacienteId = uuidSchema.parse(comando.paciente_id).toLowerCase();
    const consultaAtual = comando.operacao === 'consultar_atual';
    const consultaUltimo = comando.operacao === 'consultar_ultimo';
    const leitura = consultaAtual || consultaUltimo || comando.operacao === 'consultar';
    const turnoId =
      comando.operacao === 'consultar_atual' || comando.operacao === 'consultar_ultimo'
        ? undefined
        : uuidSchema.parse(comando.turno_id).toLowerCase();
    if (
      !['consultar', 'consultar_atual', 'consultar_ultimo', 'abrir', 'encerrar'].includes(
        comando.operacao,
      )
    )
      return erro('entrada_invalida');
    const autorizacao = await portas.autorizar(request);
    if (autorizacao.estado !== 'autorizado') return erro(autorizacao.estado);
    const identidade = {
      usuario_id: uuidSchema.parse(autorizacao.identidade.usuario_id).toLowerCase(),
      session_id: uuidSchema.parse(autorizacao.identidade.session_id).toLowerCase(),
    };
    if (
      request.signal.aborted ||
      request.headers.get('x-sessao')?.toLowerCase() !== identidade.session_id
    )
      return erro('nao_autenticado');
    const entrada: Record<string, unknown> = {
      request_id: requestId,
      paciente_id: pacienteId,
      ...(turnoId ? { turno_id: turnoId } : {}),
      ...(consultaUltimo ? { modo: 'ultimo' } : {}),
    };
    if (comando.operacao === 'abrir' || comando.operacao === 'encerrar') {
      const { operacao: _operacao, paciente_id: _paciente, ...dados } = comando;
      const validada = (
        comando.operacao === 'abrir' ? aberturaTurnoSchema : encerramentoTurnoSchema
      ).safeParse(dados);
      const chave = chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia'));
      if (!validada.success || !chave.success) return erro('entrada_invalida');
      Object.assign(entrada, validada.data, {
        turno_id: turnoId,
        reserva_id: validada.data.reserva_id.toLowerCase(),
      });
      {
        const digest = await portas.idempotencia.calcularDigestIdempotencia(
          portas.atestador.canonicalizar({
            paciente_id: pacienteId,
            turno_id: turnoId,
            ...(comando.operacao === 'encerrar'
              ? {
                  versao_esperada: comando.versao_esperada,
                  sintese_registro_id: comando.sintese_registro_id,
                }
              : {}),
          }),
        );
        if (!/^[A-Za-z0-9_-]{43}$/.test(digest)) throw new Error();
        Object.assign(entrada, { chave_idempotencia: chave.data, digest_idempotencia: digest });
      }
    }
    const operacoes = {
      abrir: 'api.abrir_turno',
      encerrar: 'api.encerrar_turno',
      consultar: 'api.consultar_turno',
      consultar_atual: 'api.consultar_turno',
      consultar_ultimo: 'api.consultar_turno',
    } as const;
    const metadados = dadosAtestadoSchema.omit({ digest_entrada: true }).parse({
      ...portas.metadados(requestId),
      ...identidade,
      operacao: operacoes[comando.operacao],
    });
    if (metadados.request_id !== requestId) throw new Error();
    const prova = resultadoAtestacaoSchema.parse(
      await portas.atestador.atestarEntrada(metadados, entrada),
    );
    const dados = dadosAtestadoSchema.parse(JSON.parse(prova.dadosCanonicos));
    if (
      portas.atestador.canonicalizar(entrada) !== prova.entradaCanonica ||
      portas.atestador.canonicalizar(dados) !== prova.dadosCanonicos ||
      Object.entries(metadados).some(([k, v]) => dados[k as keyof typeof dados] !== v) ||
      Object.entries(dados).some(([k, v]) => prova.atestado[k as keyof typeof dados] !== v)
    )
      throw new Error();
    const atual = await portas.revalidar(request);
    if (
      request.signal.aborted ||
      atual.estado !== 'autorizado' ||
      atual.identidade.usuario_id.toLowerCase() !== identidade.usuario_id ||
      atual.identidade.session_id.toLowerCase() !== identidade.session_id
    )
      return erro('nao_autenticado');
    iniciada = !leitura;
    const resposta = respostaTurnoPrivadaSchema.parse(
      await portas.executar(request, {
        p_transporte: {
          entrada: { ...entrada, atestado: prova.atestado },
          entrada_canonica: prova.entradaCanonica,
          dados_canonicos: prova.dadosCanonicos,
        },
      }),
    );
    if (request.signal.aborted || resposta.request_id !== requestId) throw new Error();
    if (!resposta.ok) return erro(resposta.erro.codigo);
    if (comando.operacao === 'encerrar' && resposta.dados?.situacao !== 'encerrado')
      return erro('conflito');
    if (
      (!resposta.dados && !leitura) ||
      (resposta.dados &&
        ((!consultaAtual && !consultaUltimo && resposta.dados.turno_id.toLowerCase() !== turnoId) ||
          (consultaAtual && resposta.dados.situacao !== 'aberto') ||
          (comando.operacao === 'encerrar' &&
            (resposta.dados.situacao !== 'encerrado' ||
              resposta.dados.versao !== comando.versao_esperada + 1)) ||
          resposta.dados.paciente_id.toLowerCase() !== pacienteId ||
          resposta.dados.profissional_usuario_id.toLowerCase() !== identidade.usuario_id))
    )
      throw new Error();
    const final = await portas.revalidar(request);
    if (
      request.signal.aborted ||
      final.estado !== 'autorizado' ||
      final.identidade.usuario_id.toLowerCase() !== identidade.usuario_id ||
      final.identidade.session_id.toLowerCase() !== identidade.session_id
    )
      return erro(iniciada ? 'pendencia_externa' : 'nao_autenticado');
    return {
      ok: true as const,
      dados: resposta.dados,
      repeticao: resposta.repeticao,
      request_id: requestId,
    };
  } catch {
    return erro(iniciada ? 'pendencia_externa' : 'servico_indisponivel');
  }
}
