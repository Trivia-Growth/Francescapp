import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  painelSubstituicaoSchema,
  respostaSubstituicaoPrivadaSchema,
  type PainelSubstituicao,
} from '../../../packages/contracts/src/substituicao-case-manager.ts';
import {
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
} from '../../../packages/contracts/src/rpc.ts';

type Identidade = { usuario_id: string; session_id: string };
type Autorizacao =
  | { estado: 'autorizado'; identidade: Identidade }
  | { estado: 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel' };
export type ComandoSubstituicaoCm =
  | { operacao: 'consultar'; paciente_id: string }
  | {
      operacao: 'registrar';
      paciente_id: string;
      substituto_usuario_id: string;
      inicio: string;
      fim: string;
    }
  | { operacao: 'encerrar'; paciente_id: string; substituicao_id: string };

const operacoes = {
  consultar: 'api.consultar_substituicao_cm',
  registrar: 'api.registrar_substituicao_cm',
  encerrar: 'api.encerrar_substituicao_cm',
} as const;

/** Substituição temporária da case manager (FR-037), sem privilégio de banco próprio.
 * O banco autoriza (Administrador), recusa período sobreposto e audita; aqui só há
 * atestado, idempotência e validação de forma. */
export async function operarSubstituicaoCmNativa(
  request: Request,
  comando: ComandoSubstituicaoCm,
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
      | 'responsavel_invalido'
      | 'conflito'
      | 'conflito_idempotencia'
      | 'pendencia_externa',
  ) => ({ ok: false as const, erro: { codigo }, request_id: requestId });
  let iniciada = false;
  try {
    if (request.signal.aborted) return erro('servico_indisponivel');
    const operacao = operacoes[comando.operacao];
    if (!operacao) return erro('entrada_invalida');
    const paciente = uuidSchema.safeParse(comando.paciente_id);
    if (!paciente.success) return erro('entrada_invalida');
    const entrada: Record<string, unknown> = {
      request_id: requestId,
      paciente_id: paciente.data.toLowerCase(),
    };
    let chaveIdempotencia: string | undefined;
    let logico: Record<string, unknown> | undefined;
    let substituicaoId: string | undefined;
    if (comando.operacao !== 'consultar') {
      const chave = chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia'));
      if (!chave.success) return erro('entrada_invalida');
      chaveIdempotencia = chave.data;
    }
    if (comando.operacao === 'registrar') {
      const substituto = uuidSchema.safeParse(comando.substituto_usuario_id);
      const inicio = Date.parse(comando.inicio);
      const fim = Date.parse(comando.fim);
      if (!substituto.success || !Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio)
        return erro('entrada_invalida');
      // O id do registro é gerado aqui para que a repetição do mesmo pedido reencontre a
      // mesma linha no banco, em vez de criar outra.
      substituicaoId = crypto.randomUUID();
      logico = {
        paciente_id: entrada.paciente_id,
        substituto_usuario_id: substituto.data.toLowerCase(),
        inicio: new Date(inicio).toISOString(),
        fim: new Date(fim).toISOString(),
      };
      Object.assign(entrada, {
        substituicao_id: substituicaoId,
        substituto_usuario_id: substituto.data.toLowerCase(),
        inicio: new Date(inicio).toISOString(),
        fim: new Date(fim).toISOString(),
      });
    } else if (comando.operacao === 'encerrar') {
      const alvo = uuidSchema.safeParse(comando.substituicao_id);
      if (!alvo.success) return erro('entrada_invalida');
      substituicaoId = alvo.data.toLowerCase();
      logico = { paciente_id: entrada.paciente_id, substituicao_id: substituicaoId };
      Object.assign(entrada, { substituicao_id: substituicaoId });
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
    if (logico && chaveIdempotencia) {
      const digest = await portas.idempotencia.calcularDigestIdempotencia(
        portas.atestador.canonicalizar({ operacao, ...logico }),
      );
      if (!/^[A-Za-z0-9_-]{43}$/.test(digest)) throw new Error();
      Object.assign(entrada, {
        chave_idempotencia: chaveIdempotencia,
        digest_idempotencia: digest,
      });
    }
    const metadados = dadosAtestadoSchema.omit({ digest_entrada: true }).parse({
      ...portas.metadados(requestId),
      ...identidade,
      operacao,
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
    iniciada = comando.operacao !== 'consultar';
    const resposta = respostaSubstituicaoPrivadaSchema.parse(
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
    const painel: PainelSubstituicao = painelSubstituicaoSchema.parse(resposta.dados);
    if (painel.paciente_id.toLowerCase() !== entrada.paciente_id) throw new Error();
    // O servidor confere o efeito pedido em vez de confiar no que devolveu: registrar deixa
    // o registro nomeado visível; encerrar tira o registro nomeado da vigência.
    if (
      comando.operacao === 'registrar' &&
      !painel.substituicoes.some((item) => item.id.toLowerCase() === substituicaoId)
    )
      throw new Error();
    if (comando.operacao === 'encerrar' && painel.vigente?.id.toLowerCase() === substituicaoId)
      throw new Error();
    const atual = await portas.revalidar(request);
    if (
      request.signal.aborted ||
      atual.estado !== 'autorizado' ||
      atual.identidade.usuario_id.toLowerCase() !== identidade.usuario_id ||
      atual.identidade.session_id.toLowerCase() !== identidade.session_id
    )
      return erro(iniciada ? 'pendencia_externa' : 'nao_autenticado');
    return { ok: true as const, dados: painel, request_id: requestId };
  } catch {
    return erro(iniciada ? 'pendencia_externa' : 'servico_indisponivel');
  }
}
