import { uuidSchema } from '../../../packages/contracts/src/comum.ts';
import { respostaConsultaAuditoriaPrivadaSchema } from '../../../packages/contracts/src/auditoria.ts';
import {
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
} from '../../../packages/contracts/src/rpc.ts';

type Identidade = { usuario_id: string; session_id: string };
type Autorizacao =
  | { estado: 'autorizado'; identidade: Identidade }
  | { estado: 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel' };
export type ComandoConsultaAuditoria = {
  limite: number;
  cursor?: string;
  ator_id?: string;
  objeto_id?: string;
  paciente_id?: string;
  acao?: string;
  resultado?: 'permitido' | 'negado' | 'falhou';
  instante_de?: string;
  instante_ate?: string;
};

/** Operação interna sem rota ou grant; o banco autoriza (administrador-only) e audita a própria
 * consulta antes de devolver a página (FR-039 manda registrar consultas).
 *
 * Somente leitura: não há ledger de idempotência nem `auditoria_id` do chamador. Repetir a
 * consulta é inofensivo e cada repetição é um evento legítimo da trilha. O conteúdo clínico não
 * passa por aqui — o grant de coluna no banco não inclui `motivo_cifrado`. */
export async function consultarAuditoriaNativa(
  request: Request,
  comando: ComandoConsultaAuditoria,
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
    codigo: 'entrada_invalida' | 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel',
  ) => ({ ok: false as const, erro: { codigo }, request_id: requestId });
  try {
    if (request.signal.aborted) return erro('servico_indisponivel');
    if (!Number.isInteger(comando.limite) || comando.limite < 1 || comando.limite > 100)
      return erro('entrada_invalida');
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
    // Só os filtros informados entram na entrada atestada: a operação privada recusa chave
    // desconhecida e trata ausência como "sem filtro".
    const entrada: Record<string, unknown> = { request_id: requestId, limite: comando.limite };
    for (const campo of [
      'cursor',
      'ator_id',
      'objeto_id',
      'paciente_id',
      'acao',
      'resultado',
      'instante_de',
      'instante_ate',
    ] as const) {
      const valor = comando[campo];
      if (valor !== undefined) entrada[campo] = valor;
    }
    const metadados = dadosAtestadoSchema.omit({ digest_entrada: true }).parse({
      ...portas.metadados(requestId),
      ...identidade,
      operacao: 'api.consultar_auditoria',
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
    const resposta = respostaConsultaAuditoriaPrivadaSchema.parse(
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
    if (resposta.dados.itens.length > comando.limite) throw new Error();
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
