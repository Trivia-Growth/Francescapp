import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  tarefaCuidadoSchema,
  conteudoTarefaSchema,
  respostaTarefaPrivadaSchema,
} from '../../../packages/contracts/src/tarefa-cuidado.ts';
import {
  campoCifradoSchema,
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
  type MetadadosAad,
  type CampoCifrado,
} from '../../../packages/contracts/src/rpc.ts';

type Aad = Extract<MetadadosAad, { tabela: 'cadastro.tarefa_cuidado_versao' }>;
type Identidade = { usuario_id: string; session_id: string };
type Autorizacao =
  | { estado: 'autorizado'; identidade: Identidade }
  | { estado: 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel' };
export type ComandoTarefa =
  | { operacao: 'ler'; paciente_id: string }
  | {
      operacao: 'gravar';
      paciente_id: string;
      tarefa_id: string;
      versao_esperada: number;
      reserva_id: string;
      geracao_reserva: number;
      tarefa: unknown;
    };

/** Operação privada: a RPC revalida profissional e vínculo ativo e audita transacionalmente. */
export async function operarTarefaCuidadoNativo(
  request: Request,
  comando: ComandoTarefa,
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
  const erro = (codigo: string) => ({
    ok: false as const,
    erro: { codigo },
    request_id: requestId,
  });
  let iniciada = false;
  try {
    const paciente = uuidSchema.safeParse(comando.paciente_id);
    if (!paciente.success || !['ler', 'gravar'].includes(comando.operacao))
      return erro('entrada_invalida');
    const pacienteId = paciente.data.toLowerCase();
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
    const entrada: Record<string, unknown> = { request_id: requestId, paciente_id: pacienteId };
    if (comando.operacao === 'gravar') {
      const chave = chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia'));
      const tarefa = tarefaCuidadoSchema.safeParse(comando.tarefa);
      const id = uuidSchema.safeParse(comando.tarefa_id);
      const reserva = uuidSchema.safeParse(comando.reserva_id);
      if (
        !chave.success ||
        !tarefa.success ||
        !id.success ||
        !reserva.success ||
        !Number.isSafeInteger(comando.geracao_reserva) ||
        comando.geracao_reserva < 1 ||
        !Number.isInteger(comando.versao_esperada) ||
        comando.versao_esperada < 0 ||
        comando.versao_esperada >= 2147483647
      )
        return erro('entrada_invalida');
      const registroId = crypto.randomUUID();
      const aad: Aad = {
        tabela: 'cadastro.tarefa_cuidado_versao',
        paciente_id: pacienteId,
        tarefa_id: id.data.toLowerCase(),
        registro_id: registroId,
        versao: comando.versao_esperada + 1,
        campo: 'conteudo',
        formato: 1,
      };
      const conteudo = conteudoTarefaSchema.parse({
        tarefa: tarefa.data,
        ator_usuario_id: identidade.usuario_id,
        data: new Date().toISOString(),
      });
      if (new TextEncoder().encode(JSON.stringify(conteudo)).length > 23000)
        return erro('entrada_invalida');
      const digest = await portas.idempotencia.calcularDigestIdempotencia(
        portas.atestador.canonicalizar({
          paciente_id: pacienteId,
          tarefa_id: aad.tarefa_id,
          versao_esperada: comando.versao_esperada,
          tarefa: tarefa.data,
        }),
      );
      if (!/^[A-Za-z0-9_-]{43}$/.test(digest)) throw new Error();
      Object.assign(entrada, {
        reserva_id: reserva.data.toLowerCase(),
        geracao_reserva: comando.geracao_reserva,
        chave_idempotencia: chave.data,
        digest_idempotencia: digest,
        tarefa_id: aad.tarefa_id,
        registro_id: registroId,
        versao_esperada: comando.versao_esperada,
        conteudo: campoCifradoSchema.parse(
          await portas.cifra.cifrar(JSON.stringify(conteudo), aad),
        ),
        aad,
      });
    }
    const metadados = dadosAtestadoSchema.omit({ digest_entrada: true }).parse({
      ...portas.metadados(requestId),
      ...identidade,
      operacao:
        comando.operacao === 'ler' ? 'api.ler_tarefas_cuidado' : 'api.gravar_tarefa_cuidado',
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
    const resposta = respostaTarefaPrivadaSchema.parse(
      await portas.executar(request, {
        p_transporte: {
          entrada: { ...entrada, atestado: prova.atestado },
          entrada_canonica: prova.entradaCanonica,
          dados_canonicos: prova.dadosCanonicos,
        },
      }),
    );
    if (request.signal.aborted || resposta.request_id !== requestId) throw new Error();
    if (!resposta.ok) return erro(resposta.erro.codigo);
    const registros = Array.isArray(resposta.dados) ? resposta.dados : [resposta.dados];
    if ((comando.operacao === 'ler') !== Array.isArray(resposta.dados)) throw new Error();
    if (
      comando.operacao === 'gravar' &&
      (registros.length !== 1 ||
        registros[0]?.tarefa_id !== entrada.tarefa_id ||
        registros[0]?.versao !== comando.versao_esperada + 1)
    )
      throw new Error();
    const vistos = new Set<string>();
    const resultado = [];
    for (const registro of registros) {
      if (
        registro.paciente_id.toLowerCase() !== pacienteId ||
        vistos.has(registro.tarefa_id.toLowerCase())
      )
        throw new Error();
      vistos.add(registro.tarefa_id.toLowerCase());
      const aad: Aad = {
        tabela: 'cadastro.tarefa_cuidado_versao',
        paciente_id: pacienteId,
        tarefa_id: registro.tarefa_id.toLowerCase(),
        registro_id: registro.registro_id.toLowerCase(),
        versao: registro.versao,
        campo: 'conteudo',
        formato: 1,
      };
      resultado.push({
        tarefa_id: aad.tarefa_id,
        versao: registro.versao,
        ...conteudoTarefaSchema.parse(
          JSON.parse(await portas.cifra.decifrar(registro.conteudo, aad)),
        ),
      });
    }
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
      dados: comando.operacao === 'ler' ? resultado : resultado[0],
      request_id: requestId,
    };
  } catch {
    return erro(iniciada ? 'pendencia_externa' : 'servico_indisponivel');
  }
}
