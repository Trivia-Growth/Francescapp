import {
  assinaturasRpc,
  campoCifradoSchema,
  cabecalhosMutacaoSchema,
  criarTransporteRpcAtestadaSchema,
  criarPacienteSchema,
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
  reservaCadastroSchema,
  type CampoCifrado,
  type MetadadosAad,
  type ResultadoAtestacao,
} from '@ffcmapp/contratos';
import { prepararNovoContatoCifrado } from './preparar-contato.ts';

type CifraPaciente = {
  cifrar(valor: string, aad: MetadadosAad): Promise<CampoCifrado>;
};

/** Preparação interna ainda não autorizada para uso em RPC; não executar antes de S-02.
 * Caso novo atômico: todos os campos são exigidos e cada contato recebe id e AAD próprios. */
export async function prepararPacienteCifrado(corpo: unknown, cifra: CifraPaciente) {
  try {
    const paciente = criarPacienteSchema.parse(corpo);
    const paciente_id = crypto.randomUUID();
    const aadCampo = <C extends 'nome' | 'nome_preferencia' | 'data_nascimento'>(campo: C) =>
      Object.freeze({
        tabela: 'cadastro.paciente' as const,
        registro_id: paciente_id,
        campo,
        formato: 1 as const,
      });
    const aad = Object.freeze({
      nome: aadCampo('nome'),
      nome_preferencia: aadCampo('nome_preferencia'),
      data_nascimento: aadCampo('data_nascimento'),
    });
    const cifrar = async (metadados: MetadadosAad, valor: string) =>
      campoCifradoSchema.parse(await cifra.cifrar(valor, metadados));
    const contatos = [];
    for (const contato of paciente.contatos)
      contatos.push(await prepararNovoContatoCifrado(contato, cifra));
    return {
      paciente_id,
      nome: await cifrar(aad.nome, paciente.nome),
      nome_preferencia: await cifrar(aad.nome_preferencia, paciente.nome_preferencia),
      data_nascimento: await cifrar(aad.data_nascimento, paciente.data_nascimento),
      contatos,
      situacao: paciente.situacao,
      responsavel_id: paciente.responsavel_id.toLowerCase(),
      aad,
    };
  } catch {
    throw new Error('Não foi possível preparar o cadastro.');
  }
}

/** Experimento server-only. O contexto deve vir de identidade verificada no
 * servidor; esta função não verifica JWT, autorização, validade ou Vault.
 * Não conectar à RPC antes de S-02 e da verificação transacional no banco. */
export async function prepararComandoCriarPaciente(
  solicitacao: { corpo: unknown; cabecalhos: unknown; contexto: unknown; reserva: unknown },
  dependencias: {
    cifra: CifraPaciente;
    /** Porta exclusiva: provisão e separação efetiva de chave ainda não comprovadas. */
    idempotencia: { calcularDigestIdempotencia(comandoLogico: string): Promise<string> };
    atestador: {
      canonicalizar(valor: unknown): string;
      atestarEntrada(dados: unknown, entrada: Record<string, unknown>): Promise<ResultadoAtestacao>;
    };
  },
) {
  try {
    const corpoLido = criarPacienteSchema.parse(solicitacao.corpo);
    // A caixa do UUID não pode mudar o digest de um reenvio idêntico.
    const corpo = { ...corpoLido, responsavel_id: corpoLido.responsavel_id.toLowerCase() };
    const cabecalhos = cabecalhosMutacaoSchema.parse(solicitacao.cabecalhos);
    // Esta validação é estrutural: procedência e vínculo à sessão precisam ser
    // comprovados pelo servidor/banco antes de chamar o preparador.
    const reservaValidada = reservaCadastroSchema.parse(solicitacao.reserva);
    const reserva = { ...reservaValidada, reserva_id: reservaValidada.reserva_id.toLowerCase() };
    const contextoValidado = dadosAtestadoSchema
      .omit({ digest_entrada: true, operacao: true })
      .parse(solicitacao.contexto);
    const contexto = {
      ...contextoValidado,
      usuario_id: contextoValidado.usuario_id.toLowerCase(),
      session_id: contextoValidado.session_id.toLowerCase(),
      request_id: contextoValidado.request_id.toLowerCase(),
    };
    const operacao = 'api.criar_paciente';
    // O comando lógico contém PII: fica apenas em memória e não é registrado.
    const logico = dependencias.atestador.canonicalizar({
      operacao,
      usuario_id: contexto.usuario_id,
      ...reserva,
      corpo,
    });
    const digest_idempotencia = await dependencias.idempotencia.calcularDigestIdempotencia(logico);
    const campos = await prepararPacienteCifrado(corpo, dependencias.cifra);
    const entrada = {
      request_id: contexto.request_id,
      chave_idempotencia: cabecalhos['x-chave-idempotencia'],
      digest_idempotencia,
      auditoria_id: crypto.randomUUID(),
      ...reserva,
      ...campos,
    };
    const prova = resultadoAtestacaoSchema.parse(
      await dependencias.atestador.atestarEntrada({ ...contexto, operacao }, entrada),
    );
    const dadosAssinados = dadosAtestadoSchema.parse(JSON.parse(prova.dadosCanonicos));
    const entradaAssinada = JSON.parse(prova.entradaCanonica) as Record<string, unknown>;
    const transporte = criarTransporteRpcAtestadaSchema('criarPaciente').parse({
      p_entrada: {
        entrada: { ...entradaAssinada, atestado: { ...dadosAssinados, mac: prova.atestado.mac } },
        entrada_canonica: prova.entradaCanonica,
        dados_canonicos: prova.dadosCanonicos,
      },
    });
    return {
      p_entrada: {
        ...transporte.p_entrada,
        entrada: assinaturasRpc.criarPaciente.entrada.parse(transporte.p_entrada.entrada),
      },
    };
  } catch {
    throw new Error('Não foi possível preparar o cadastro.');
  }
}
