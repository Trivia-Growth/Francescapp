import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  consultaSolicitacaoTitularSchema,
  registrarSolicitacaoTitularSchema,
  responderSolicitacaoTitularSchema,
  respostaSolicitacaoTitularPrivadaSchema,
} from '../../../packages/contracts/src/solicitacao-titular.ts';
import {
  campoCifradoSchema,
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
  type CampoCifrado,
  type MetadadosAad,
} from '../../../packages/contracts/src/rpc.ts';

/** Extraído da união fechada de AAD em vez de redeclarado: assim o `campo` aceito aqui é
 * exatamente o que `cifra-autenticada.ts` valida em tempo de execução. */
type Aad = Extract<MetadadosAad, { tabela: 'cadastro.solicitacao_titular' }>;
type Identidade = { usuario_id: string; session_id: string };
type Autorizacao =
  | { estado: 'autorizado'; identidade: Identidade }
  | { estado: 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel' };
export type ComandoSolicitacaoTitular =
  | { operacao: 'listar'; limite: number; cursor?: string; paciente_id?: string }
  | {
      operacao: 'registrar';
      paciente_id: string;
      tipo: 'acesso' | 'correcao' | 'portabilidade' | 'exclusao';
      descricao: string;
      recebida_em: string;
    }
  | {
      operacao: 'responder';
      solicitacao_id: string;
      medida: 'atendida' | 'atendida_parcialmente' | 'recusada';
      resposta: string;
      versao_esperada: number;
      paciente_id: string;
    };

const OPERACAO_RPC = {
  listar: 'api.listar_solicitacao_titular',
  registrar: 'api.registrar_solicitacao_titular',
  responder: 'api.responder_solicitacao_titular',
} as const;

/** Operação interna sem rota ou grant; o banco autoriza (administrador-only) e audita.
 *
 * O texto da solicitação e o fundamento da resposta são cifrados AQUI, com AAD amarrando o
 * envelope à tabela, ao paciente, à linha, à versão e ao campo. O banco confere o mesmo AAD
 * antes de gravar: envelope de outra solicitação não é aceito no lugar deste.
 *
 * `responder` não apaga nem anonimiza nada — grava medida e fundamento na própria solicitação. */
export async function operarSolicitacaoTitularNativa(
  request: Request,
  comando: ComandoSolicitacaoTitular,
  portas: {
    autorizar(request: Request): Promise<Autorizacao>;
    revalidar(request: Request): Promise<Autorizacao>;
    metadados(requestId: string): {
      key_id: string;
      emitido_em: string;
      expira_em: string;
      request_id: string;
    };
    idempotencia: { calcularDigestIdempotencia(comandoLogico: string): Promise<string> };
    cifra: { cifrar(valor: string, aad: Aad): Promise<CampoCifrado> };
    atestador: {
      canonicalizar(valor: unknown): string;
      atestarEntrada(dados: unknown, entrada: Record<string, unknown>): Promise<unknown>;
    };
    executar(
      request: Request,
      transporte: {
        p_transporte: {
          entrada: Record<string, unknown>;
          entrada_canonica: string;
          dados_canonicos: string;
        };
      },
    ): Promise<unknown>;
  },
) {
  const requestId = crypto.randomUUID();
  const erro = (
    codigo:
      | 'entrada_invalida'
      | 'nao_autenticado'
      | 'sem_permissao'
      | 'servico_indisponivel'
      | 'conflito_versao'
      | 'conflito_idempotencia'
      | 'pendencia_externa',
  ) => ({ ok: false as const, erro: { codigo }, request_id: requestId });
  let iniciada = false;
  try {
    if (request.signal.aborted) return erro('servico_indisponivel');
    const mutacao = comando.operacao !== 'listar';
    let chaveIdempotencia: string | undefined;
    if (mutacao) {
      const chave = chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia'));
      if (!chave.success) return erro('entrada_invalida');
      chaveIdempotencia = chave.data;
    }
    if (comando.operacao === 'listar') {
      if (!consultaSolicitacaoTitularSchema.safeParse(semOperacao(comando)).success)
        return erro('entrada_invalida');
    } else if (comando.operacao === 'registrar') {
      if (!registrarSolicitacaoTitularSchema.safeParse(semOperacao(comando)).success)
        return erro('entrada_invalida');
      if (Date.parse(comando.recebida_em) > Date.now()) return erro('entrada_invalida');
    } else {
      const { paciente_id: _descartado, ...resto } = comando;
      if (!responderSolicitacaoTitularSchema.safeParse(semOperacao(resto)).success)
        return erro('entrada_invalida');
      if (!uuidSchema.safeParse(comando.paciente_id).success) return erro('entrada_invalida');
    }
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

    const entrada: Record<string, unknown> = { request_id: requestId };
    if (comando.operacao === 'listar') {
      entrada.limite = comando.limite;
      if (comando.cursor !== undefined) entrada.cursor = comando.cursor;
      if (comando.paciente_id !== undefined)
        entrada.paciente_id = comando.paciente_id.toLowerCase();
    } else if (comando.operacao === 'registrar') {
      const pacienteId = comando.paciente_id.toLowerCase();
      const registroId = crypto.randomUUID();
      const aad: Aad = {
        tabela: 'cadastro.solicitacao_titular',
        paciente_id: pacienteId,
        registro_id: registroId,
        versao: 1,
        campo: 'descricao',
        formato: 1,
      };
      const digest = await portas.idempotencia.calcularDigestIdempotencia(
        portas.atestador.canonicalizar({
          paciente_id: pacienteId,
          tipo: comando.tipo,
          descricao: comando.descricao,
          recebida_em: comando.recebida_em,
        }),
      );
      if (!/^[A-Za-z0-9_-]{43}$/.test(digest)) throw new Error();
      Object.assign(entrada, {
        paciente_id: pacienteId,
        registro_id: registroId,
        tipo: comando.tipo,
        recebida_em: comando.recebida_em,
        descricao: campoCifradoSchema.parse(await portas.cifra.cifrar(comando.descricao, aad)),
        aad,
        chave_idempotencia: chaveIdempotencia,
        digest_idempotencia: digest,
        auditoria_id: crypto.randomUUID(),
      });
    } else {
      const pacienteId = comando.paciente_id.toLowerCase();
      const solicitacaoId = comando.solicitacao_id.toLowerCase();
      const aad: Aad = {
        tabela: 'cadastro.solicitacao_titular',
        paciente_id: pacienteId,
        registro_id: solicitacaoId,
        versao: comando.versao_esperada + 1,
        campo: 'resposta',
        formato: 1,
      };
      const digest = await portas.idempotencia.calcularDigestIdempotencia(
        portas.atestador.canonicalizar({
          solicitacao_id: solicitacaoId,
          medida: comando.medida,
          resposta: comando.resposta,
          versao_esperada: comando.versao_esperada,
        }),
      );
      if (!/^[A-Za-z0-9_-]{43}$/.test(digest)) throw new Error();
      Object.assign(entrada, {
        solicitacao_id: solicitacaoId,
        medida: comando.medida,
        resposta: campoCifradoSchema.parse(await portas.cifra.cifrar(comando.resposta, aad)),
        versao_esperada: comando.versao_esperada,
        aad,
        chave_idempotencia: chaveIdempotencia,
        digest_idempotencia: digest,
        auditoria_id: crypto.randomUUID(),
      });
    }

    const metadados = dadosAtestadoSchema.omit({ digest_entrada: true }).parse({
      ...portas.metadados(requestId),
      ...identidade,
      operacao: OPERACAO_RPC[comando.operacao],
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
    if (request.signal.aborted) throw new Error();
    iniciada = mutacao;
    const resposta = respostaSolicitacaoTitularPrivadaSchema.parse(
      await portas.executar(request, {
        p_transporte: {
          entrada: { ...entrada, atestado: prova.atestado },
          entrada_canonica: prova.entradaCanonica,
          dados_canonicos: prova.dadosCanonicos,
        },
      }),
    );
    if (request.signal.aborted || resposta.request_id !== requestId) throw new Error();
    if (!resposta.ok)
      return erro(
        resposta.erro.codigo === 'conflito'
          ? 'conflito_versao'
          : resposta.erro.codigo === 'conflito_idempotencia'
            ? 'conflito_idempotencia'
            : 'sem_permissao',
      );
    // A forma da resposta tem que casar com a operação pedida: listar devolve página, registrar
    // e responder devolvem uma solicitação. Discordância aqui é defeito, não erro de usuário.
    const retorno = resposta.dados;
    if (comando.operacao === 'listar') {
      if (!('itens' in retorno) || retorno.itens.length > comando.limite) throw new Error();
    } else {
      if ('itens' in retorno) throw new Error();
      if (
        comando.operacao === 'responder' &&
        (retorno.versao !== comando.versao_esperada + 1 || retorno.estado !== 'respondida')
      )
        throw new Error();
    }
    const atual = await portas.revalidar(request);
    if (
      request.signal.aborted ||
      atual.estado !== 'autorizado' ||
      atual.identidade.usuario_id.toLowerCase() !== identidade.usuario_id ||
      atual.identidade.session_id.toLowerCase() !== identidade.session_id
    )
      return erro(iniciada ? 'pendencia_externa' : 'nao_autenticado');
    return { ok: true as const, dados: retorno, request_id: requestId };
  } catch {
    return erro(iniciada ? 'pendencia_externa' : 'servico_indisponivel');
  }
}

function semOperacao<T extends { operacao?: unknown }>(valor: T): Omit<T, 'operacao'> {
  const { operacao: _descartado, ...resto } = valor;
  return resto;
}
