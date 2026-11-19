import {
  incluirSeletorExportacao,
  conferirVersaoExportacao,
  type SeletorVersaoExportacao,
} from './turno-execucao-seletor-exportacao.ts';
import {
  conteudoDocumentoSchema,
  documentoCasoSchema,
  metadadoDocumentoSchema,
  respostaDocumentoPrivadaSchema,
  respostaPreautorizacaoDocumentoSchema,
  respostaPastaDocumentoSchema,
  type DocumentoCaso,
} from '../../../packages/contracts/src/documento-caso.ts';
import {
  campoCifradoSchema,
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
  type CampoCifrado,
} from '../../../packages/contracts/src/rpc.ts';
import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import type { PortaDrive } from './google-drive.ts';

type Aad = {
  tabela: 'cadastro.documento_caso_versao';
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

export type ComandoDocumento =
  | ({ operacao: 'ler'; paciente_id: string; documento_id?: string } & SeletorVersaoExportacao)
  | { operacao: 'entregar'; paciente_id: string; documento_id: string }
  | {
      operacao: 'gravar';
      paciente_id: string;
      documento_id: string;
      versao_esperada: number;
      metadado: unknown;
      conteudo: unknown;
      arquivo?: { nome: string; tipo: string; bytes: Uint8Array };
    };

/** Documentos: autorização de operação/caso precede qualquer efeito Drive; a RPC final
 * reautoriza e audita na mesma transação da versão. Falha incerta nunca apaga arquivo. */
export async function operarDocumentoCasoNativo(
  request: Request,
  comando: ComandoDocumento,
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
    /** Ausente quando a guarda não está configurada: sem pasta raiz ou sem credencial, o
     * envio de arquivo é recusado em vez de cair em outro local de guarda. */
    drive?: { porta: PortaDrive; pastaRaiz: string };
    reservarPasta?: (
      request: Request,
      entrada: {
        p_transporte: {
          entrada: Record<string, unknown>;
          entrada_canonica: string;
          dados_canonicos: string;
        };
        p_previa: {
          entrada: Record<string, unknown>;
          entrada_canonica: string;
          dados_canonicos: string;
        };
      },
    ) => Promise<unknown>;
    marcarEfeitoExterno?: () => void;
    preautorizar?: (
      request: Request,
      transporte: {
        p_transporte: {
          entrada: Record<string, unknown>;
          entrada_canonica: string;
          dados_canonicos: string;
        };
      },
    ) => Promise<unknown>;
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
): Promise<
  | { ok: true; dados: { documentos: DocumentoCaso[] }; request_id: string }
  | {
      ok: false;
      erro: {
        codigo:
          | 'entrada_invalida'
          | 'nao_autenticado'
          | 'sem_permissao'
          | 'conflito_versao'
          | 'conflito_idempotencia'
          | 'servico_indisponivel'
          | 'pendencia_externa';
      };
      request_id: string;
    }
> {
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
    let metadado: ReturnType<typeof metadadoDocumentoSchema.parse> | undefined;
    let conteudo: ReturnType<typeof conteudoDocumentoSchema.parse> | undefined;
    let documentoId: string | undefined;
    let chaveIdempotencia: string | undefined;
    if (comando.operacao === 'gravar') {
      const chave = chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia'));
      const documento = uuidSchema.safeParse(comando.documento_id);
      if (!chave.success || !documento.success) return erro('entrada_invalida');
      chaveIdempotencia = chave.data;
      documentoId = documento.data.toLowerCase();
      if (
        !Number.isInteger(comando.versao_esperada) ||
        comando.versao_esperada < 0 ||
        comando.versao_esperada >= 2147483647
      )
        return erro('entrada_invalida');
      const lidoMetadado = metadadoDocumentoSchema.safeParse(comando.metadado);
      if (!lidoMetadado.success) return erro('entrada_invalida');
      metadado = lidoMetadado.data;
      // Documento novo nasce disponível. Marcar um anexo como indisponível ou removido na
      // própria criação não descreve nenhum fato: não houve arquivo antes para ficar sem.
      if (comando.versao_esperada === 0 && metadado.estado !== 'disponivel')
        return erro('entrada_invalida');
      const lidoConteudo = conteudoDocumentoSchema.safeParse(comando.conteudo);
      if (!lidoConteudo.success) return erro('entrada_invalida');
      conteudo = lidoConteudo.data;
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
    if (comando.operacao === 'ler') incluirSeletorExportacao(comando, entrada);
    if (comando.operacao === 'ler' && comando.documento_id !== undefined) {
      const documento = uuidSchema.safeParse(comando.documento_id);
      if (!documento.success) return erro('entrada_invalida');
      entrada.documento_id = documento.data.toLowerCase();
    }
    if (comando.operacao === 'gravar' && metadado && conteudo && documentoId) {
      if (!comando.arquivo && comando.versao_esperada === 0) return erro('entrada_invalida');
      const registroId = crypto.randomUUID();
      const aad: Aad = {
        tabela: 'cadastro.documento_caso_versao',
        paciente_id: pacienteId,
        registro_id: registroId,
        versao: comando.versao_esperada + 1,
        campo: 'conteudo',
        formato: 1,
      };
      const arquivoDigest = comando.arquivo
        ? Array.from(
            new Uint8Array(
              await crypto.subtle.digest('SHA-256', new Uint8Array(comando.arquivo.bytes)),
            ),
          )
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('')
        : undefined;
      const digest = await portas.idempotencia.calcularDigestIdempotencia(
        portas.atestador.canonicalizar({
          paciente_id: pacienteId,
          documento_id: documentoId,
          versao_esperada: comando.versao_esperada,
          metadado,
          conteudo,
          ...(comando.arquivo
            ? { arquivo: { tipo: comando.arquivo.tipo, sha256: arquivoDigest } }
            : {}),
        }),
      );
      if (!/^[A-Za-z0-9_-]{43}$/.test(digest)) throw new Error();
      Object.assign(entrada, {
        documento_id: documentoId,
        registro_id: registroId,
        chave_idempotencia: chaveIdempotencia,
        digest_idempotencia: digest,
        versao_esperada: comando.versao_esperada,
        categoria: metadado.categoria,
        origem: metadado.origem ?? null,
        data_documento: metadado.data_documento ?? null,
        audiencia: metadado.audiencia,
        estado: metadado.estado,
        conteudo: campoCifradoSchema.parse(
          await portas.cifra.cifrar(JSON.stringify(conteudo), aad),
        ),
        aad,
      });
    }
    const transportar = async (alvo = entrada) => {
      const metadados = dadosAtestadoSchema.omit({ digest_entrada: true }).parse({
        ...portas.metadados(requestId),
        ...identidade,
        operacao: comando.operacao === 'gravar' ? 'api.gravar_documento' : 'api.ler_documentos',
      });
      if (metadados.request_id !== requestId) throw new Error();
      const prova = resultadoAtestacaoSchema.parse(
        await portas.atestador.atestarEntrada(metadados, alvo),
      );
      const dados = dadosAtestadoSchema.parse(JSON.parse(prova.dadosCanonicos));
      if (
        portas.atestador.canonicalizar(alvo) !== prova.entradaCanonica ||
        portas.atestador.canonicalizar(dados) !== prova.dadosCanonicos ||
        Object.entries(metadados).some(
          ([chave, valor]) => dados[chave as keyof typeof dados] !== valor,
        ) ||
        Object.entries(dados).some(
          ([chave, valor]) => prova.atestado[chave as keyof typeof dados] !== valor,
        )
      )
        throw new Error();
      return {
        p_transporte: {
          entrada: { ...alvo, atestado: prova.atestado },
          entrada_canonica: prova.entradaCanonica,
          dados_canonicos: prova.dadosCanonicos,
        },
      };
    };
    if (comando.operacao === 'gravar' && conteudo) {
      if (!documentoId) return erro('entrada_invalida');
      if (!portas.preautorizar) return erro('servico_indisponivel');
      const transportePrevia = await transportar();
      const previa = respostaPreautorizacaoDocumentoSchema.parse(
        await portas.preautorizar(request, transportePrevia),
      );
      if (previa.request_id !== requestId) throw new Error();
      if (!previa.ok)
        return erro(previa.erro.codigo === 'conflito' ? 'conflito_versao' : previa.erro.codigo);
      if (request.signal.aborted) throw new Error();
      if (!previa.repeticao && !comando.arquivo) {
        // Capacidade Drive vem da versão autorizada; replay confirmado nunca adota payload.
        const leitura = await operarDocumentoCasoNativo(
          request,
          {
            operacao: 'ler',
            paciente_id: pacienteId,
            documento_id: documentoId,
          },
          portas,
        );
        if (!leitura.ok) return erro(leitura.erro.codigo);
        const anterior = leitura.dados.documentos.find((item) => item.documento_id === documentoId);
        if (!anterior) return erro('sem_permissao');
        if (anterior.versao !== comando.versao_esperada) return erro('conflito_versao');
        if (anterior.drive_file_id !== conteudo.drive_file_id) return erro('entrada_invalida');
        conteudo = { ...conteudo, drive_file_id: anterior.drive_file_id };
        entrada.conteudo = campoCifradoSchema.parse(
          await portas.cifra.cifrar(JSON.stringify(conteudo), entrada.aad as Aad),
        );
      }
      if (!previa.repeticao && comando.arquivo) {
        const reservarPasta = portas.reservarPasta;
        if (!portas.drive || !reservarPasta) return erro('servico_indisponivel');
        const pastaPaciente = await portas.idempotencia.calcularDigestIdempotencia(
          portas.atestador.canonicalizar({
            finalidade: 'pasta_documentos_paciente',
            paciente_id: pacienteId,
          }),
        );
        iniciada = true;
        portas.marcarEfeitoExterno?.();
        const envio = await portas.drive.porta.enviar({
          nome: documentoId,
          tipo: comando.arquivo.tipo,
          bytes: comando.arquivo.bytes,
          pastaRaiz: portas.drive.pastaRaiz,
          pastaPaciente,
          reservarPasta: async (raiz, candidata) => {
            const reserva = respostaPastaDocumentoSchema.parse(
              await reservarPasta(request, {
                ...(await transportar({
                  request_id: requestId,
                  paciente_id: pacienteId,
                  raiz,
                  candidata,
                  marcador: pastaPaciente,
                })),
                p_previa: transportePrevia.p_transporte,
              }),
            );
            if (reserva.request_id !== requestId) throw new Error();
            return { id: reserva.dados.pasta_id, marcador: reserva.dados.marcador };
          },
        });
        conteudo = { ...conteudo, drive_file_id: envio.file_id };
        entrada.conteudo = campoCifradoSchema.parse(
          await portas.cifra.cifrar(JSON.stringify(conteudo), entrada.aad as Aad),
        );
      }
    }
    const transporte = await transportar();
    if (request.signal.aborted) throw new Error();
    iniciada = comando.operacao === 'gravar';
    const resposta = respostaDocumentoPrivadaSchema.parse(
      await portas.executar(request, transporte),
    );
    if (request.signal.aborted || resposta.request_id !== requestId) throw new Error();
    if (!resposta.ok) {
      return erro(
        resposta.erro.codigo === 'conflito'
          ? 'conflito_versao'
          : resposta.erro.codigo === 'conflito_idempotencia'
            ? 'conflito_idempotencia'
            : 'sem_permissao',
      );
    }
    if (comando.operacao === 'ler') conferirVersaoExportacao(comando, resposta.dados);
    const documentos: DocumentoCaso[] = [];
    for (const item of resposta.dados.documentos) {
      if (item.paciente_id.toLowerCase() !== pacienteId) throw new Error();
      const aad: Aad = {
        tabela: 'cadastro.documento_caso_versao',
        paciente_id: pacienteId,
        registro_id: item.registro_id.toLowerCase(),
        versao: item.versao,
        campo: 'conteudo',
        formato: 1,
      };
      const aberto = conteudoDocumentoSchema.parse(
        JSON.parse(await portas.cifra.decifrar(item.conteudo, aad)),
      );
      let compartilhamento: 'divergente' | 'revisao_necessaria' | 'indisponivel' = 'indisponivel';
      if (
        portas.drive?.porta.consultarCompartilhamento &&
        !('documento_id' in comando && comando.operacao === 'ler')
      ) {
        try {
          compartilhamento = await portas.drive.porta.consultarCompartilhamento(
            aberto.drive_file_id,
            item.audiencia,
          );
        } catch {
          /* A falha da conferência não transforma ausência de prova em aprovação. */
        }
      }
      documentos.push(
        documentoCasoSchema.parse({
          compartilhamento,
          documento_id: item.documento_id,
          registro_id: item.registro_id,
          versao: item.versao,
          categoria: item.categoria,
          ...(item.origem === undefined ? {} : { origem: item.origem }),
          ...(item.data_documento === undefined ? {} : { data_documento: item.data_documento }),
          audiencia: item.audiencia,
          estado: item.estado,
          ...(item.criado_por_usuario_id === undefined
            ? {}
            : { criado_por_usuario_id: item.criado_por_usuario_id }),
          ...(item.criado_em === undefined ? {} : { criado_em: item.criado_em }),
          ...aberto,
        }),
      );
    }
    const atual = await portas.revalidar(request);
    if (
      request.signal.aborted ||
      atual.estado !== 'autorizado' ||
      atual.identidade.usuario_id.toLowerCase() !== identidade.usuario_id ||
      atual.identidade.session_id.toLowerCase() !== identidade.session_id
    )
      return erro(iniciada ? 'pendencia_externa' : 'nao_autenticado');
    return { ok: true as const, dados: { documentos }, request_id: requestId };
  } catch {
    return erro(iniciada ? 'pendencia_externa' : 'servico_indisponivel');
  }
}
