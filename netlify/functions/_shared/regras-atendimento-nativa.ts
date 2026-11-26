import { uuidSchema } from '../../../packages/contracts/src/comum.ts';
import { respostaRegrasAtendimentoPrivadaSchema } from '../../../packages/contracts/src/regras-atendimento.ts';
import {
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
} from '../../../packages/contracts/src/rpc.ts';

type Identidade = { usuario_id: string; session_id: string };
type Autorizacao =
  | { estado: 'autorizado'; identidade: Identidade }
  | { estado: 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel' };

/** Operação interna sem rota ou grant; o banco autoriza (sessão ativa, qualquer perfil) e audita.
 *
 * Somente leitura, sem parâmetro e sem ledger de idempotência: o conteúdo é o mesmo para toda
 * sessão autenticada e repetir a consulta não tem efeito. Não há dado pessoal na resposta. */
export async function consultarRegrasAtendimentoNativa(
  request: Request,
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
  const erro = (codigo: 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel') => ({
    ok: false as const,
    erro: { codigo },
    request_id: requestId,
  });
  try {
    if (request.signal.aborted) return erro('servico_indisponivel');
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
    const entrada: Record<string, unknown> = { request_id: requestId };
    const metadados = dadosAtestadoSchema.omit({ digest_entrada: true }).parse({
      ...portas.metadados(requestId),
      ...identidade,
      operacao: 'api.consultar_regras_atendimento',
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
    const resposta = respostaRegrasAtendimentoPrivadaSchema.parse(
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
