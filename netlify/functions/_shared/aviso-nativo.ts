import {
  marcarAvisoLidoSchema,
  respostaAvisosPrivadaSchema,
} from '../../../packages/contracts/src/aviso.ts';
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

export type ComandoAviso =
  | { operacao: 'listar' }
  | ({ operacao: 'marcar_lido' } & Record<string, unknown>);

const OPERACAO_RPC = {
  listar: 'api.listar_avisos',
  marcar_lido: 'api.marcar_aviso_lido',
} as const;

/** Composição interna dos avisos no aplicativo (FR-072), sem rota ou privilégio de banco.
 *
 * Não há cifra nesta fatia e isso é deliberado: o aviso é projeção, e o que viaja são
 * referências — tipo da origem, caso, chave da instância e instante. Nenhum texto do caso
 * passa por aqui; o único `motivo` existente é o da pendência de FR-027, gerado pelo
 * derivador do banco a partir de datas.
 *
 * Também não há nada que saia do produto: nenhuma porta de envio, nenhum token de
 * dispositivo, nenhum canal externo. Autorização, audiência e auditoria pertencem ao
 * banco; aqui só há atestado e idempotência. */
export async function operarAvisoNativo(
  request: Request,
  comando: ComandoAviso,
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
    if (!(comando.operacao in OPERACAO_RPC)) return erro('entrada_invalida');
    const entrada: Record<string, unknown> = { request_id: requestId };
    if (comando.operacao === 'marcar_lido') {
      const chave = chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia'));
      if (!chave.success) return erro('entrada_invalida');
      const corpo = marcarAvisoLidoSchema.safeParse(comando);
      if (!corpo.success) return erro('entrada_invalida');
      const pacienteId = corpo.data.paciente_id.toLowerCase();
      const digest = await portas.idempotencia.calcularDigestIdempotencia(
        portas.atestador.canonicalizar({
          paciente_id: pacienteId,
          tipo: corpo.data.tipo,
          chave_origem: corpo.data.chave_origem,
        }),
      );
      if (!/^[A-Za-z0-9_-]{43}$/.test(digest)) throw new Error();
      Object.assign(entrada, {
        paciente_id: pacienteId,
        tipo: corpo.data.tipo,
        chave_origem: corpo.data.chave_origem,
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
    iniciada = comando.operacao !== 'listar';
    const resposta = respostaAvisosPrivadaSchema.parse(
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
    // O indicador vem do banco; a tela nunca o infere. A lista é truncada em 200 itens,
    // então a igualdade só vale abaixo do teto; acima dele, o indicador só pode ser maior.
    const naoLidosNaPagina = resposta.dados.itens.filter((item) => !item.lido).length;
    if (
      resposta.dados.itens.length < 200
        ? resposta.dados.nao_lidos !== naoLidosNaPagina
        : resposta.dados.nao_lidos < naoLidosNaPagina
    )
      throw new Error();
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
