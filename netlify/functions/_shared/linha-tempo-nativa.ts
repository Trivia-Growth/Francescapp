import { uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  consultarLinhaTempoSchema,
  respostaLinhaTempoPrivadaSchema,
} from '../../../packages/contracts/src/linha-tempo.ts';
import {
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
} from '../../../packages/contracts/src/rpc.ts';

type Identidade = { usuario_id: string; session_id: string };
type Autorizacao =
  | { estado: 'autorizado'; identidade: Identidade }
  | {
      estado: 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel' | 'entrada_invalida';
    };

export type ComandoLinhaTempo = {
  operacao: 'ler';
  paciente_id: string;
  filtros: Record<string, unknown>;
};

/** Composição interna da linha do tempo (FR-007), sem rota ou privilégio de banco.
 * Autorização, audiência e auditoria pertencem ao banco; aqui só há atestado.
 *
 * Não há idempotência porque não há escrita: a linha do tempo deriva das fatias a cada
 * consulta e não grava nada. */
export async function operarLinhaTempoNativa(
  request: Request,
  comando: ComandoLinhaTempo,
  portas: {
    autorizar(request: Request): Promise<Autorizacao>;
    revalidar(request: Request): Promise<Autorizacao>;
    metadados(requestId: string): {
      key_id: string;
      emitido_em: string;
      expira_em: string;
      request_id: string;
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
      | 'pendencia_externa',
  ) => ({ ok: false as const, erro: { codigo }, request_id: requestId });
  try {
    if (request.signal.aborted) return erro('servico_indisponivel');
    const paciente = uuidSchema.safeParse(comando.paciente_id);
    if (!paciente.success) return erro('entrada_invalida');
    const pacienteId = paciente.data.toLowerCase();
    const filtros = consultarLinhaTempoSchema.safeParse(comando.filtros);
    if (!filtros.success) return erro('entrada_invalida');
    // Só o que veio entra na entrada atestada: campo ausente não vira `null`, senão o
    // banco recusaria a entrada por chave desconhecida.
    const entrada: Record<string, unknown> = { request_id: requestId, paciente_id: pacienteId };
    for (const [chave, valor] of Object.entries(filtros.data))
      if (valor !== undefined) entrada[chave] = valor;
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
      operacao: 'api.ler_linha_tempo',
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
    const resposta = respostaLinhaTempoPrivadaSchema.parse(
      await portas.executar(request, {
        p_transporte: {
          entrada: { ...entrada, atestado: prova.atestado },
          entrada_canonica: prova.entradaCanonica,
          dados_canonicos: prova.dadosCanonicos,
        },
      }),
    );
    if (request.signal.aborted || resposta.request_id !== requestId) throw new Error();
    if (!resposta.ok) return erro('sem_permissao');
    if (resposta.dados.paciente_id.toLowerCase() !== pacienteId) throw new Error();
    const atual = await portas.revalidar(request);
    if (
      request.signal.aborted ||
      atual.estado !== 'autorizado' ||
      atual.identidade.usuario_id.toLowerCase() !== identidade.usuario_id ||
      atual.identidade.session_id.toLowerCase() !== identidade.session_id
    )
      return erro('nao_autenticado');
    return { ok: true as const, dados: resposta.dados, request_id: requestId };
  } catch {
    return erro('servico_indisponivel');
  }
}
