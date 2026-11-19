import {
  respostaRealizacaoPrivadaSchema,
  type MotivoBarreira,
  type RealizacaoCompromissos,
  type SituacaoRegistravel,
} from '../../../packages/contracts/src/realizacao-compromisso.ts';
import {
  campoCifradoSchema,
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
  type CampoCifrado,
} from '../../../packages/contracts/src/rpc.ts';
import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';

type Aad = {
  tabela: 'cadastro.realizacao_compromisso';
  registro_id: string;
  versao: number;
  campo: 'observacao';
  formato: 1;
};
type Identidade = { usuario_id: string; session_id: string };
type Autorizacao =
  | { estado: 'autorizado'; identidade: Identidade }
  | { estado: 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel' };
export type ComandoRealizacao =
  | {
      operacao: 'consultar';
      agenda_usuario_id?: string;
      eventos: readonly { evento_id: string; fim?: string | null }[];
    }
  | {
      operacao: 'registrar';
      agenda_usuario_id?: string;
      evento_id: string;
      situacao: SituacaoRegistravel;
      motivo?: MotivoBarreira | null;
      observacao?: string | null;
      evento_destino_id?: string | null;
      versao_esperada: number;
    };

const ACOES = {
  consultar: 'api.consultar_realizacao_compromisso',
  registrar: 'api.registrar_realizacao_compromisso',
} as const;

/** Composição interna do registro de realização (FR-024); sem rota nem privilégio de banco.
 * Autorização, audiência e auditoria pertencem à RPC; aqui só há cifra, atestado e
 * idempotência. O texto livre viaja cifrado nos dois sentidos. */
export async function operarRealizacaoCompromissoNativo(
  request: Request,
  comando: ComandoRealizacao,
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
    if (!(comando.operacao in ACOES)) return erro('entrada_invalida');
    const mutacao = comando.operacao === 'registrar';
    let agenda: string | undefined;
    if (comando.agenda_usuario_id !== undefined) {
      const alvo = uuidSchema.safeParse(comando.agenda_usuario_id);
      if (!alvo.success) return erro('entrada_invalida');
      agenda = alvo.data.toLowerCase();
    }
    let chaveIdempotencia: string | undefined;
    if (mutacao) {
      const chave = chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia'));
      if (!chave.success) return erro('entrada_invalida');
      chaveIdempotencia = chave.data;
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
    const entrada: Record<string, unknown> = { request_id: requestId };
    if (agenda !== undefined) entrada.agenda_usuario_id = agenda;
    let registroId: string | undefined;
    if (comando.operacao === 'consultar') {
      entrada.eventos = comando.eventos.map((item) => {
        const evento: Record<string, unknown> = { evento_id: item.evento_id };
        if (item.fim !== undefined && item.fim !== null) evento.fim = item.fim;
        return evento;
      });
    } else {
      if (
        !Number.isInteger(comando.versao_esperada) ||
        comando.versao_esperada < 0 ||
        comando.versao_esperada >= 2147483646
      )
        return erro('entrada_invalida');
      registroId = crypto.randomUUID();
      const logico: Record<string, unknown> = {
        agenda_usuario_id: agenda ?? null,
        evento_id: comando.evento_id,
        situacao: comando.situacao,
        motivo: comando.motivo ?? null,
        evento_destino_id: comando.evento_destino_id ?? null,
        versao_esperada: comando.versao_esperada,
        // O texto em claro entra no digest: repetir a chave com outro texto é conflito,
        // não sobrescrita silenciosa.
        observacao: comando.observacao ?? null,
      };
      const digest = await portas.idempotencia.calcularDigestIdempotencia(
        portas.atestador.canonicalizar(logico),
      );
      if (!/^[A-Za-z0-9_-]{43}$/.test(digest)) throw new Error();
      Object.assign(entrada, {
        registro_id: registroId,
        evento_id: comando.evento_id,
        situacao: comando.situacao,
        versao_esperada: comando.versao_esperada,
        chave_idempotencia: chaveIdempotencia,
        digest_idempotencia: digest,
      });
      if (comando.motivo !== undefined && comando.motivo !== null) entrada.motivo = comando.motivo;
      if (comando.evento_destino_id !== undefined && comando.evento_destino_id !== null)
        entrada.evento_destino_id = comando.evento_destino_id;
      if (comando.observacao !== undefined && comando.observacao !== null) {
        const aad: Aad = {
          tabela: 'cadastro.realizacao_compromisso',
          registro_id: registroId,
          versao: comando.versao_esperada + 1,
          campo: 'observacao',
          formato: 1,
        };
        entrada.observacao = campoCifradoSchema.parse(
          await portas.cifra.cifrar(comando.observacao, aad),
        );
        entrada.aad = aad;
      }
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
    const resposta = respostaRealizacaoPrivadaSchema.parse(
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
    if (comando.operacao === 'registrar') {
      const alvo = resposta.dados.compromissos.find((item) => item.evento_id === comando.evento_id);
      if (
        !alvo ||
        alvo.versao !== comando.versao_esperada + 1 ||
        alvo.situacao_registrada !== comando.situacao ||
        (!resposta.repeticao && alvo.registro_id?.toLowerCase() !== registroId)
      )
        throw new Error();
    }
    const compromissos = [];
    for (const item of resposta.dados.compromissos) {
      let observacao: string | null = null;
      if (item.observacao) {
        if (!item.registro_id || item.versao < 1) throw new Error();
        observacao = await portas.cifra.decifrar(item.observacao, {
          tabela: 'cadastro.realizacao_compromisso',
          registro_id: item.registro_id.toLowerCase(),
          versao: item.versao,
          campo: 'observacao',
          formato: 1,
        });
      }
      compromissos.push({ ...item, observacao });
    }
    const atual = await portas.revalidar(request);
    if (
      request.signal.aborted ||
      atual.estado !== 'autorizado' ||
      atual.identidade.usuario_id.toLowerCase() !== identidade.usuario_id ||
      atual.identidade.session_id.toLowerCase() !== identidade.session_id
    )
      return erro(iniciada ? 'pendencia_externa' : 'nao_autenticado');
    const dadosPublicos: RealizacaoCompromissos = {
      agenda_usuario_id: resposta.dados.agenda_usuario_id,
      compromissos,
    };
    return { ok: true as const, dados: dadosPublicos, request_id: requestId };
  } catch {
    return erro(iniciada ? 'pendencia_externa' : 'servico_indisponivel');
  }
}
