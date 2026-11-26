import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  confirmarEntregaSchema,
  registrarExportacaoSchema,
  respostaExportacaoPrivadaSchema,
  type RegistroExportacoes,
} from '../../../packages/contracts/src/exportacao.ts';
import {
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
  type CampoCifrado,
  type MetadadosAad,
} from '../../../packages/contracts/src/rpc.ts';

type Identidade = { usuario_id: string; session_id: string };
type Autorizacao =
  | { estado: 'autorizado'; identidade: Identidade }
  | {
      estado: 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel' | 'entrada_invalida';
    };

export type ComandoExportacao =
  | { operacao: 'ler'; paciente_id: string }
  | ({ operacao: 'registrar'; paciente_id: string } & Record<string, unknown>)
  | ({ operacao: 'confirmar'; paciente_id: string } & Record<string, unknown>);

const OPERACAO_RPC = {
  ler: 'api.listar_exportacoes',
  registrar: 'api.registrar_exportacao',
  confirmar: 'api.confirmar_entrega_exportacao',
} as const;

/** Composição interna da exportação de caso (FR-032/FR-033), sem rota ou privilégio de
 * banco. Autorização, audiência e auditoria pertencem ao banco.
 *
 * Este fluxo legado guarda manifesto/entrega humana e cifra seus metadados; não monta
 * conteúdo clínico. A emissão adicional FR-066 fica em turno-execucao-caso-pdf.ts,
 * que resolve no servidor as versões autorizadas sem alterar a entrega/conferência FR-033.
 */
/** FR-033: completa o manifesto com a PONTE para os bytes de cada item que tem arquivo.
 *
 * É derivação, não transporte de dado novo: para `fonte='documento'` o `registro_id` do item
 * JÁ É o `documento_id` que a rota autorizada de arquivo recebe (ver
 * `cadastro.linha_tempo_caso`, que projeta `v.documento_id` nessa coluna). Por isso não há
 * migração: nada precisa ser gravado no banco para que o navegador saiba o que pedir.
 *
 * Nome, mime e tamanho ficam nulos de propósito — vivem dentro do envelope cifrado do
 * documento e esta composição não decifra nada. O navegador deriva o nome do identificador.
 *
 * Só item `incluido` ganha a ponte: o que a audiência não alcança não entra no manifesto, e
 * o que já está `indisponivel` não tem byte a pedir. */
export function manifestoComArquivos(dados: RegistroExportacoes): RegistroExportacoes {
  return {
    ...dados,
    exportacoes: dados.exportacoes.map((exportacao) => ({
      ...exportacao,
      itens: exportacao.itens.map((item) =>
        item.fonte === 'documento' && item.disponibilidade === 'incluido'
          ? {
              ...item,
              arquivo: {
                origem: 'documento' as const,
                id: item.registro_id,
                nome: null,
                mime: null,
                tamanho_bytes: null,
              },
            }
          : item,
      ),
    })),
  };
}

export async function operarExportacaoNativa(
  request: Request,
  comando: ComandoExportacao,
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
    cifra: { cifrar(valor: string, aad: MetadadosAad): Promise<CampoCifrado> };
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
      const registroId = crypto.randomUUID();
      if (comando.operacao === 'registrar') {
        const { operacao: _operacao, paciente_id: _paciente, ...campos } = comando;
        const corpo = registrarExportacaoSchema.safeParse(campos);
        if (!corpo.success) return erro('entrada_invalida');
        if (
          (corpo.data.periodo_de === undefined) !== (corpo.data.periodo_ate === undefined) ||
          (corpo.data.periodo_de !== undefined &&
            corpo.data.periodo_ate !== undefined &&
            Date.parse(corpo.data.periodo_ate) <= Date.parse(corpo.data.periodo_de))
        )
          return erro('entrada_invalida');
        corpoLogico = { ...corpo.data };
        const aad = (campo: 'destinatario' | 'proposito'): MetadadosAad => ({
          tabela: 'cadastro.exportacao_caso',
          paciente_id: pacienteId,
          registro_id: registroId,
          versao: 1,
          campo,
          formato: 1,
        });
        Object.assign(entrada, {
          finalidade: corpo.data.finalidade,
          destinatario_cifrado: await portas.cifra.cifrar(
            corpo.data.destinatario,
            aad('destinatario'),
          ),
          proposito_cifrado: await portas.cifra.cifrar(corpo.data.proposito, aad('proposito')),
          ...(corpo.data.periodo_de === undefined
            ? {}
            : { periodo_de: corpo.data.periodo_de, periodo_ate: corpo.data.periodo_ate }),
        });
      } else {
        const { operacao: _operacao, paciente_id: _paciente, ...campos } = comando;
        const corpo = confirmarEntregaSchema.safeParse(campos);
        if (!corpo.success) return erro('entrada_invalida');
        corpoLogico = { ...corpo.data };
        Object.assign(entrada, {
          exportacao_id: corpo.data.exportacao_id.toLowerCase(),
          ato: corpo.data.ato,
          ...(corpo.data.observacao === undefined
            ? {}
            : {
                observacao_cifrada: await portas.cifra.cifrar(corpo.data.observacao, {
                  tabela: 'cadastro.exportacao_entrega',
                  paciente_id: pacienteId,
                  registro_id: registroId,
                  versao: 1,
                  campo: 'observacao',
                  formato: 1,
                }),
              }),
        });
      }
      const digest = await portas.idempotencia.calcularDigestIdempotencia(
        portas.atestador.canonicalizar({ paciente_id: pacienteId, ...corpoLogico }),
      );
      if (!/^[A-Za-z0-9_-]{43}$/.test(digest)) throw new Error();
      Object.assign(entrada, {
        registro_id: registroId,
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
    const resposta = respostaExportacaoPrivadaSchema.parse(
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
    return {
      ok: true as const,
      dados: manifestoComArquivos(resposta.dados),
      request_id: requestId,
    };
  } catch {
    return erro(iniciada ? 'pendencia_externa' : 'servico_indisponivel');
  }
}
