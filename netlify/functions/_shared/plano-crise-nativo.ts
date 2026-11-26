import {
  respostaPlanoCrisePrivadaSchema,
  validarPlanoCrise,
} from '../../../packages/contracts/src/plano-crise.ts';
import {
  campoCifradoSchema,
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
  type CampoCifrado,
} from '../../../packages/contracts/src/rpc.ts';
import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';

type Aad = {
  tabela: 'cadastro.plano_crise_versao';
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
type Comando =
  | { operacao: 'ler'; paciente_id: string }
  | { operacao: 'gravar'; paciente_id: string; versao_esperada: number; conteudo: unknown }
  | { operacao: 'aprovar'; paciente_id: string; registro_id: string; versao: number };

const ACOES = {
  ler: 'api.ler_plano_crise',
  gravar: 'api.gravar_plano_crise',
  aprovar: 'api.aprovar_plano_crise',
} as const;

/** Composição interna do plano de crise (FR-020), sem rota ou privilégio de banco.
 * Autorização e auditoria pertencem ao banco — inclusive a marca de habilitação exigida
 * para aprovar; aqui só há cifra, atestado e idempotência. */
export async function operarPlanoCriseNativo(
  request: Request,
  comando: Comando,
  portas: {
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
    idempotencia: {
      calcularDigestIdempotencia(comandoLogico: string): Promise<string>;
    };
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
      | 'conflito_versao'
      | 'conflito_idempotencia'
      | 'servico_indisponivel'
      | 'pendencia_externa',
  ) => ({ ok: false as const, erro: { codigo }, request_id: requestId });
  let iniciada = false;
  try {
    if (request.signal.aborted) return erro('servico_indisponivel');
    const paciente = uuidSchema.safeParse(comando.paciente_id);
    if (!paciente.success || !(comando.operacao in ACOES)) return erro('entrada_invalida');
    const pacienteId = paciente.data.toLowerCase();
    const mutacao = comando.operacao !== 'ler';
    let conteudo: ReturnType<typeof validarPlanoCrise> | undefined;
    let chaveIdempotencia: string | undefined;
    if (mutacao) {
      const chave = chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia'));
      if (!chave.success) return erro('entrada_invalida');
      chaveIdempotencia = chave.data;
    }
    if (comando.operacao === 'gravar') {
      if (
        !Number.isInteger(comando.versao_esperada) ||
        comando.versao_esperada < 0 ||
        comando.versao_esperada >= 2147483647
      )
        return erro('entrada_invalida');
      try {
        conteudo = validarPlanoCrise(comando.conteudo);
      } catch {
        return erro('entrada_invalida');
      }
      if (new TextEncoder().encode(JSON.stringify(conteudo)).length > 24_000)
        return erro('entrada_invalida');
    }
    if (comando.operacao === 'aprovar') {
      const registro = uuidSchema.safeParse(comando.registro_id);
      if (
        !registro.success ||
        !Number.isInteger(comando.versao) ||
        comando.versao < 1 ||
        comando.versao >= 2147483647
      )
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
        tabela: 'cadastro.plano_crise_versao',
        paciente_id: pacienteId,
        registro_id: registroId,
        versao: comando.versao_esperada + 1,
        campo: 'conteudo',
        formato: 1,
      };
      const digest = await portas.idempotencia.calcularDigestIdempotencia(
        portas.atestador.canonicalizar({
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
    if (comando.operacao === 'aprovar') {
      const registroId = uuidSchema.parse(comando.registro_id).toLowerCase();
      const digest = await portas.idempotencia.calcularDigestIdempotencia(
        portas.atestador.canonicalizar({
          paciente_id: pacienteId,
          registro_id: registroId,
          versao: comando.versao,
        }),
      );
      if (!/^[A-Za-z0-9_-]{43}$/.test(digest)) throw new Error();
      Object.assign(entrada, {
        registro_id: registroId,
        versao: comando.versao,
        chave_idempotencia: chaveIdempotencia,
        digest_idempotencia: digest,
      });
    }
    const metadados = dadosAtestadoSchema.omit({ digest_entrada: true }).parse({
      ...portas.metadados(requestId),
      ...identidade,
      operacao: ACOES[comando.operacao],
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
    iniciada = mutacao;
    const resposta = respostaPlanoCrisePrivadaSchema.parse(
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
    if (mutacao && !resposta.dados) throw new Error();
    if (
      comando.operacao === 'gravar' &&
      resposta.dados &&
      ((!resposta.repeticao && resposta.dados.registro_id !== entrada.registro_id) ||
        resposta.dados.versao !== comando.versao_esperada + 1)
    )
      throw new Error();
    if (
      comando.operacao === 'aprovar' &&
      resposta.dados &&
      (resposta.dados.versao !== comando.versao ||
        resposta.dados.registro_id.toLowerCase() !== entrada.registro_id ||
        !resposta.dados.aprovacao)
    )
      throw new Error();
    let resultado = null;
    if (resposta.dados) {
      const registro = resposta.dados;
      if (registro.paciente_id.toLowerCase() !== pacienteId) throw new Error();
      const aad: Aad = {
        tabela: 'cadastro.plano_crise_versao',
        paciente_id: pacienteId,
        registro_id: registro.registro_id.toLowerCase(),
        versao: registro.versao,
        campo: 'conteudo',
        formato: 1,
      };
      const texto = await portas.cifra.decifrar(registro.conteudo, aad);
      resultado = {
        registro_id: registro.registro_id,
        versao: registro.versao,
        conteudo: validarPlanoCrise(JSON.parse(texto)),
        aprovacao: registro.aprovacao,
      };
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
