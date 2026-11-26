import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
  campoCifradoSchema,
  type CampoCifrado,
} from '../../../packages/contracts/src/rpc.ts';
import {
  AUDIO_BYTES_MAXIMO,
  juntarAudio,
  mimeAudioSchema,
  partirAudio,
  respostaTranscricaoPrivadaSchema,
  textoTranscricaoSchema,
  type MimeAudio,
  type Transcricao,
} from '../../../packages/contracts/src/transcricao.ts';

type Aad = {
  tabela: 'cadastro.audio_transcricao';
  paciente_id: string;
  registro_id: string;
  parte: number;
  campo: 'audio' | 'transcricao' | 'texto_revisado';
  formato: 1;
};
type Identidade = { usuario_id: string; session_id: string };
type Autorizacao =
  | { estado: 'autorizado'; identidade: Identidade }
  | { estado: 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel' };

export type ComandoTranscricao =
  | {
      operacao: 'registrar';
      paciente_id: string;
      audio_base64: string;
      mime: MimeAudio;
      duracao_segundos: number;
    }
  | { operacao: 'ouvir'; paciente_id: string; audio_id: string }
  | { operacao: 'confirmarRevisao'; paciente_id: string; audio_id: string; texto_revisado: string }
  | { operacao: 'excluirAudio'; paciente_id: string; audio_id: string };

const ACAO = {
  registrar: 'api.registrar_audio_transcricao',
  ouvir: 'api.ler_audio_transcricao',
  confirmarRevisao: 'api.confirmar_revisao_audio',
  excluirAudio: 'api.excluir_audio_transcricao',
} as const;

/** Composição interna da fatia de transcrição (FR-010), sem rota ou privilégio de banco.
 * Autorização e auditoria pertencem ao banco; aqui há cifra, atestado, idempotência e a
 * chamada ao provedor.
 *
 * Ordem deliberada em `registrar`: transcreve ANTES de gravar. Guardar o áudio e só depois
 * descobrir que o provedor não respondeu deixaria um registro sem rascunho, que o requisito
 * não prevê e que a tela não saberia apresentar. Se o provedor falha, nada é persistido e o
 * profissional continua com a alternativa por texto, que nunca depende disto. */
export async function operarTranscricaoNativa(
  request: Request,
  comando: ComandoTranscricao,
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
    /** Teto de duração vindo da configuração no banco, já limitado pelo teto absoluto. */
    duracaoMaxima: number;
    /** Modelo vindo da configuração no banco, já validado contra o catálogo. */
    modelo: string;
    transcrever(entrada: {
      audioBase64: string;
      mime: MimeAudio;
      modelo: string;
      signal?: AbortSignal;
    }): Promise<string>;
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
      | 'nao_encontrado'
      | 'conflito_versao'
      | 'conflito_idempotencia'
      | 'servico_indisponivel'
      | 'pendencia_externa',
  ) => ({ ok: false as const, erro: { codigo }, request_id: requestId });
  let iniciada = false;
  try {
    if (request.signal.aborted) return erro('servico_indisponivel');
    const paciente = uuidSchema.safeParse(comando.paciente_id);
    if (!paciente.success || !(comando.operacao in ACAO)) return erro('entrada_invalida');
    const pacienteId = paciente.data.toLowerCase();

    let registroId: string;
    if (comando.operacao === 'registrar') {
      registroId = crypto.randomUUID();
    } else {
      const alvo = uuidSchema.safeParse(comando.audio_id);
      if (!alvo.success) return erro('entrada_invalida');
      registroId = alvo.data.toLowerCase();
    }

    let chaveIdempotencia: string | undefined;
    if (comando.operacao === 'registrar' || comando.operacao === 'confirmarRevisao') {
      const chave = chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia'));
      if (!chave.success) return erro('entrada_invalida');
      chaveIdempotencia = chave.data;
    }

    // Validação da entrada antes de qualquer trabalho caro: um áudio fora do teto não deve
    // chegar a ocupar o provedor nem a ser cifrado.
    let partes: string[] | undefined;
    let duracao = 0;
    let mime: MimeAudio | undefined;
    if (comando.operacao === 'registrar') {
      const formato = mimeAudioSchema.safeParse(comando.mime);
      if (!formato.success) return erro('entrada_invalida');
      mime = formato.data;
      if (
        !Number.isInteger(comando.duracao_segundos) ||
        comando.duracao_segundos < 1 ||
        comando.duracao_segundos > portas.duracaoMaxima
      )
        return erro('entrada_invalida');
      duracao = comando.duracao_segundos;
      try {
        partes = partirAudio(comando.audio_base64);
      } catch {
        return erro('entrada_invalida');
      }
    }
    let textoRevisado: string | undefined;
    if (comando.operacao === 'confirmarRevisao') {
      const texto = textoTranscricaoSchema.safeParse(comando.texto_revisado);
      if (!texto.success) return erro('entrada_invalida');
      textoRevisado = texto.data;
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

    const aadDe = (campo: Aad['campo'], parte: number): Aad => ({
      tabela: 'cadastro.audio_transcricao',
      paciente_id: pacienteId,
      registro_id: registroId,
      parte,
      campo,
      formato: 1,
    });

    const entrada: Record<string, unknown> = {
      request_id: requestId,
      paciente_id: pacienteId,
      registro_id: registroId,
    };

    if (comando.operacao === 'registrar' && partes && mime) {
      // Só agora o áudio sai daqui. A autorização já passou, então não mandamos gravação de
      // quem não tem vínculo com o caso ao provedor externo.
      const transcricao = await portas.transcrever({
        audioBase64: comando.audio_base64,
        mime,
        modelo: portas.modelo,
        signal: request.signal,
      });
      const texto = textoTranscricaoSchema.parse(transcricao);
      if (request.signal.aborted) throw new Error();
      const audio = [];
      for (const [indice, parte] of partes.entries()) {
        audio.push(
          campoCifradoSchema.parse(await portas.cifra.cifrar(parte, aadDe('audio', indice + 1))),
        );
      }
      const digest = await portas.idempotencia.calcularDigestIdempotencia(
        portas.atestador.canonicalizar({
          paciente_id: pacienteId,
          registro_id: registroId,
          mime,
          duracao_segundos: duracao,
          modelo: portas.modelo,
          transcricao: texto,
        }),
      );
      if (!/^[A-Za-z0-9_-]{43}$/.test(digest)) throw new Error();
      Object.assign(entrada, {
        audio,
        transcricao: campoCifradoSchema.parse(
          await portas.cifra.cifrar(texto, aadDe('transcricao', 0)),
        ),
        mime,
        duracao_segundos: duracao,
        modelo: portas.modelo,
        chave_idempotencia: chaveIdempotencia,
        digest_idempotencia: digest,
        aad: aadDe('transcricao', 0),
      });
    } else if (comando.operacao === 'confirmarRevisao' && textoRevisado) {
      const digest = await portas.idempotencia.calcularDigestIdempotencia(
        portas.atestador.canonicalizar({
          paciente_id: pacienteId,
          registro_id: registroId,
          texto_revisado: textoRevisado,
        }),
      );
      if (!/^[A-Za-z0-9_-]{43}$/.test(digest)) throw new Error();
      Object.assign(entrada, {
        texto_revisado: campoCifradoSchema.parse(
          await portas.cifra.cifrar(textoRevisado, aadDe('texto_revisado', 0)),
        ),
        chave_idempotencia: chaveIdempotencia,
        digest_idempotencia: digest,
        aad: aadDe('texto_revisado', 0),
      });
    }

    const metadados = dadosAtestadoSchema.omit({ digest_entrada: true }).parse({
      ...portas.metadados(requestId),
      ...identidade,
      operacao: ACAO[comando.operacao],
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
    iniciada = comando.operacao !== 'ouvir';
    const resposta = respostaTranscricaoPrivadaSchema.parse(
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
            : resposta.erro.codigo === 'nao_encontrado'
              ? 'nao_encontrado'
              : 'sem_permissao',
      );
    const linha = resposta.dados;
    if (
      linha.paciente_id.toLowerCase() !== pacienteId ||
      (comando.operacao !== 'registrar' && linha.audio_id.toLowerCase() !== registroId) ||
      (comando.operacao === 'registrar' &&
        !resposta.repeticao &&
        linha.audio_id.toLowerCase() !== registroId)
    )
      throw new Error();
    // Numa repetição o banco devolve o registro original, cujo id manda sobre o sorteado aqui.
    const idEfetivo = linha.audio_id.toLowerCase();
    const aadEfetivo = (campo: Aad['campo'], parte: number): Aad => ({
      tabela: 'cadastro.audio_transcricao',
      paciente_id: pacienteId,
      registro_id: idEfetivo,
      parte,
      campo,
      formato: 1,
    });
    const transcricao = textoTranscricaoSchema.parse(
      await portas.cifra.decifrar(linha.transcricao, aadEfetivo('transcricao', 0)),
    );
    const textoRevisadoLido = linha.texto_revisado
      ? textoTranscricaoSchema.parse(
          await portas.cifra.decifrar(linha.texto_revisado, aadEfetivo('texto_revisado', 0)),
        )
      : null;
    let audioBase64: string | null = null;
    if (linha.audio) {
      const abertas: string[] = [];
      for (const [indice, parte] of linha.audio.entries()) {
        abertas.push(await portas.cifra.decifrar(parte, aadEfetivo('audio', indice + 1)));
      }
      audioBase64 = juntarAudio(abertas);
      if (audioBase64.length > Math.ceil(AUDIO_BYTES_MAXIMO / 3) * 4) throw new Error();
    }
    const resultado: Transcricao = {
      audio_id: idEfetivo,
      paciente_id: linha.paciente_id.toLowerCase(),
      mime: linha.mime,
      duracao_segundos: linha.duracao_segundos,
      transcricao,
      modelo: linha.modelo,
      texto_revisado: textoRevisadoLido,
      revisao_confirmada_em: linha.revisao_confirmada_em,
      exclusao_estado: linha.exclusao_estado,
      exclusao_em: linha.exclusao_em,
      expira_em: linha.expira_em,
      audio_base64: audioBase64,
    };
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
