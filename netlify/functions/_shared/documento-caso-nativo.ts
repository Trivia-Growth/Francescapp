import {
  conteudoDocumentoSchema,
  documentoCasoSchema,
  metadadoDocumentoSchema,
  respostaDocumentoPrivadaSchema,
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
  | { operacao: 'ler'; paciente_id: string }
  | {
      operacao: 'gravar';
      paciente_id: string;
      documento_id: string;
      versao_esperada: number;
      metadado: unknown;
      conteudo: unknown;
      arquivo?: { nome: string; tipo: string; bytes: Uint8Array };
    };

/** Composição interna da fatia de documentos (FR-029 a FR-031), sem rota ou privilégio de
 * banco. Autorização e auditoria pertencem ao banco; aqui há cifra, atestado, idempotência e a
 * conversa com o Drive.
 *
 * Ordem deliberada na gravação com arquivo: o arquivo sobe ao Drive ANTES do registro no
 * banco. O inverso criaria um vínculo apontando para um arquivo que talvez nunca exista —
 * um anexo "disponível" que não abre, exatamente o que o cenário 2 da User Story 8 proíbe.
 * O custo dessa ordem é o arquivo órfão quando o banco recusa depois do envio; por isso a
 * falha tenta desfazer o envio, e o que sobrar é reconciliável pelo estado `indisponivel`. */
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
  let enviadoAoDrive: string | undefined;
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
    if (comando.operacao === 'gravar' && metadado && conteudo && documentoId) {
      if (comando.arquivo) {
        if (!portas.drive) return erro('servico_indisponivel');
        const envio = await portas.drive.porta.enviar({
          nome: comando.arquivo.nome,
          tipo: comando.arquivo.tipo,
          bytes: comando.arquivo.bytes,
          pastaRaiz: portas.drive.pastaRaiz,
        });
        enviadoAoDrive = envio.file_id;
        conteudo = { ...conteudo, drive_file_id: envio.file_id };
      }
      const registroId = crypto.randomUUID();
      const aad: Aad = {
        tabela: 'cadastro.documento_caso_versao',
        paciente_id: pacienteId,
        registro_id: registroId,
        versao: comando.versao_esperada + 1,
        campo: 'conteudo',
        formato: 1,
      };
      const digest = await portas.idempotencia.calcularDigestIdempotencia(
        portas.atestador.canonicalizar({
          paciente_id: pacienteId,
          documento_id: documentoId,
          versao_esperada: comando.versao_esperada,
          metadado,
          conteudo,
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
    const metadados = dadosAtestadoSchema.omit({ digest_entrada: true }).parse({
      ...portas.metadados(requestId),
      ...identidade,
      operacao: comando.operacao === 'gravar' ? 'api.gravar_documento' : 'api.ler_documentos',
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
    const resposta = respostaDocumentoPrivadaSchema.parse(
      await portas.executar(request, {
        p_transporte: {
          entrada: { ...entrada, atestado: prova.atestado },
          entrada_canonica: prova.entradaCanonica,
          dados_canonicos: prova.dadosCanonicos,
        },
      }),
    );
    if (request.signal.aborted || resposta.request_id !== requestId) throw new Error();
    if (!resposta.ok) {
      await desfazerEnvio();
      return erro(
        resposta.erro.codigo === 'conflito'
          ? 'conflito_versao'
          : resposta.erro.codigo === 'conflito_idempotencia'
            ? 'conflito_idempotencia'
            : 'sem_permissao',
      );
    }
    // O registro ficou gravado: o arquivo deixou de ser órfão e não deve ser desfeito.
    enviadoAoDrive = undefined;
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
      documentos.push(
        documentoCasoSchema.parse({
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
    await desfazerEnvio();
    return erro(iniciada ? 'pendencia_externa' : 'servico_indisponivel');
  }

  /** O arquivo subiu mas o vínculo não ficou: tenta apagar para não deixar conteúdo de
   * paciente solto numa pasta sem referência. Se a remoção também falhar, o arquivo fica no
   * Drive sem vínculo — registrado como limitação conhecida, não silenciado. */
  async function desfazerEnvio(): Promise<void> {
    const alvo = enviadoAoDrive;
    enviadoAoDrive = undefined;
    if (!alvo || !portas.drive) return;
    try {
      await portas.drive.porta.remover(alvo);
    } catch {
      /* falha fechada: o estado `indisponivel` cobre a reconciliação posterior */
    }
  }
}
