import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  painelSubstituicaoSchema,
  respostaSubstituicaoPrivadaSchema,
  type PainelSubstituicao,
  type PainelSubstituicaoPrivado,
} from '../../../packages/contracts/src/substituicao-case-manager.ts';
import {
  dadosAtestadoSchema,
  metadadosAadSubstituicaoCmSchema,
  resultadoAtestacaoSchema,
  type CampoCifrado,
} from '../../../packages/contracts/src/rpc.ts';
import { campoCifradoSchema } from '../../../packages/contracts/src/comum.ts';

/** AAD da fatia: forma genérica do repositório, com `campo` na ligação porque a mesma linha
 * guarda dois motivos. Validado pelo schema antes de ir à cifra. */
type AadSubstituicao = (typeof metadadosAadSubstituicaoCmSchema)['_output'];
const motivoValido = (valor: unknown): valor is string =>
  typeof valor === 'string' && valor.trim().length > 0 && valor.trim().length <= 500;

const aadDe = (registroId: string, campo: 'motivo' | 'motivo_encerramento'): AadSubstituicao =>
  metadadosAadSubstituicaoCmSchema.parse({
    tabela: 'cadastro.substituicao_case_manager',
    registro_id: registroId,
    campo,
    formato: 1,
  });

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
      motivo: string;
    }
  | { operacao: 'encerrar'; paciente_id: string; substituicao_id: string; motivo: string };

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
    cifra: {
      cifrar(valor: string, aad: AadSubstituicao): Promise<CampoCifrado>;
      decifrar(campo: CampoCifrado, aad: AadSubstituicao): Promise<string>;
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
      if (
        !substituto.success ||
        !Number.isFinite(inicio) ||
        !Number.isFinite(fim) ||
        fim <= inicio ||
        !motivoValido(comando.motivo)
      )
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
      if (!alvo.success || !motivoValido(comando.motivo)) return erro('entrada_invalida');
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
    // FR-037: o motivo é obrigatório nas duas alterações de acesso. Cifrado AQUI, depois da
    // autorização e antes do atestado, para que o envelope entre na ligação atestada e o banco
    // nunca veja o texto. O AAD amarra tabela, linha e campo: o envelope de uma substituição não
    // decifra no contexto de outra, nem o do registro no lugar do encerramento. O envelope fica
    // FORA do comando lógico da idempotência porque o nonce muda a cada cifra; repetir o mesmo
    // pedido precisa reencontrar a mesma linha, não criar outra.
    if (comando.operacao !== 'consultar') {
      if (substituicaoId === undefined) throw new Error();
      Object.assign(entrada, {
        [comando.operacao === 'registrar' ? 'motivo_cifrado' : 'motivo_encerramento_cifrado']:
          campoCifradoSchema.parse(
            await portas.cifra.cifrar(
              comando.motivo.trim(),
              aadDe(
                substituicaoId,
                comando.operacao === 'registrar' ? 'motivo' : 'motivo_encerramento',
              ),
            ),
          ),
      });
    }
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
    const privado: PainelSubstituicaoPrivado = resposta.dados;
    if (privado.paciente_id.toLowerCase() !== entrada.paciente_id) throw new Error();
    // Decifra no servidor, com o AAD de cada linha e campo. Envelope adulterado ou de outra
    // substituição não decifra, e a falha fecha a resposta em vez de devolver dado solto.
    const painel: PainelSubstituicao = painelSubstituicaoSchema.parse({
      ...privado,
      substituicoes: await Promise.all(
        privado.substituicoes.map(async (item) => {
          const { motivo_cifrado, motivo_encerramento_cifrado, ...resto } = item;
          return {
            ...resto,
            motivo: await portas.cifra.decifrar(motivo_cifrado, aadDe(item.id, 'motivo')),
            motivo_encerramento:
              motivo_encerramento_cifrado === null
                ? null
                : await portas.cifra.decifrar(
                    motivo_encerramento_cifrado,
                    aadDe(item.id, 'motivo_encerramento'),
                  ),
          };
        }),
      ),
    });
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
