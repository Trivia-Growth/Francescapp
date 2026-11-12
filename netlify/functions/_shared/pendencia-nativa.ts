import {
  respostaPendenciaPrivadaSchema,
  salvarAcordoSchema,
  tratarPendenciaSchema,
} from '../../../packages/contracts/src/pendencia.ts';
import {
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
} from '../../../packages/contracts/src/rpc.ts';
import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';

type Identidade = { usuario_id: string; session_id: string };
type Autorizacao =
  | { estado: 'autorizado'; identidade: Identidade }
  | {
      estado: 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel' | 'entrada_invalida';
    };

export type ComandoPendencia =
  | { operacao: 'ler'; paciente_id: string }
  | ({ operacao: 'acordar'; paciente_id: string } & Record<string, unknown>)
  | ({ operacao: 'tratar'; paciente_id: string } & Record<string, unknown>);

const OPERACAO_RPC = {
  ler: 'api.listar_pendencias',
  acordar: 'api.gravar_acordo_acompanhamento',
  tratar: 'api.tratar_pendencia',
} as const;

/** Composição interna das pendências do caso (FR-027/FR-028), sem rota ou privilégio de
 * banco. Autorização e auditoria pertencem ao banco; aqui só há atestado e idempotência.
 *
 * Não há cifra nesta fatia e isso é deliberado: acordo, tipo de pendência, chave de origem
 * e ação são estado operacional do acompanhamento — precisam ser filtráveis no banco, como
 * `cadastro.acompanhamento_caso.situacao` e `cadastro.encaminhamento_versao.etapa`. Nenhum
 * texto clínico passa por aqui; o motivo da pendência é gerado pelo próprio derivador a
 * partir de datas, nunca copiado de conteúdo do caso. */
export async function operarPendenciaNativa(
  request: Request,
  comando: ComandoPendencia,
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
      | 'conflito_versao'
      | 'conflito_idempotencia'
      | 'servico_indisponivel'
      | 'pendencia_externa',
  ) => ({ ok: false as const, erro: { codigo }, request_id: requestId });
  let iniciada = false;
  try {
    if (request.signal.aborted) return erro('servico_indisponivel');
    const paciente = uuidSchema.safeParse(comando.paciente_id);
    if (!paciente.success || !(comando.operacao in OPERACAO_RPC)) return erro('entrada_invalida');
    const pacienteId = paciente.data.toLowerCase();
    const entrada: Record<string, unknown> = { request_id: requestId, paciente_id: pacienteId };
    let corpoLogico: Record<string, unknown> | undefined;
    if (comando.operacao !== 'ler') {
      const chave = chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia'));
      if (!chave.success) return erro('entrada_invalida');
      if (comando.operacao === 'acordar') {
        const corpo = salvarAcordoSchema.safeParse(comando);
        if (!corpo.success) return erro('entrada_invalida');
        corpoLogico = { ...corpo.data };
        Object.assign(entrada, {
          versao_esperada: corpo.data.versao_esperada,
          dias_entre_atualizacoes: corpo.data.dias_entre_atualizacoes,
          dias_antecedencia_revisao: corpo.data.dias_antecedencia_revisao,
          dias_retorno_encaminhamento: corpo.data.dias_retorno_encaminhamento,
          proxima_revisao_em: corpo.data.proxima_revisao_em,
        });
      } else {
        const corpo = tratarPendenciaSchema.safeParse(comando);
        if (!corpo.success) return erro('entrada_invalida');
        corpoLogico = { ...corpo.data };
        Object.assign(entrada, {
          tipo: corpo.data.tipo,
          chave_origem: corpo.data.chave_origem,
          acao: corpo.data.acao,
          atribuido_usuario_id: corpo.data.atribuido_usuario_id,
        });
      }
      const digest = await portas.idempotencia.calcularDigestIdempotencia(
        portas.atestador.canonicalizar({ paciente_id: pacienteId, ...corpoLogico }),
      );
      if (!/^[A-Za-z0-9_-]{43}$/.test(digest)) throw new Error();
      Object.assign(entrada, {
        registro_id: crypto.randomUUID(),
        chave_idempotencia: chave.data,
        digest_idempotencia: digest,
      });
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
      Object.entries(metadados).some(
        ([chave, valor]) => dados[chave as keyof typeof dados] !== valor,
      ) ||
      Object.entries(dados).some(
        ([chave, valor]) => prova.atestado[chave as keyof typeof dados] !== valor,
      )
    )
      throw new Error();
    if (request.signal.aborted) throw new Error();
    iniciada = comando.operacao !== 'ler';
    const resposta = respostaPendenciaPrivadaSchema.parse(
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
    if (resposta.dados.paciente_id.toLowerCase() !== pacienteId) throw new Error();
    const atual = await portas.revalidar(request);
    if (
      request.signal.aborted ||
      atual.estado !== 'autorizado' ||
      atual.identidade.usuario_id.toLowerCase() !== identidade.usuario_id ||
      atual.identidade.session_id.toLowerCase() !== identidade.session_id
    )
      return erro(iniciada ? 'pendencia_externa' : 'nao_autenticado');
    return { ok: true as const, dados: resposta.dados, request_id: requestId };
  } catch {
    return erro(iniciada ? 'pendencia_externa' : 'servico_indisponivel');
  }
}
