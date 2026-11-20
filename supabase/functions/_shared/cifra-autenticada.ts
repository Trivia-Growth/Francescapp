import type {
  CampoCifrado,
  MetadadosAad,
  MetadadosAadFinanceiro,
} from '../../../packages/contracts/src/rpc.ts';

export type { CampoCifrado, MetadadosAad, MetadadosAadFinanceiro };

/** Todo AAD que este canonicalizador aceita. Existe um único mecanismo de AAD no repositório —
 * esta função — e uma única união que o descreve, `metadadosAadSchema`, que passou a conter
 * também as duas tabelas financeiras. `MetadadosAadFinanceiro` continua exportado por
 * `rpc.ts`, mas como SUBCONJUNTO dessa união, usado só para recusar AAD de cuidado na
 * fronteira da composição do financeiro. */
export type AadCifra = MetadadosAad;

export type ConfiguracaoCifraAutenticada = Readonly<{
  keyIdAtiva: string;
  chavesDeCifra: Readonly<Record<string, Uint8Array>>;
  chaveHmac: Uint8Array;
}>;

export type CifraAutenticada = Readonly<{
  cifrar(valor: string, aad: AadCifra): Promise<CampoCifrado>;
  decifrar(campo: CampoCifrado, aad: AadCifra): Promise<string>;
  calcularHmac(comandoLogico: string): Promise<string>;
}>;

/** Não inclui `key_id` para não revelar configuração privada em falhas públicas. */
export class ErroChaveIndisponivel extends Error {
  constructor() {
    super('Chave criptográfica indisponível.');
    this.name = 'ErroChaveIndisponivel';
  }
}

/** Falha fechada para envelope, AAD, tag ou texto inválido. */
export class ErroCifraAutenticada extends Error {
  constructor() {
    super('Não foi possível processar o campo cifrado.');
    this.name = 'ErroCifraAutenticada';
  }
}

const tamanhoChaveAes = 32;
const tamanhoNonce = 12;
const tamanhoTag = 16;
const tamanhoMaximoBase64Url = 32_768;
const formatoAtual = 1;
const codificador = new TextEncoder();
const decodificador = new TextDecoder('utf-8', { fatal: true });
const tabelasAad = new Set([
  'cadastro.paciente',
  'cadastro.contato_paciente',
  'cadastro.pessoa_relacionada',
  'cadastro.relacao_paciente',
  'auditoria.evento',
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const base64Url = /^[A-Za-z0-9_-]+$/;

function webCrypto(): Crypto {
  const runtime = globalThis.crypto;
  if (runtime === undefined || runtime.subtle === undefined) {
    throw new ErroCifraAutenticada();
  }
  return runtime;
}

function cryptoSubtle(): SubtleCrypto {
  return webCrypto().subtle;
}

function keyIdValido(keyId: unknown): keyId is string {
  return (
    typeof keyId === 'string' && keyId.length > 0 && keyId.length <= 128 && keyId.trim() === keyId
  );
}

function aadCanonico(aad: AadCifra): Uint8Array {
  if (
    typeof aad === 'object' &&
    aad !== null &&
    [
      'cadastro.turno_medida_versao',
      'cadastro.turno_prescricao_versao',
      'cadastro.turno_administracao_versao',
      'cadastro.turno_ocorrencia_versao',
      'cadastro.turno_fundamento_familiar_versao',
      'cadastro.turno_exportacao_pdf',
      'cadastro.turno_localizacao_exportacao',
    ].includes(aad.tabela)
  ) {
    const valor = aad as {
      tabela: string;
      paciente_id: string;
      turno_id: string | null;
      registro_id: string;
      versao: number;
      campo: string;
      formato: number;
    };
    const campos: Record<string, readonly string[]> = {
      'cadastro.turno_medida_versao': ['observacao', 'motivo'],
      'cadastro.turno_prescricao_versao': ['nome', 'dose', 'via', 'fonte_documental', 'motivo'],
      'cadastro.turno_administracao_versao': [
        'executor_nome',
        'executor_vinculo',
        'motivo_situacao',
        'motivo',
      ],
      'cadastro.turno_ocorrencia_versao': ['descricao', 'providencia', 'motivo'],
      'cadastro.turno_fundamento_familiar_versao': ['fundamento'],
      'cadastro.turno_exportacao_pdf': ['destinatario', 'proposito'],
      'cadastro.turno_localizacao_exportacao': ['destinatario', 'proposito'],
    };
    if (
      !uuid.test(valor.paciente_id) ||
      !uuid.test(valor.registro_id) ||
      (valor.turno_id !== null && !uuid.test(valor.turno_id)) ||
      !Number.isInteger(valor.versao) ||
      valor.versao < 1 ||
      valor.versao > 2147483647 ||
      !campos[valor.tabela]?.includes(valor.campo) ||
      valor.formato !== formatoAtual
    )
      throw new ErroCifraAutenticada();
    return codificador.encode(
      JSON.stringify({
        tabela: valor.tabela,
        paciente_id: valor.paciente_id,
        turno_id: valor.turno_id,
        registro_id: valor.registro_id,
        versao: valor.versao,
        campo: valor.campo,
        formato: valor.formato,
      }),
    );
  }
  // FR-024. Observação livre do registro de realização do compromisso. O registro é
  // append-only: `registro_id` e `versao` entram na ligação para que o envelope de uma
  // versão não decifre no lugar do de outra versão do mesmo compromisso.
  if (typeof aad === 'object' && aad !== null && aad.tabela === 'cadastro.realizacao_compromisso') {
    if (
      typeof aad.registro_id !== 'string' ||
      !uuid.test(aad.registro_id) ||
      !Number.isInteger(aad.versao) ||
      aad.versao < 1 ||
      aad.versao > 2147483647 ||
      aad.campo !== 'observacao' ||
      aad.formato !== formatoAtual
    ) {
      throw new ErroCifraAutenticada();
    }
    return codificador.encode(
      JSON.stringify({
        tabela: aad.tabela,
        registro_id: aad.registro_id,
        versao: aad.versao,
        campo: aad.campo,
        formato: aad.formato,
      }),
    );
  }
  // FR-037. Motivo da substituição temporária da case manager e motivo do encerramento
  // antecipado. Mesma forma genérica do repositório, como no financeiro: `registro_id` é o `id`
  // da linha de `cadastro.substituicao_case_manager`, conhecido antes da cifra nos dois
  // caminhos de escrita. O ramo é próprio, e não o genérico do fim, porque o genérico aceita
  // qualquer nome de campo com até 80 caracteres; a linha tem exatamente dois campos cifrados e
  // `campo` entra na ligação para que o envelope do motivo do registro não seja aceito no lugar
  // do motivo do encerramento. `versao` fica de fora: a linha é append-only com uma única
  // transição nomeada, então `id` já é único por registro.
  if (
    typeof aad === 'object' &&
    aad !== null &&
    aad.tabela === 'cadastro.substituicao_case_manager'
  ) {
    if (
      typeof aad.registro_id !== 'string' ||
      !uuid.test(aad.registro_id) ||
      (aad.campo !== 'motivo' && aad.campo !== 'motivo_encerramento') ||
      aad.formato !== formatoAtual
    ) {
      throw new ErroCifraAutenticada();
    }
    return codificador.encode(
      JSON.stringify({
        tabela: aad.tabela,
        registro_id: aad.registro_id,
        campo: aad.campo,
        formato: aad.formato,
      }),
    );
  }
  if (typeof aad === 'object' && aad !== null && aad.tabela === 'identidade.acesso_gerenciado') {
    if (
      !uuid.test(aad.registro_id) ||
      !['nome', 'email', 'motivo'].includes(aad.campo) ||
      aad.formato !== formatoAtual
    )
      throw new ErroCifraAutenticada();
    return codificador.encode(
      JSON.stringify({
        tabela: aad.tabela,
        registro_id: aad.registro_id,
        campo: aad.campo,
        formato: aad.formato,
      }),
    );
  }
  if (typeof aad === 'object' && aad !== null && aad.tabela === 'cadastro.acesso_paciente') {
    if (
      !uuid.test(aad.registro_id) ||
      (aad.campo !== 'motivo_concessao' && aad.campo !== 'motivo_revogacao') ||
      aad.formato !== formatoAtual
    ) {
      throw new ErroCifraAutenticada();
    }
    return codificador.encode(
      JSON.stringify({
        tabela: aad.tabela,
        registro_id: aad.registro_id,
        campo: aad.campo,
        formato: aad.formato,
      }),
    );
  }
  if (typeof aad === 'object' && aad !== null && aad.tabela === 'cadastro.tarefa_cuidado_versao') {
    if (
      !uuid.test(aad.paciente_id) ||
      !uuid.test(aad.tarefa_id) ||
      !uuid.test(aad.registro_id) ||
      !Number.isInteger(aad.versao) ||
      aad.versao < 1 ||
      aad.versao > 2147483647 ||
      aad.campo !== 'conteudo' ||
      aad.formato !== formatoAtual
    )
      throw new ErroCifraAutenticada();
    return codificador.encode(
      JSON.stringify({
        tabela: aad.tabela,
        paciente_id: aad.paciente_id,
        tarefa_id: aad.tarefa_id,
        registro_id: aad.registro_id,
        versao: aad.versao,
        campo: aad.campo,
        formato: aad.formato,
      }),
    );
  }
  if (
    typeof aad === 'object' &&
    aad !== null &&
    aad.tabela === 'cadastro.objetivo_cuidado_versao'
  ) {
    if (
      !uuid.test(aad.paciente_id) ||
      !uuid.test(aad.objetivo_id) ||
      !uuid.test(aad.registro_id) ||
      !Number.isInteger(aad.versao) ||
      aad.versao < 1 ||
      aad.versao > 2147483647 ||
      aad.campo !== 'conteudo' ||
      aad.formato !== formatoAtual
    )
      throw new ErroCifraAutenticada();
    return codificador.encode(
      JSON.stringify({
        tabela: aad.tabela,
        paciente_id: aad.paciente_id,
        objetivo_id: aad.objetivo_id,
        registro_id: aad.registro_id,
        versao: aad.versao,
        campo: aad.campo,
        formato: aad.formato,
      }),
    );
  }
  if (
    typeof aad === 'object' &&
    aad !== null &&
    aad.tabela === 'cadastro.diario_rascunho_textual'
  ) {
    if (
      typeof aad.paciente_id !== 'string' ||
      !uuid.test(aad.paciente_id) ||
      typeof aad.autor_usuario_id !== 'string' ||
      !uuid.test(aad.autor_usuario_id) ||
      typeof aad.registro_id !== 'string' ||
      !uuid.test(aad.registro_id) ||
      !Number.isInteger(aad.versao) ||
      aad.versao < 1 ||
      aad.versao > 2147483647 ||
      aad.campo !== 'conteudo' ||
      aad.formato !== formatoAtual
    ) {
      throw new ErroCifraAutenticada();
    }
    return codificador.encode(
      JSON.stringify({
        tabela: aad.tabela,
        paciente_id: aad.paciente_id,
        autor_usuario_id: aad.autor_usuario_id,
        registro_id: aad.registro_id,
        versao: aad.versao,
        campo: aad.campo,
        formato: aad.formato,
      }),
    );
  }
  // FR-012: a versão do diário tem dois textos cifrados. `campo` faz parte da ligação, logo
  // o envelope da justificativa não decifra no lugar do conteúdo nem o contrário.
  if (typeof aad === 'object' && aad !== null && aad.tabela === 'cadastro.turno_escala_versao') {
    if (
      !uuid.test(aad.paciente_id) ||
      !uuid.test(aad.escala_id) ||
      !Number.isInteger(aad.versao) ||
      aad.versao < 1 ||
      aad.versao > 2147483647 ||
      aad.campo !== 'motivo' ||
      aad.formato !== formatoAtual
    )
      throw new ErroCifraAutenticada();
    return codificador.encode(
      JSON.stringify({
        tabela: aad.tabela,
        paciente_id: aad.paciente_id,
        escala_id: aad.escala_id,
        versao: aad.versao,
        campo: aad.campo,
        formato: aad.formato,
      }),
    );
  }
  if (typeof aad === 'object' && aad !== null && aad.tabela === 'cadastro.diario_registro_versao') {
    if (
      typeof aad.paciente_id !== 'string' ||
      !uuid.test(aad.paciente_id) ||
      typeof aad.diario_registro_id !== 'string' ||
      !uuid.test(aad.diario_registro_id) ||
      typeof aad.registro_id !== 'string' ||
      !uuid.test(aad.registro_id) ||
      !Number.isInteger(aad.versao) ||
      aad.versao < 1 ||
      aad.versao > 2147483647 ||
      (aad.campo !== 'conteudo' && aad.campo !== 'justificativa') ||
      aad.formato !== formatoAtual
    ) {
      throw new ErroCifraAutenticada();
    }
    return codificador.encode(
      JSON.stringify({
        tabela: aad.tabela,
        paciente_id: aad.paciente_id,
        diario_registro_id: aad.diario_registro_id,
        registro_id: aad.registro_id,
        versao: aad.versao,
        campo: aad.campo,
        formato: aad.formato,
      }),
    );
  }
  // FR-010. O áudio não cabe num envelope só (o teto de texto cifrado continua 32 KiB),
  // então viaja em partes numeradas a partir de 1; `parte` entra na ligação para que uma
  // parte não seja trocada, reordenada ou movida para outro áudio. Texto usa `parte = 0`.
  if (typeof aad === 'object' && aad !== null && aad.tabela === 'cadastro.audio_transcricao') {
    if (
      !uuid.test(aad.paciente_id) ||
      !uuid.test(aad.registro_id) ||
      !Number.isInteger(aad.parte) ||
      aad.parte < 0 ||
      aad.parte > 64 ||
      (aad.campo === 'audio' ? aad.parte < 1 : aad.parte !== 0) ||
      (aad.campo !== 'audio' && aad.campo !== 'transcricao' && aad.campo !== 'texto_revisado') ||
      aad.formato !== formatoAtual
    )
      throw new ErroCifraAutenticada();
    return codificador.encode(
      JSON.stringify({
        tabela: aad.tabela,
        paciente_id: aad.paciente_id,
        registro_id: aad.registro_id,
        parte: aad.parte,
        campo: aad.campo,
        formato: aad.formato,
      }),
    );
  }
  if (typeof aad === 'object' && aad !== null && aad.tabela === 'cadastro.orientacao_versao') {
    if (
      !uuid.test(aad.paciente_id) ||
      !uuid.test(aad.orientacao_id) ||
      !uuid.test(aad.registro_id) ||
      !Number.isInteger(aad.versao) ||
      aad.versao < 1 ||
      aad.versao > 2147483647 ||
      aad.campo !== 'conteudo' ||
      aad.formato !== formatoAtual
    )
      throw new ErroCifraAutenticada();
    return codificador.encode(
      JSON.stringify({
        tabela: aad.tabela,
        paciente_id: aad.paciente_id,
        orientacao_id: aad.orientacao_id,
        registro_id: aad.registro_id,
        versao: aad.versao,
        campo: aad.campo,
        formato: aad.formato,
      }),
    );
  }
  if (typeof aad === 'object' && aad !== null && aad.tabela === 'cadastro.encaminhamento_versao') {
    if (
      !uuid.test(aad.paciente_id) ||
      !uuid.test(aad.encaminhamento_id) ||
      !uuid.test(aad.registro_id) ||
      !Number.isInteger(aad.versao) ||
      aad.versao < 1 ||
      aad.versao > 2147483647 ||
      aad.campo !== 'conteudo' ||
      aad.formato !== formatoAtual
    )
      throw new ErroCifraAutenticada();
    return codificador.encode(
      JSON.stringify({
        tabela: aad.tabela,
        paciente_id: aad.paciente_id,
        encaminhamento_id: aad.encaminhamento_id,
        registro_id: aad.registro_id,
        versao: aad.versao,
        campo: aad.campo,
        formato: aad.formato,
      }),
    );
  }
  // FR-040. Solicitação do titular: mesmo formato dos documentos versionados, mas com DOIS
  // campos cifrados na mesma linha (o pedido e o fundamento da resposta). Por isso `campo` é
  // conferido contra a lista própria em vez de ser fixo em 'conteudo' — sem isso o envelope da
  // descrição seria aceito no lugar do da resposta.
  if (typeof aad === 'object' && aad !== null && aad.tabela === 'cadastro.solicitacao_titular') {
    if (
      typeof aad.paciente_id !== 'string' ||
      !uuid.test(aad.paciente_id) ||
      typeof aad.registro_id !== 'string' ||
      !uuid.test(aad.registro_id) ||
      !Number.isInteger(aad.versao) ||
      aad.versao < 1 ||
      aad.versao > 2147483647 ||
      (aad.campo !== 'descricao' && aad.campo !== 'resposta') ||
      aad.formato !== formatoAtual
    ) {
      throw new ErroCifraAutenticada();
    }
    return codificador.encode(
      JSON.stringify({
        tabela: aad.tabela,
        paciente_id: aad.paciente_id,
        registro_id: aad.registro_id,
        versao: aad.versao,
        campo: aad.campo,
        formato: aad.formato,
      }),
    );
  }
  // FR-032/FR-033. Exportação: destinatário, propósito e observação de entrega. Mesma razão
  // da solicitação do titular — vários campos cifrados por linha, então `campo` é conferido
  // contra a lista própria e entra na ligação, senão o envelope do destinatário seria aceito
  // no lugar do do propósito.
  if (
    typeof aad === 'object' &&
    aad !== null &&
    (aad.tabela === 'cadastro.exportacao_caso' || aad.tabela === 'cadastro.exportacao_entrega')
  ) {
    if (
      typeof aad.paciente_id !== 'string' ||
      !uuid.test(aad.paciente_id) ||
      typeof aad.registro_id !== 'string' ||
      !uuid.test(aad.registro_id) ||
      !Number.isInteger(aad.versao) ||
      aad.versao < 1 ||
      aad.versao > 2147483647 ||
      (aad.campo !== 'destinatario' && aad.campo !== 'proposito' && aad.campo !== 'observacao') ||
      aad.formato !== formatoAtual
    ) {
      throw new ErroCifraAutenticada();
    }
    return codificador.encode(
      JSON.stringify({
        tabela: aad.tabela,
        paciente_id: aad.paciente_id,
        registro_id: aad.registro_id,
        versao: aad.versao,
        campo: aad.campo,
        formato: aad.formato,
      }),
    );
  }
  // Documentos versionados por paciente compartilham o formato de AAD; a tabela,
  // que entra na ligação, é o que impede trocar o envelope de um pelo do outro.
  if (
    typeof aad === 'object' &&
    aad !== null &&
    (aad.tabela === 'cadastro.anamnese_versao' ||
      aad.tabela === 'cadastro.saude_versao' ||
      aad.tabela === 'cadastro.contexto_cuidado_versao' ||
      aad.tabela === 'cadastro.rede_cuidado_versao' ||
      aad.tabela === 'cadastro.plano_crise_versao' ||
      aad.tabela === 'cadastro.documento_caso_versao')
  ) {
    if (
      typeof aad.paciente_id !== 'string' ||
      !uuid.test(aad.paciente_id) ||
      typeof aad.registro_id !== 'string' ||
      !uuid.test(aad.registro_id) ||
      !Number.isInteger(aad.versao) ||
      aad.versao < 1 ||
      aad.versao > 2147483647 ||
      aad.campo !== 'conteudo' ||
      aad.formato !== formatoAtual
    ) {
      throw new ErroCifraAutenticada();
    }
    return codificador.encode(
      JSON.stringify({
        tabela: aad.tabela,
        paciente_id: aad.paciente_id,
        registro_id: aad.registro_id,
        versao: aad.versao,
        campo: aad.campo,
        formato: aad.formato,
      }),
    );
  }
  if (
    typeof aad === 'object' &&
    aad !== null &&
    (aad.tabela === 'identidade.concessao_equipe' || aad.tabela === 'identidade.convite_familiar')
  ) {
    if (
      typeof aad.registro_id !== 'string' ||
      !uuid.test(aad.registro_id) ||
      (aad.campo !== 'email' && aad.campo !== 'motivo') ||
      aad.formato !== formatoAtual
    ) {
      throw new ErroCifraAutenticada();
    }
    return codificador.encode(
      JSON.stringify({
        tabela: aad.tabela,
        registro_id: aad.registro_id,
        campo: aad.campo,
        formato: aad.formato,
      }),
    );
  }
  if (typeof aad === 'object' && aad !== null && aad.tabela === 'identidade.sessao') {
    if (
      typeof aad.registro_id !== 'string' ||
      !uuid.test(aad.registro_id) ||
      typeof aad.usuario_id !== 'string' ||
      !uuid.test(aad.usuario_id) ||
      aad.campo !== 'refresh_token' ||
      aad.formato !== formatoAtual
    ) {
      throw new ErroCifraAutenticada();
    }
    return codificador.encode(
      JSON.stringify({
        tabela: aad.tabela,
        registro_id: aad.registro_id,
        usuario_id: aad.usuario_id,
        campo: aad.campo,
        formato: aad.formato,
      }),
    );
  }
  // FR-073/FR-074/FR-076/FR-077. Ficha de plantão. Mesma forma genérica do repositório —
  // `{tabela, registro_id, campo, formato}` —, com `registro_id` no `id` da LINHA, como no
  // lançamento de despesa: as duas tabelas versionadas têm uma linha por versão, e amarrar
  // o `id` é o que impede reaproveitar o envelope de uma versão como se fosse o de outra do
  // mesmo plantão ou da mesma pendência; o rascunho é mutável e recebe `id` novo a cada
  // gravação. O ramo é próprio, e não o genérico do fim, porque o genérico aceita qualquer
  // nome de campo com até 80 caracteres: aqui cada tabela tem a sua lista fechada, e `campo`
  // entra na ligação para que o envelope das atividades não decifre no lugar das observações
  // nem no lugar do motivo da retificação. Não há convenção nova.
  if (
    typeof aad === 'object' &&
    aad !== null &&
    [
      'cadastro.turno_plantao_versao',
      'cadastro.turno_plantao_pendencia_versao',
      'cadastro.ficha_plantao_rascunho',
    ].includes(aad.tabela)
  ) {
    const camposPlantao: Record<string, readonly string[]> = {
      'cadastro.turno_plantao_versao': ['atividades', 'observacoes', 'motivo'],
      'cadastro.turno_plantao_pendencia_versao': ['conteudo', 'motivo'],
      'cadastro.ficha_plantao_rascunho': ['conteudo'],
    };
    if (
      typeof aad.registro_id !== 'string' ||
      !uuid.test(aad.registro_id) ||
      typeof aad.campo !== 'string' ||
      !camposPlantao[aad.tabela]?.includes(aad.campo) ||
      aad.formato !== formatoAtual
    ) {
      throw new ErroCifraAutenticada();
    }
    return codificador.encode(
      JSON.stringify({
        tabela: aad.tabela,
        registro_id: aad.registro_id,
        campo: aad.campo,
        formato: aad.formato,
      }),
    );
  }
  // FR-068. Valor acordado de repasse por turno. `api.consultar_valor_acordado` devolve
  // `valor_id`, que é a chave primária da linha, então a ligação usa `registro_id` como
  // qualquer registro não versionado. O ramo é próprio, e não o genérico do fim, porque o
  // genérico aceita qualquer nome de campo com até 80 caracteres; a tabela tem exatamente um
  // campo cifrado, e é esse que entra na ligação.
  if (typeof aad === 'object' && aad !== null && aad.tabela === 'financeiro.valor_acordado_turno') {
    if (
      typeof aad.registro_id !== 'string' ||
      !uuid.test(aad.registro_id) ||
      aad.campo !== 'motivo' ||
      aad.formato !== formatoAtual
    ) {
      throw new ErroCifraAutenticada();
    }
    return codificador.encode(
      JSON.stringify({
        tabela: aad.tabela,
        registro_id: aad.registro_id,
        campo: aad.campo,
        formato: aad.formato,
      }),
    );
  }
  // FR-069. Despesa do cuidado. Três campos cifrados na mesma linha, então `campo` é conferido
  // contra a lista própria e entra na ligação: sem isso o envelope da descrição seria aceito no
  // lugar do da autorização ou do motivo da retificação.
  //
  // `registro_id` é o `id` da LINHA, não o `despesa_id` do lançamento. A tabela é append-only
  // por `(despesa_id, versao)` e cada versão ocupa uma linha própria, então amarrar o `id`
  // separa as versões: o envelope de uma versão não decifra no contexto de outra, do mesmo
  // lançamento e do mesmo campo. O `id` é conhecido antes da cifra nos dois caminhos de
  // escrita (`lancamento := coalesce(retificacao_id, despesa_id)`) e é projetado por
  // `api.consultar_despesas`, então a listagem continua decifrável. `versao` fica de fora
  // porque é decidida pelo banco depois da cifra — e é redundante, já que `id` é único por
  // versão. Mesma forma genérica do resto do repositório; não há convenção própria aqui.
  if (typeof aad === 'object' && aad !== null && aad.tabela === 'financeiro.despesa_lancamento') {
    if (
      typeof aad.registro_id !== 'string' ||
      !uuid.test(aad.registro_id) ||
      (aad.campo !== 'descricao' &&
        aad.campo !== 'autorizacao' &&
        aad.campo !== 'motivo_retificacao') ||
      aad.formato !== formatoAtual
    ) {
      throw new ErroCifraAutenticada();
    }
    return codificador.encode(
      JSON.stringify({
        tabela: aad.tabela,
        registro_id: aad.registro_id,
        campo: aad.campo,
        formato: aad.formato,
      }),
    );
  }
  if (
    typeof aad !== 'object' ||
    aad === null ||
    !tabelasAad.has(aad.tabela) ||
    typeof aad.registro_id !== 'string' ||
    !uuid.test(aad.registro_id) ||
    typeof aad.campo !== 'string' ||
    aad.campo.length === 0 ||
    aad.campo.length > 80 ||
    aad.formato !== formatoAtual
  ) {
    throw new ErroCifraAutenticada();
  }

  return codificador.encode(
    JSON.stringify({
      tabela: aad.tabela,
      registro_id: aad.registro_id,
      campo: aad.campo,
      formato: aad.formato,
    }),
  );
}

function bytesParaBase64Url(bytes: Uint8Array): string {
  let binario = '';
  for (let inicio = 0; inicio < bytes.length; inicio += 8192) {
    binario += String.fromCharCode(...bytes.subarray(inicio, inicio + 8192));
  }
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function bytesParaWebCrypto(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copia = new Uint8Array(bytes.length);
  copia.set(bytes);
  return copia;
}

function base64UrlParaBytes(valor: unknown, tamanhoMaximo = tamanhoMaximoBase64Url): Uint8Array {
  if (
    typeof valor !== 'string' ||
    valor.length > tamanhoMaximo ||
    !base64Url.test(valor) ||
    valor.length % 4 === 1
  ) {
    throw new ErroCifraAutenticada();
  }

  try {
    const base64 = valor
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(valor.length / 4) * 4, '=');
    const binario = atob(base64);
    const bytes = Uint8Array.from(binario, (caractere) => caractere.charCodeAt(0));
    if (bytesParaBase64Url(bytes) !== valor) {
      throw new ErroCifraAutenticada();
    }
    return bytes;
  } catch (erro) {
    if (erro instanceof ErroCifraAutenticada) {
      throw erro;
    }
    throw new ErroCifraAutenticada();
  }
}

function campoValido(campo: CampoCifrado): {
  keyId: string;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
  tag: Uint8Array;
} {
  if (
    typeof campo !== 'object' ||
    campo === null ||
    campo.formato !== formatoAtual ||
    !keyIdValido(campo.key_id)
  ) {
    throw new ErroCifraAutenticada();
  }

  const nonce = base64UrlParaBytes(campo.nonce, 16);
  const ciphertext = base64UrlParaBytes(campo.ciphertext);
  const tag = base64UrlParaBytes(campo.tag, 24);
  if (nonce.length !== tamanhoNonce || ciphertext.length === 0 || tag.length !== tamanhoTag) {
    throw new ErroCifraAutenticada();
  }

  return { keyId: campo.key_id, nonce, ciphertext, tag };
}

function chaveDeTamanhoCorreto(chave: unknown): chave is Uint8Array {
  return chave instanceof Uint8Array && chave.length === tamanhoChaveAes;
}

function mesmoMaterialDeChave(primeira: Uint8Array, segunda: Uint8Array): boolean {
  if (primeira.length !== segunda.length) {
    return false;
  }

  let diferenca = 0;
  for (let indice = 0; indice < primeira.length; indice += 1) {
    diferenca |= (primeira[indice] ?? 0) ^ (segunda[indice] ?? 0);
  }
  return diferenca === 0;
}

function importarChaves(configuracao: ConfiguracaoCifraAutenticada): {
  keyIdAtiva: string;
  chavesDeCifra: ReadonlyMap<string, Promise<CryptoKey>>;
  chaveHmac: Promise<CryptoKey>;
  chaveAtivaDuplicada: boolean;
} {
  if (!keyIdValido(configuracao.keyIdAtiva) || !chaveDeTamanhoCorreto(configuracao.chaveHmac)) {
    throw new ErroChaveIndisponivel();
  }

  const subtle = cryptoSubtle();
  const chavesDeCifra = new Map<string, Promise<CryptoKey>>();
  const materiais = new Map<string, Uint8Array>();
  for (const [keyId, chave] of Object.entries(configuracao.chavesDeCifra)) {
    if (!keyIdValido(keyId) || !chaveDeTamanhoCorreto(chave)) {
      throw new ErroChaveIndisponivel();
    }
    if (mesmoMaterialDeChave(chave, configuracao.chaveHmac)) {
      throw new ErroChaveIndisponivel();
    }
    materiais.set(keyId, new Uint8Array(chave));
    chavesDeCifra.set(
      keyId,
      subtle.importKey('raw', new Uint8Array(chave), { name: 'AES-GCM', length: 256 }, false, [
        'encrypt',
        'decrypt',
      ]),
    );
  }

  const materialAtivo = materiais.get(configuracao.keyIdAtiva);
  if (!materialAtivo) {
    throw new ErroChaveIndisponivel();
  }

  return {
    keyIdAtiva: configuracao.keyIdAtiva,
    chavesDeCifra,
    chaveAtivaDuplicada: [...materiais].some(
      ([keyId, chave]) =>
        keyId !== configuracao.keyIdAtiva && mesmoMaterialDeChave(chave, materialAtivo),
    ),
    chaveHmac: subtle.importKey(
      'raw',
      new Uint8Array(configuracao.chaveHmac),
      { name: 'HMAC', hash: 'SHA-256', length: 256 },
      false,
      ['sign'],
    ),
  };
}

function chaveObrigatoria(
  keyId: string,
  chavesDeCifra: ReadonlyMap<string, Promise<CryptoKey>>,
): Promise<CryptoKey> {
  const chave = chavesDeCifra.get(keyId);
  if (chave === undefined) {
    throw new ErroChaveIndisponivel();
  }
  return chave;
}

function unirCiphertextETag(ciphertext: Uint8Array, tag: Uint8Array): Uint8Array {
  const resultado = new Uint8Array(ciphertext.length + tag.length);
  resultado.set(ciphertext);
  resultado.set(tag, ciphertext.length);
  return resultado;
}

export function criarCifraAutenticada(
  configuracao: ConfiguracaoCifraAutenticada,
): CifraAutenticada {
  const chaves = importarChaves(configuracao);

  return Object.freeze({
    async cifrar(valor, aad) {
      if (chaves.chaveAtivaDuplicada) throw new ErroChaveIndisponivel();
      if (typeof valor !== 'string') {
        throw new ErroCifraAutenticada();
      }
      const valorCodificado = codificador.encode(valor);
      if (valorCodificado.length === 0) {
        throw new ErroCifraAutenticada();
      }

      const nonce = webCrypto().getRandomValues(new Uint8Array(tamanhoNonce));
      try {
        const resultado = new Uint8Array(
          await cryptoSubtle().encrypt(
            {
              name: 'AES-GCM',
              iv: bytesParaWebCrypto(nonce),
              additionalData: bytesParaWebCrypto(aadCanonico(aad)),
              tagLength: 128,
            },
            await chaveObrigatoria(chaves.keyIdAtiva, chaves.chavesDeCifra),
            valorCodificado,
          ),
        );
        const ciphertext = resultado.slice(0, -tamanhoTag);
        const tag = resultado.slice(-tamanhoTag);
        return {
          formato: formatoAtual,
          key_id: chaves.keyIdAtiva,
          nonce: bytesParaBase64Url(nonce),
          ciphertext: bytesParaBase64Url(ciphertext),
          tag: bytesParaBase64Url(tag),
        };
      } catch (erro) {
        if (erro instanceof ErroChaveIndisponivel || erro instanceof ErroCifraAutenticada) {
          throw erro;
        }
        throw new ErroCifraAutenticada();
      }
    },

    async decifrar(campo, aad) {
      const envelope = campoValido(campo);
      try {
        const resultado = await cryptoSubtle().decrypt(
          {
            name: 'AES-GCM',
            iv: bytesParaWebCrypto(envelope.nonce),
            additionalData: bytesParaWebCrypto(aadCanonico(aad)),
            tagLength: 128,
          },
          await chaveObrigatoria(envelope.keyId, chaves.chavesDeCifra),
          bytesParaWebCrypto(unirCiphertextETag(envelope.ciphertext, envelope.tag)),
        );
        return decodificador.decode(resultado);
      } catch (erro) {
        if (erro instanceof ErroChaveIndisponivel || erro instanceof ErroCifraAutenticada) {
          throw erro;
        }
        throw new ErroCifraAutenticada();
      }
    },

    async calcularHmac(comandoLogico) {
      if (typeof comandoLogico !== 'string' || comandoLogico.length === 0) {
        throw new ErroCifraAutenticada();
      }
      try {
        const assinatura = await cryptoSubtle().sign(
          'HMAC',
          await chaves.chaveHmac,
          codificador.encode(`ffcmapp:hmac:v1:${comandoLogico}`),
        );
        return bytesParaBase64Url(new Uint8Array(assinatura));
      } catch {
        throw new ErroCifraAutenticada();
      }
    },
  });
}
