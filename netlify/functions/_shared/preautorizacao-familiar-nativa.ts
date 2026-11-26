import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  respostaCancelamentoPreautorizacaoPrivadaSchema,
  respostaListaPreautorizacoesPrivadaSchema,
} from '../../../packages/contracts/src/identidade.ts';
import {
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
} from '../../../packages/contracts/src/rpc.ts';

type Identidade = { usuario_id: string; session_id: string };
type Autorizacao =
  | { estado: 'autorizado'; identidade: Identidade }
  | { estado: 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel' };
type Comando =
  | { operacao: 'listar'; paciente_id: string }
  | { operacao: 'cancelar'; convite_id: string; motivo_cifrado: unknown };

/** Operação administrativa de pré-autorização familiar, server-only.
 * A listagem é leitura e vai direto à RPC, que confere a sessão administrativa no
 * banco. O cancelamento é mutação: atestado assinado no servidor, chave de
 * idempotência no ledger e auditoria nos dois caminhos ficam na própria SQL. */
export async function operarPreautorizacaoFamiliarNativa(
  request: Request,
  comando: Comando,
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
    listar(
      request: Request,
      entrada: { p_request_id: string; p_paciente_id: string },
    ): Promise<unknown>;
    cancelar(
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
      | 'conflito_idempotencia'
      | 'pendencia_externa',
  ) => ({ ok: false as const, erro: { codigo }, request_id: requestId });
  let iniciada = false;
  try {
    if (request.signal.aborted) return erro('servico_indisponivel');
    const inicial = await portas.autorizar(request);
    if (inicial.estado !== 'autorizado') return erro(inicial.estado);
    const identidade = {
      usuario_id: inicial.identidade.usuario_id.toLowerCase(),
      session_id: inicial.identidade.session_id.toLowerCase(),
    };

    if (comando.operacao === 'listar') {
      if (!uuidSchema.safeParse(comando.paciente_id).success) return erro('entrada_invalida');
      const resposta = respostaListaPreautorizacoesPrivadaSchema.parse(
        await portas.listar(request, {
          p_request_id: requestId,
          p_paciente_id: comando.paciente_id,
        }),
      );
      if (request.signal.aborted || resposta.request_id !== requestId) throw new Error();
      if (!resposta.ok) return erro('sem_permissao');
      const atual = await portas.revalidar(request);
      if (
        request.signal.aborted ||
        atual.estado !== 'autorizado' ||
        atual.identidade.usuario_id.toLowerCase() !== identidade.usuario_id ||
        atual.identidade.session_id.toLowerCase() !== identidade.session_id
      )
        return erro('nao_autenticado');
      return { ok: true as const, dados: resposta.dados, request_id: requestId };
    }

    const chave = chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia'));
    if (!chave.success || !uuidSchema.safeParse(comando.convite_id).success)
      return erro('entrada_invalida');
    const digest = await portas.idempotencia.calcularDigestIdempotencia(
      portas.atestador.canonicalizar({
        convite_id: comando.convite_id,
        motivo_cifrado: comando.motivo_cifrado,
      }),
    );
    if (!/^[A-Za-z0-9_-]{43}$/.test(digest)) throw new Error();
    const entrada: Record<string, unknown> = {
      request_id: requestId,
      convite_id: comando.convite_id,
      motivo_cifrado: comando.motivo_cifrado,
      chave_idempotencia: chave.data,
      digest_idempotencia: digest,
    };
    const metadados = dadosAtestadoSchema.omit({ digest_entrada: true }).parse({
      ...portas.metadados(requestId),
      ...identidade,
      operacao: 'api.cancelar_preautorizacao_familiar',
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
    iniciada = true;
    const resposta = respostaCancelamentoPreautorizacaoPrivadaSchema.parse(
      await portas.cancelar(request, {
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
        resposta.erro.codigo === 'conflito_idempotencia'
          ? 'conflito_idempotencia'
          : 'sem_permissao',
      );
    if (resposta.convite_id !== comando.convite_id) throw new Error();
    const atual = await portas.revalidar(request);
    if (
      request.signal.aborted ||
      atual.estado !== 'autorizado' ||
      atual.identidade.usuario_id.toLowerCase() !== identidade.usuario_id ||
      atual.identidade.session_id.toLowerCase() !== identidade.session_id
    )
      return erro('pendencia_externa');
    return {
      ok: true as const,
      dados: {
        convite_id: resposta.convite_id,
        repeticao: resposta.repeticao,
        acessos_fechados: resposta.acessos_fechados ?? 0,
      },
      request_id: requestId,
    };
  } catch {
    return erro(iniciada ? 'pendencia_externa' : 'servico_indisponivel');
  }
}
