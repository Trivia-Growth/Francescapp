import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import { respostaCampoExtraPlanoPrivadaSchema } from '../../../packages/contracts/src/plano-cuidado.ts';
import {
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
} from '../../../packages/contracts/src/rpc.ts';

type Identidade = { usuario_id: string; session_id: string };
type Autorizacao =
  | { estado: 'autorizado'; identidade: Identidade }
  | { estado: 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel' };
type Comando =
  | { operacao: 'listar' }
  | {
      operacao: 'gravar';
      campo_id: string;
      nome: string;
      tipo: string;
      opcoes: unknown;
      ativo: unknown;
      versao_esperada: number;
    };

const tipos = ['texto', 'numero', 'data', 'lista'] as const;

/** Operação interna sem rota ou grant; banco autoriza (administrador-only) e audita
 * antes de ler ou gravar. Catálogo não é conteúdo clínico: sem cifra, sem AAD. */
export async function operarCampoExtraPlanoNativo(
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
    let campoId: string | undefined;
    let nome: string | undefined;
    let tipo: (typeof tipos)[number] | undefined;
    let opcoes: readonly string[] | null | undefined;
    let ativo: boolean | undefined;
    let chaveIdempotencia: string | undefined;
    if (comando.operacao === 'gravar') {
      const chave = chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia'));
      const id = uuidSchema.safeParse(comando.campo_id);
      const nomeValidado = typeof comando.nome === 'string' ? comando.nome.trim() : '';
      const tipoValidado = tipos.find((valor) => valor === comando.tipo);
      if (
        !chave.success ||
        !id.success ||
        nomeValidado.length === 0 ||
        nomeValidado.length > 120 ||
        !tipoValidado ||
        typeof comando.ativo !== 'boolean' ||
        !Number.isInteger(comando.versao_esperada) ||
        comando.versao_esperada < 0 ||
        comando.versao_esperada >= 2147483647
      )
        return erro('entrada_invalida');
      if (tipoValidado === 'lista') {
        if (
          !Array.isArray(comando.opcoes) ||
          comando.opcoes.length < 1 ||
          comando.opcoes.length > 20 ||
          comando.opcoes.some(
            (item) => typeof item !== 'string' || item.trim().length === 0 || item.length > 120,
          )
        )
          return erro('entrada_invalida');
        opcoes = comando.opcoes.map((item) => item.trim());
      } else {
        if (comando.opcoes !== undefined && comando.opcoes !== null)
          return erro('entrada_invalida');
        opcoes = null;
      }
      chaveIdempotencia = chave.data;
      campoId = id.data.toLowerCase();
      nome = nomeValidado;
      tipo = tipoValidado;
      ativo = comando.ativo;
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
    if (comando.operacao === 'gravar' && campoId !== undefined) {
      const digest = await portas.idempotencia.calcularDigestIdempotencia(
        portas.atestador.canonicalizar({
          campo_id: campoId,
          nome,
          tipo,
          opcoes,
          ativo,
          versao_esperada: comando.versao_esperada,
        }),
      );
      if (!/^[A-Za-z0-9_-]{43}$/.test(digest)) throw new Error();
      Object.assign(entrada, {
        campo_id: campoId,
        nome,
        tipo,
        opcoes,
        ativo,
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
          ? 'api.listar_campo_extra_plano'
          : 'api.gravar_campo_extra_plano',
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
    const resposta = respostaCampoExtraPlanoPrivadaSchema.parse(
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
    if (
      comando.operacao === 'gravar' &&
      !Array.isArray(resposta.dados) &&
      (resposta.dados.campo_id !== campoId || resposta.dados.versao !== comando.versao_esperada + 1)
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
    return { ok: true as const, dados: resposta.dados, request_id: requestId };
  } catch {
    return erro(iniciada ? 'pendencia_externa' : 'servico_indisponivel');
  }
}
