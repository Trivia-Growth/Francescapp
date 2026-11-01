import {
  assinaturasRpc,
  criarTransporteRpcAtestadaSchema,
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
  type ResultadoAtestacao,
} from '@ffcmapp/contratos';

/** Somente server-side experimental. Não autentica, autoriza ou valida prazo;
 * não conectar a RPC antes da S-02 e da verificação transacional no banco. */
export async function prepararCarteiraExperimental(
  solicitacao: { contexto: unknown; consulta: unknown },
  atestador: {
    atestarEntrada(dados: unknown, entrada: Record<string, unknown>): Promise<ResultadoAtestacao>;
  },
) {
  try {
    const validado = dadosAtestadoSchema
      .omit({ operacao: true, digest_entrada: true })
      .parse(solicitacao.contexto);
    const contexto = {
      ...validado,
      usuario_id: validado.usuario_id.toLowerCase(),
      session_id: validado.session_id.toLowerCase(),
      request_id: validado.request_id.toLowerCase(),
    };
    const consulta = assinaturasRpc.listarPacientes.entrada
      .omit({ atestado: true, request_id: true })
      .parse(solicitacao.consulta);
    const entrada = { ...consulta, request_id: contexto.request_id };
    const metadados = { ...contexto, operacao: 'api.listar_pacientes' };
    const prova = resultadoAtestacaoSchema.parse(
      await atestador.atestarEntrada({ ...metadados }, { ...entrada }),
    );
    const dados = dadosAtestadoSchema.parse(JSON.parse(prova.dadosCanonicos));
    const entradaAssinada = assinaturasRpc.listarPacientes.entrada
      .omit({ atestado: true })
      .parse(JSON.parse(prova.entradaCanonica));
    if (
      entradaAssinada.request_id !== entrada.request_id ||
      entradaAssinada.limite !== entrada.limite ||
      entradaAssinada.cursor !== entrada.cursor ||
      Object.entries(metadados).some(
        ([campo, valor]) => dados[campo as keyof typeof metadados] !== valor,
      )
    )
      throw new Error();
    const transporte = criarTransporteRpcAtestadaSchema('listarPacientes').parse({
      p_entrada: {
        entrada: { ...entradaAssinada, atestado: { ...dados, mac: prova.atestado.mac } },
        entrada_canonica: prova.entradaCanonica,
        dados_canonicos: prova.dadosCanonicos,
      },
    });
    return {
      p_entrada: {
        ...transporte.p_entrada,
        entrada: assinaturasRpc.listarPacientes.entrada.parse(transporte.p_entrada.entrada),
      },
    };
  } catch {
    throw new Error('Não foi possível preparar a carteira.');
  }
}
