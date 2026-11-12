import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  itemHabilitacaoSchema,
  respostaHabilitacaoPrivadaSchema,
  type ItemHabilitacao,
} from '../../../packages/contracts/src/habilitacao-plano-crise.ts';
import {
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
  type CampoCifrado,
} from '../../../packages/contracts/src/rpc.ts';

type AadEmail = {
  tabela: 'identidade.concessao_equipe';
  registro_id: string;
  campo: 'email';
  formato: 1;
};
type Identidade = { usuario_id: string; session_id: string };
type Autorizacao =
  | { estado: 'autorizado'; identidade: Identidade }
  | { estado: 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel' };
type Comando =
  | { operacao: 'listar' }
  | { operacao: 'gravar'; concessao_id: string; habilitado: unknown; versao_esperada: number };

/** Marca de habilitação para aprovar plano de crise (FR-020), sem rota ou privilégio de banco.
 * O banco autoriza (administrador-only) e audita; aqui só há atestado, idempotência e a
 * decifragem do e-mail, que nunca sai do servidor em texto claro por outro caminho. */
export async function operarHabilitacaoCriseNativa(
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
    cifra: { decifrar(valor: CampoCifrado, aad: AadEmail): Promise<string> };
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
      | 'servico_indisponivel'
      | 'conflito_versao'
      | 'conflito_idempotencia'
      | 'pendencia_externa',
  ) => ({ ok: false as const, erro: { codigo }, request_id: requestId });
  let iniciada = false;
  try {
    if (request.signal.aborted) return erro('servico_indisponivel');
    if (comando.operacao !== 'listar' && comando.operacao !== 'gravar')
      return erro('entrada_invalida');
    let concessaoId: string | undefined;
    let habilitado: boolean | undefined;
    let chaveIdempotencia: string | undefined;
    if (comando.operacao === 'gravar') {
      const chave = chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia'));
      const id = uuidSchema.safeParse(comando.concessao_id);
      if (
        !chave.success ||
        !id.success ||
        typeof comando.habilitado !== 'boolean' ||
        !Number.isInteger(comando.versao_esperada) ||
        comando.versao_esperada < 0 ||
        comando.versao_esperada >= 2147483647
      )
        return erro('entrada_invalida');
      chaveIdempotencia = chave.data;
      concessaoId = id.data.toLowerCase();
      habilitado = comando.habilitado;
    }
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
    if (comando.operacao === 'gravar' && concessaoId !== undefined) {
      const digest = await portas.idempotencia.calcularDigestIdempotencia(
        portas.atestador.canonicalizar({
          concessao_id: concessaoId,
          habilitado,
          versao_esperada: comando.versao_esperada,
        }),
      );
      if (!/^[A-Za-z0-9_-]{43}$/.test(digest)) throw new Error();
      Object.assign(entrada, {
        concessao_id: concessaoId,
        habilitado,
        versao_esperada: comando.versao_esperada,
        chave_idempotencia: chaveIdempotencia,
        digest_idempotencia: digest,
        auditoria_id: crypto.randomUUID(),
      });
    }
    const metadados = dadosAtestadoSchema.omit({ digest_entrada: true }).parse({
      ...portas.metadados(requestId),
      ...identidade,
      operacao:
        comando.operacao === 'listar'
          ? 'api.listar_habilitacao_plano_crise'
          : 'api.gravar_habilitacao_plano_crise',
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
    iniciada = comando.operacao === 'gravar';
    const resposta = respostaHabilitacaoPrivadaSchema.parse(
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
    if ((comando.operacao === 'listar') !== Array.isArray(resposta.dados)) throw new Error();
    const brutos = Array.isArray(resposta.dados) ? resposta.dados : [resposta.dados];
    const itens: ItemHabilitacao[] = [];
    for (const bruto of brutos) {
      if (request.signal.aborted) throw new Error();
      const email = await portas.cifra.decifrar(bruto.email, {
        tabela: 'identidade.concessao_equipe',
        registro_id: bruto.concessao_id,
        campo: 'email',
        formato: 1,
      });
      itens.push(itemHabilitacaoSchema.parse({ ...bruto, email }));
    }
    const primeiro = itens[0];
    if (
      comando.operacao === 'gravar' &&
      (!primeiro ||
        primeiro.concessao_id.toLowerCase() !== concessaoId ||
        primeiro.habilitado !== habilitado ||
        primeiro.versao !== comando.versao_esperada + 1)
    )
      throw new Error();
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
      dados: comando.operacao === 'listar' ? itens : primeiro,
      request_id: requestId,
    };
  } catch {
    return erro(iniciada ? 'pendencia_externa' : 'servico_indisponivel');
  }
}
