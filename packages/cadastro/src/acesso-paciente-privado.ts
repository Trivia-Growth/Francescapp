import {
  assinaturasRpc,
  campoCifradoSchema,
  cabecalhosMutacaoSchema,
  criarAcessoPacienteSchema,
  criarTransporteRpcAtestadaSchema,
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
  revogarAcessoPacienteSchema,
  uuidSchema,
  type AdaptadorCifra,
  type ResultadoAtestacao,
} from '@ffcmapp/contratos';
import {
  prepararConcessaoAcessoPaciente,
  prepararRevogacaoAcessoPaciente,
} from './preparar-acesso-paciente.ts';

type Dependencias = {
  cifra: Pick<AdaptadorCifra, 'cifrar'>;
  idempotencia: { calcularDigestIdempotencia(comandoLogico: string): Promise<string> };
  atestador: {
    canonicalizar(valor: unknown): string;
    atestarEntrada(dados: unknown, entrada: Record<string, unknown>): Promise<ResultadoAtestacao>;
  };
};

/** Composição privada experimental. Não autentica, autoriza ou ativa a RPC. */
export async function prepararAcessoPacientePrivado(
  solicitacao: {
    acao: 'conceder' | 'revogar';
    pacienteId: unknown;
    acessoId: unknown;
    reservaId?: unknown;
    geracaoReserva?: unknown;
    corpo: unknown;
    cabecalhos: unknown;
    contexto: unknown;
  },
  dependencias: Dependencias,
) {
  try {
    if (solicitacao.acao !== 'conceder' && solicitacao.acao !== 'revogar') throw new Error();
    const acao = solicitacao.acao;
    const paciente_id = uuidSchema.parse(solicitacao.pacienteId).toLowerCase();
    const acesso_id = uuidSchema.parse(solicitacao.acessoId).toLowerCase();
    const corpo =
      acao === 'conceder'
        ? criarAcessoPacienteSchema.parse(solicitacao.corpo)
        : revogarAcessoPacienteSchema.parse(solicitacao.corpo);
    if ('versao_esperada' in corpo && corpo.versao_esperada >= 2147483647) throw new Error();
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
    const rota = acao === 'conceder' ? 'criarAcessoPaciente' : 'revogarAcessoPaciente';
    const operacao = assinaturasRpc[rota].rpc;
    // Dados pessoais do comando lógico permanecem apenas em memória.
    const logico = dependencias.atestador.canonicalizar({
      operacao,
      usuario_id: contexto.usuario_id,
      paciente_id,
      acesso_id,
      corpo,
    });
    const digest_idempotencia = await dependencias.idempotencia.calcularDigestIdempotencia(logico);
    if (!/^[A-Za-z0-9_-]{43}$/.test(digest_idempotencia)) throw new Error();
    const snapshot = { pacienteId: paciente_id, acessoId: acesso_id, corpo };
    const preparado =
      acao === 'conceder'
        ? await prepararConcessaoAcessoPaciente(snapshot, dependencias.cifra)
        : await prepararRevogacaoAcessoPaciente(snapshot, dependencias.cifra);
    const auditoria_id = crypto.randomUUID();
    const motivoAuditoria =
      acao === 'revogar'
        ? {
            motivo_auditoria: campoCifradoSchema.parse(
              await dependencias.cifra.cifrar(corpo.motivo, {
                tabela: 'auditoria.evento',
                registro_id: auditoria_id,
                campo: 'motivo',
                formato: 1,
              }),
            ),
          }
        : {};
    const entrada = {
      request_id: contexto.request_id,
      chave_idempotencia: cabecalhos['x-chave-idempotencia'],
      digest_idempotencia,
      auditoria_id,
      ...preparado,
      reserva_id: uuidSchema.parse(solicitacao.reservaId).toLowerCase(),
      geracao_reserva: assinaturasRpc.criarAcessoPaciente.entrada.shape.geracao_reserva.parse(
        solicitacao.geracaoReserva,
      ),
      ...motivoAuditoria,
    };
    const prova = resultadoAtestacaoSchema.parse(
      await dependencias.atestador.atestarEntrada({ ...contexto, operacao }, entrada),
    );
    const dados = dadosAtestadoSchema.parse(JSON.parse(prova.dadosCanonicos));
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
    const transporte = criarTransporteRpcAtestadaSchema(rota).parse({
      p_entrada: {
        entrada: { ...entrada, atestado: { ...dados, mac: prova.atestado.mac } },
        entrada_canonica: prova.entradaCanonica,
        dados_canonicos: prova.dadosCanonicos,
      },
    });
    return { rota, ...transporte } as const;
  } catch {
    throw new Error('Não foi possível preparar a gestão de acesso.');
  }
}

/** Falha após envio pode representar resultado incerto. */
export async function executarAcessoPacientePrivado(
  transporte: Awaited<ReturnType<typeof prepararAcessoPacientePrivado>>,
  executar: (
    rota: typeof transporte.rota,
    entrada: typeof transporte.p_entrada,
  ) => Promise<unknown>,
) {
  try {
    const resultado = assinaturasRpc[transporte.rota].saida.parse(
      await executar(transporte.rota, transporte.p_entrada),
    );
    const entrada = transporte.p_entrada.entrada;
    if (!('acesso_id' in entrada)) throw new Error();
    if (
      resultado.request_id !== entrada.request_id ||
      (resultado.ok &&
        (resultado.dados.id !== entrada.acesso_id ||
          ('versao_esperada' in entrada && resultado.dados.versao !== entrada.versao_esperada + 1)))
    )
      throw new Error();
    return resultado;
  } catch {
    throw new Error('Resultado da gestão de acesso incerto.');
  }
}
