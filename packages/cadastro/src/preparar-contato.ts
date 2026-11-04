import {
  assinaturasRpc,
  cabecalhosMutacaoSchema,
  campoCifradoSchema,
  criarTransporteRpcAtestadaSchema,
  dadosAtestadoSchema,
  novoContatoSchema,
  resultadoAtestacaoSchema,
  uuidSchema,
  type AdaptadorCifra,
} from '@ffcmapp/contratos';
import type { prepararComandoCriarPaciente } from './preparar-paciente.ts';

/** Apenas servidor; não conectar a operações protegidas antes da S-02. */
export async function prepararNovoContatoCifrado(
  corpo: unknown,
  cifra: Pick<AdaptadorCifra, 'cifrar'>,
) {
  try {
    const contato = novoContatoSchema.parse(corpo);
    const contato_id = crypto.randomUUID();
    const aad = Object.freeze({
      tabela: 'cadastro.contato_paciente' as const,
      registro_id: contato_id,
      campo: 'valor' as const,
      formato: 1 as const,
    });
    const valor = campoCifradoSchema.parse(await cifra.cifrar(contato.valor, aad));
    return { contato_id, tipo: contato.tipo, valor, aad };
  } catch {
    throw new Error('Não foi possível preparar o contato.');
  }
}

/** Experimento server-only; não conectar antes da S-02 e autorização no banco. */
export async function prepararComandoCriarContato(
  solicitacao: {
    pacienteId: unknown;
    corpo: unknown;
    cabecalhos: unknown;
    contexto: unknown;
    reservaId?: unknown;
    geracaoReserva?: unknown;
  },
  dependencias: Parameters<typeof prepararComandoCriarPaciente>[1],
) {
  try {
    const paciente_id = uuidSchema.parse(solicitacao.pacienteId).toLowerCase();
    const reserva_id = uuidSchema.parse(solicitacao.reservaId).toLowerCase();
    const geracao_reserva = solicitacao.geracaoReserva;
    if (
      typeof geracao_reserva !== 'number' ||
      !Number.isSafeInteger(geracao_reserva) ||
      geracao_reserva < 1
    )
      throw new Error('Geração inválida.');
    const corpo = novoContatoSchema.parse(solicitacao.corpo);
    const cabecalhos = cabecalhosMutacaoSchema.parse(solicitacao.cabecalhos);
    const contextoValidado = dadosAtestadoSchema
      .omit({ digest_entrada: true, operacao: true })
      .parse(solicitacao.contexto);
    const contexto = {
      ...contextoValidado,
      usuario_id: contextoValidado.usuario_id.toLowerCase(),
      session_id: contextoValidado.session_id.toLowerCase(),
      request_id: contextoValidado.request_id.toLowerCase(),
    };
    const operacao = 'api.criar_contato_paciente';
    const logico = dependencias.atestador.canonicalizar({
      operacao,
      usuario_id: contexto.usuario_id,
      paciente_id,
      corpo,
    });
    const digest_idempotencia = await dependencias.idempotencia.calcularDigestIdempotencia(logico);
    const campos = await prepararNovoContatoCifrado(corpo, dependencias.cifra);
    const entrada = {
      request_id: contexto.request_id,
      chave_idempotencia: cabecalhos['x-chave-idempotencia'],
      digest_idempotencia,
      auditoria_id: crypto.randomUUID(),
      paciente_id,
      reserva_id,
      geracao_reserva,
      ...campos,
    };
    const prova = resultadoAtestacaoSchema.parse(
      await dependencias.atestador.atestarEntrada({ ...contexto, operacao }, entrada),
    );
    const dadosAssinados = dadosAtestadoSchema.parse(JSON.parse(prova.dadosCanonicos));
    const entradaAssinada = JSON.parse(prova.entradaCanonica) as Record<string, unknown>;
    const transporte = criarTransporteRpcAtestadaSchema('criarContato').parse({
      p_entrada: {
        entrada: { ...entradaAssinada, atestado: { ...dadosAssinados, mac: prova.atestado.mac } },
        entrada_canonica: prova.entradaCanonica,
        dados_canonicos: prova.dadosCanonicos,
      },
    });
    return {
      p_entrada: {
        ...transporte.p_entrada,
        entrada: assinaturasRpc.criarContato.entrada.parse(transporte.p_entrada.entrada),
      },
    };
  } catch {
    throw new Error('Não foi possível preparar o contato.');
  }
}
