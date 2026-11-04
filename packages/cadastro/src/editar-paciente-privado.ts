import {
  atualizarPacienteSchema,
  cabecalhosMutacaoSchema,
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
  respostaEdicaoPacientePrivadaSchema,
  uuidSchema,
  type AdaptadorCifra,
  type ResultadoAtestacao,
} from '@ffcmapp/contratos';
import {
  prepararCamposPacienteCifradosParciais,
  prepararMotivoAtualizacaoPaciente,
} from './atualizar-paciente-cifrado.ts';

/** Composição local privada. Não autentica contexto, não concede acesso nem ativa RPC. */
export async function prepararEdicaoPacientePrivada(
  solicitacao: { pacienteId: unknown; corpo: unknown; cabecalhos: unknown; contexto: unknown },
  dependencias: {
    cifra: Pick<AdaptadorCifra, 'cifrar'>;
    idempotencia: { calcularDigestIdempotencia(comandoLogico: string): Promise<string> };
    atestador: {
      canonicalizar(valor: unknown): string;
      atestarEntrada(dados: unknown, entrada: Record<string, unknown>): Promise<ResultadoAtestacao>;
    };
  },
) {
  try {
    const paciente_id = uuidSchema.parse(solicitacao.pacienteId).toLowerCase();
    const corpo = atualizarPacienteSchema.parse(solicitacao.corpo);
    if (corpo.versao_esperada >= 2147483647) throw new Error();
    const cabecalhos = cabecalhosMutacaoSchema.parse(solicitacao.cabecalhos);
    const c = dadosAtestadoSchema
      .omit({ digest_entrada: true, operacao: true })
      .parse(solicitacao.contexto);
    const contexto = {
      ...c,
      usuario_id: c.usuario_id.toLowerCase(),
      session_id: c.session_id.toLowerCase(),
      request_id: c.request_id.toLowerCase(),
    };
    const operacao = 'api.editar_paciente';
    // Comando lógico contém dados pessoais: somente em memória, nunca em logs.
    const logico = dependencias.atestador.canonicalizar({
      operacao,
      usuario_id: contexto.usuario_id,
      paciente_id,
      corpo,
    });
    const digest_idempotencia = await dependencias.idempotencia.calcularDigestIdempotencia(logico);
    if (!/^[A-Za-z0-9_-]{43}$/.test(digest_idempotencia)) throw new Error();
    const campos = await prepararCamposPacienteCifradosParciais(
      paciente_id,
      corpo,
      dependencias.cifra,
    );
    const motivo = await prepararMotivoAtualizacaoPaciente(
      corpo,
      crypto.randomUUID(),
      dependencias.cifra,
    );
    const entrada = {
      request_id: contexto.request_id,
      chave_idempotencia: cabecalhos['x-chave-idempotencia'],
      digest_idempotencia,
      ...campos,
      auditoria_id: motivo.auditoria_id,
      motivo: motivo.motivo,
      aad: { ...campos.aad, motivo: motivo.aad },
    };
    const prova = resultadoAtestacaoSchema.parse(
      await dependencias.atestador.atestarEntrada({ ...contexto, operacao }, entrada),
    );
    const dados = dadosAtestadoSchema.parse(JSON.parse(prova.dadosCanonicos));
    const entradaAssinada = JSON.parse(prova.entradaCanonica) as Record<string, unknown>;
    if (
      dependencias.atestador.canonicalizar(entrada) !== prova.entradaCanonica ||
      dependencias.atestador.canonicalizar(dados) !== prova.dadosCanonicos ||
      dados.operacao !== operacao ||
      dados.key_id !== contexto.key_id ||
      dados.emitido_em !== contexto.emitido_em ||
      dados.expira_em !== contexto.expira_em ||
      dados.request_id !== contexto.request_id ||
      dados.usuario_id !== contexto.usuario_id ||
      dados.session_id !== contexto.session_id
    )
      throw new Error();
    return {
      p_entrada: {
        entrada: {
          ...entradaAssinada,
          paciente_id,
          versao_esperada: corpo.versao_esperada,
          atestado: { ...dados, mac: prova.atestado.mac },
        },
        entrada_canonica: prova.entradaCanonica,
        dados_canonicos: prova.dadosCanonicos,
      },
    };
  } catch {
    throw new Error('Não foi possível preparar a atualização do cadastro.');
  }
}

/** Resposta posterior ao envio pode ser incerta, inclusive em falha de validação. */
export async function executarEdicaoPacientePrivada(
  transporte: Awaited<ReturnType<typeof prepararEdicaoPacientePrivada>>,
  executar: (entrada: typeof transporte.p_entrada) => Promise<unknown>,
) {
  try {
    const resultado = respostaEdicaoPacientePrivadaSchema.parse(
      await executar(transporte.p_entrada),
    );
    if (
      resultado.request_id !== transporte.p_entrada.entrada.atestado.request_id ||
      (resultado.ok &&
        (resultado.dados.paciente_id !== transporte.p_entrada.entrada.paciente_id ||
          resultado.dados.versao !== transporte.p_entrada.entrada.versao_esperada + 1))
    )
      throw new Error();
    return resultado;
  } catch {
    throw new Error('Resultado da atualização incerto.');
  }
}
