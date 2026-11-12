import {
  campoCifradoSchema,
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
  type CampoCifrado,
} from '../../../packages/contracts/src/rpc.ts';
import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import { respostaDocumentoPacientePrivadaSchema } from '../../../packages/contracts/src/documento-paciente.ts';

/** Documento versionado e cifrado, um por paciente: mesma forma do blob da anamnese.
 * FR-005 (contexto de cuidado) e FR-002 (rede de cuidado) só diferem em tabela,
 * operação atestada, RPC e validador de domínio — por isso compartilham esta
 * composição em vez de duas cópias que podem divergir num controle de segurança. */
export type TabelaDocumentoPaciente =
  | 'cadastro.contexto_cuidado_versao'
  | 'cadastro.rede_cuidado_versao';

export type DefinicaoDocumentoPaciente<T> = {
  tabela: TabelaDocumentoPaciente;
  operacaoLer: string;
  operacaoGravar: string;
  rpc: 'contexto_cuidado_privado' | 'rede_cuidado_privado';
  validar(entrada: unknown): T;
};

type Aad = {
  tabela: TabelaDocumentoPaciente;
  paciente_id: string;
  registro_id: string;
  versao: number;
  campo: 'conteudo';
  formato: 1;
};
type Identidade = { usuario_id: string; session_id: string };
type Autorizacao =
  | { estado: 'autorizado'; identidade: Identidade }
  | { estado: 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel' };
export type ComandoDocumentoPaciente =
  | { operacao: 'ler'; paciente_id: string }
  | { operacao: 'gravar'; paciente_id: string; versao_esperada: number; conteudo: unknown };

export type PortasDocumentoPaciente = {
  autorizar(request: Request): Promise<Autorizacao>;
  revalidar(request: Request): Promise<Autorizacao>;
  metadados(requestId: string): {
    key_id: string;
    emitido_em: string;
    expira_em: string;
    request_id: string;
  };
  cifra: {
    cifrar(valor: string, aad: Aad): Promise<CampoCifrado>;
    decifrar(valor: CampoCifrado, aad: Aad): Promise<string>;
  };
  idempotencia: { calcularDigestIdempotencia(comandoLogico: string): Promise<string> };
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
};

/** Composição interna, sem rota ou privilégio de banco. A execução deve usar o
 * contexto autenticado da mesma requisição; autorização e auditoria são do banco. */
export async function operarDocumentoPacienteNativo<T>(
  request: Request,
  definicao: DefinicaoDocumentoPaciente<T>,
  comando: ComandoDocumentoPaciente,
  portas: PortasDocumentoPaciente,
) {
  const requestId = crypto.randomUUID();
  const erro = (
    codigo:
      | 'entrada_invalida'
      | 'nao_autenticado'
      | 'sem_permissao'
      | 'conflito_versao'
      | 'conflito_idempotencia'
      | 'servico_indisponivel'
      | 'pendencia_externa',
  ) => ({ ok: false as const, erro: { codigo }, request_id: requestId });
  let iniciada = false;
  try {
    if (request.signal.aborted) return erro('servico_indisponivel');
    const paciente = uuidSchema.safeParse(comando.paciente_id);
    if (!paciente.success || (comando.operacao !== 'ler' && comando.operacao !== 'gravar'))
      return erro('entrada_invalida');
    const pacienteId = paciente.data.toLowerCase();
    let conteudo: T | undefined;
    let chaveIdempotencia: string | undefined;
    if (comando.operacao === 'gravar') {
      const chave = chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia'));
      if (!chave.success) return erro('entrada_invalida');
      chaveIdempotencia = chave.data;
      if (
        !Number.isInteger(comando.versao_esperada) ||
        comando.versao_esperada < 0 ||
        comando.versao_esperada >= 2147483647
      )
        return erro('entrada_invalida');
      try {
        conteudo = definicao.validar(comando.conteudo);
      } catch {
        return erro('entrada_invalida');
      }
      if (new TextEncoder().encode(JSON.stringify(conteudo)).length > 24_000)
        return erro('entrada_invalida');
    }
    const autorizacao = await portas.autorizar(request);
    if (autorizacao.estado !== 'autorizado') return erro(autorizacao.estado);
    if (request.signal.aborted) throw new Error();
    const identidade = {
      usuario_id: uuidSchema.parse(autorizacao.identidade.usuario_id).toLowerCase(),
      session_id: uuidSchema.parse(autorizacao.identidade.session_id).toLowerCase(),
    };
    if (request.headers.get('x-sessao')?.toLowerCase() !== identidade.session_id)
      return erro('nao_autenticado');
    const entrada: Record<string, unknown> = { request_id: requestId, paciente_id: pacienteId };
    if (comando.operacao === 'gravar') {
      const registroId = crypto.randomUUID();
      const aad: Aad = {
        tabela: definicao.tabela,
        paciente_id: pacienteId,
        registro_id: registroId,
        versao: comando.versao_esperada + 1,
        campo: 'conteudo',
        formato: 1,
      };
      const digest = await portas.idempotencia.calcularDigestIdempotencia(
        portas.atestador.canonicalizar({
          tabela: definicao.tabela,
          paciente_id: pacienteId,
          versao_esperada: comando.versao_esperada,
          conteudo,
        }),
      );
      if (!/^[A-Za-z0-9_-]{43}$/.test(digest)) throw new Error();
      Object.assign(entrada, {
        registro_id: registroId,
        chave_idempotencia: chaveIdempotencia,
        digest_idempotencia: digest,
        versao_esperada: comando.versao_esperada,
        conteudo: campoCifradoSchema.parse(
          await portas.cifra.cifrar(JSON.stringify(conteudo), aad),
        ),
        aad,
      });
    }
    const metadados = dadosAtestadoSchema.omit({ digest_entrada: true }).parse({
      ...portas.metadados(requestId),
      ...identidade,
      operacao: comando.operacao === 'gravar' ? definicao.operacaoGravar : definicao.operacaoLer,
    });
    if (metadados.request_id !== requestId) throw new Error();
    const prova = resultadoAtestacaoSchema.parse(
      await portas.atestador.atestarEntrada(metadados, entrada),
    );
    const dados = dadosAtestadoSchema.parse(JSON.parse(prova.dadosCanonicos));
    if (
      portas.atestador.canonicalizar(entrada) !== prova.entradaCanonica ||
      portas.atestador.canonicalizar(dados) !== prova.dadosCanonicos ||
      Object.entries(metadados).some(
        ([chave, valor]) => dados[chave as keyof typeof dados] !== valor,
      ) ||
      Object.entries(dados).some(
        ([chave, valor]) => prova.atestado[chave as keyof typeof dados] !== valor,
      )
    )
      throw new Error();
    if (request.signal.aborted) throw new Error();
    iniciada = comando.operacao === 'gravar';
    // A forma da resposta é idêntica nas duas features; o schema é compartilhado de propósito.
    const resposta = respostaDocumentoPacientePrivadaSchema.parse(
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
    if (
      comando.operacao === 'gravar' &&
      (!resposta.dados ||
        (!resposta.repeticao && resposta.dados.registro_id !== entrada.registro_id) ||
        resposta.dados.versao !== comando.versao_esperada + 1)
    )
      throw new Error();
    let resultado: { versao: number; conteudo: T } | null = null;
    if (resposta.dados) {
      const registro = resposta.dados;
      if (registro.paciente_id.toLowerCase() !== pacienteId) throw new Error();
      const aad: Aad = {
        tabela: definicao.tabela,
        paciente_id: pacienteId,
        registro_id: registro.registro_id.toLowerCase(),
        versao: registro.versao,
        campo: 'conteudo',
        formato: 1,
      };
      const claro = await portas.cifra.decifrar(registro.conteudo, aad);
      resultado = { versao: registro.versao, conteudo: definicao.validar(JSON.parse(claro)) };
    }
    const atual = await portas.revalidar(request);
    if (
      request.signal.aborted ||
      atual.estado !== 'autorizado' ||
      atual.identidade.usuario_id.toLowerCase() !== identidade.usuario_id ||
      atual.identidade.session_id.toLowerCase() !== identidade.session_id
    )
      return erro(iniciada ? 'pendencia_externa' : 'nao_autenticado');
    return { ok: true as const, dados: resultado, request_id: requestId };
  } catch {
    return erro(iniciada ? 'pendencia_externa' : 'servico_indisponivel');
  }
}
