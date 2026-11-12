import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  conteudoDiarioSchema,
  conteudoEvolucaoDiarioSchema,
  conteudoRelatoDiarioSchema,
  justificativaDiarioSchema,
  registroDiarioSchema,
  respostaDiarioPrivadaSchema,
  salvarRegistroDiarioSchema,
  type RegistroDiario,
} from '../../../packages/contracts/src/diario.ts';
import {
  campoCifradoSchema,
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
  type CampoCifrado,
} from '../../../packages/contracts/src/rpc.ts';

type Aad = {
  tabela: 'cadastro.diario_registro_versao';
  paciente_id: string;
  diario_registro_id: string;
  registro_id: string;
  versao: number;
  campo: 'conteudo' | 'justificativa';
  formato: 1;
};
type Identidade = { usuario_id: string; session_id: string };
type Autorizacao =
  | { estado: 'autorizado'; identidade: Identidade }
  | { estado: 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel' };
type Comando =
  | { operacao: 'ler'; paciente_id: string }
  | ({ operacao: 'gravar'; paciente_id: string } & Record<string, unknown>);

/** Composição interna da fatia de diário (FR-008, FR-009, FR-012, FR-013, FR-014), sem rota
 * ou privilégio de banco. Autorização, audiência e auditoria pertencem ao banco; aqui há
 * cifra, atestado e idempotência.
 *
 * Duas exigências não cabem no banco, porque o banco não vê o conteúdo em claro, e por isso
 * são conferidas aqui: o relato precisa de data e descrição (FR-008) e a publicação de uma
 * evolução precisa de síntese (FR-009). O que o banco garante sozinho é autoria, data,
 * audiência, estado e a presença da justificativa na retificação. */
export async function operarDiarioNativo(
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
    if (!paciente.success || (comando.operacao !== 'ler' && comando.operacao !== 'gravar'))
      return erro('entrada_invalida');
    const pacienteId = paciente.data.toLowerCase();
    let salvar: ReturnType<typeof salvarRegistroDiarioSchema.parse> | undefined;
    let diarioId: string | undefined;
    let chaveIdempotencia: string | undefined;
    if (comando.operacao === 'gravar') {
      const chave = chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia'));
      if (!chave.success) return erro('entrada_invalida');
      chaveIdempotencia = chave.data;
      const { operacao: _operacao, paciente_id: _paciente, ...corpo } = comando;
      const validado = salvarRegistroDiarioSchema.safeParse(corpo);
      if (!validado.success) return erro('entrada_invalida');
      salvar = validado.data;
      // Criar e revisar são caminhos distintos: versão zero sem identificador, revisão com ele.
      diarioId =
        salvar.versao_esperada === 0
          ? crypto.randomUUID()
          : uuidSchema.parse(salvar.diario_registro_id).toLowerCase();
      if (new TextEncoder().encode(JSON.stringify(salvar.conteudo)).length > 24_000)
        return erro('entrada_invalida');
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
    let registroId: string | undefined;
    if (comando.operacao === 'gravar' && salvar && diarioId) {
      registroId = crypto.randomUUID();
      const versao = salvar.versao_esperada + 1;
      const aad = (campo: Aad['campo']): Aad => ({
        tabela: 'cadastro.diario_registro_versao',
        paciente_id: pacienteId,
        diario_registro_id: diarioId,
        registro_id: registroId as string,
        versao,
        campo,
        formato: 1,
      });
      const digest = await portas.idempotencia.calcularDigestIdempotencia(
        portas.atestador.canonicalizar({
          paciente_id: pacienteId,
          diario_registro_id: diarioId,
          versao_esperada: salvar.versao_esperada,
          estado: salvar.estado,
          conteudo: salvar.conteudo,
          justificativa: salvar.justificativa ?? null,
        }),
      );
      if (!/^[A-Za-z0-9_-]{43}$/.test(digest)) throw new Error();
      const aadConteudo = aad('conteudo');
      Object.assign(entrada, {
        diario_registro_id: diarioId,
        registro_id: registroId,
        versao_esperada: salvar.versao_esperada,
        tipo: salvar.tipo,
        estado: salvar.estado,
        audiencia: salvar.audiencia,
        atencao: salvar.atencao,
        retorno_solicitado: salvar.retorno_solicitado,
        origem_conteudo: salvar.origem_conteudo,
        ...(salvar.responde_registro_id === undefined
          ? {}
          : { responde_registro_id: salvar.responde_registro_id.toLowerCase() }),
        ...(salvar.tarefa_id === undefined ? {} : { tarefa_id: salvar.tarefa_id.toLowerCase() }),
        // 12/11/2026: a data do acontecimento e a área saíram do envelope, porque FR-007
        // exige buscar por elas e o banco não consegue extraí-las de dentro do ciphertext.
        // Elas continuam também dentro do conteúdo, que segue sendo a fonte de verdade de
        // quem decifra; aqui viajam em claro só para o banco filtrar e ordenar.
        ...('data' in salvar.conteudo && typeof salvar.conteudo.data === 'string'
          ? { aconteceu_em: salvar.conteudo.data }
          : {}),
        ...('area' in salvar.conteudo && typeof salvar.conteudo.area === 'string'
          ? { area: salvar.conteudo.area }
          : {}),
        conteudo: campoCifradoSchema.parse(
          await portas.cifra.cifrar(JSON.stringify(salvar.conteudo), aadConteudo),
        ),
        aad: aadConteudo,
        chave_idempotencia: chaveIdempotencia,
        digest_idempotencia: digest,
      });
      if (salvar.justificativa !== undefined) {
        const aadJustificativa = aad('justificativa');
        entrada.justificativa = campoCifradoSchema.parse(
          await portas.cifra.cifrar(JSON.stringify(salvar.justificativa), aadJustificativa),
        );
        entrada.aad_justificativa = aadJustificativa;
      }
    }
    const metadados = dadosAtestadoSchema.omit({ digest_entrada: true }).parse({
      ...portas.metadados(requestId),
      ...identidade,
      operacao: comando.operacao === 'gravar' ? 'api.gravar_diario' : 'api.ler_diario',
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
    const resposta = respostaDiarioPrivadaSchema.parse(
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
    // Forma da resposta é parte do contrato: lista devolve coleção, gravação devolve um registro.
    if ((comando.operacao === 'ler') !== Array.isArray(resposta.dados)) throw new Error();
    const registros = Array.isArray(resposta.dados) ? resposta.dados : [resposta.dados];
    // Na repetição de uma chave de idempotência o banco devolve o registro já gravado; o
    // identificador recém-sorteado não vale como confirmação, só o que voltou do banco vale.
    if (
      comando.operacao === 'gravar' &&
      salvar &&
      (registros[0]?.diario_registro_id.toLowerCase() !== diarioId ||
        registros[0]?.versao !== salvar.versao_esperada + 1 ||
        registros[0]?.estado !== salvar.estado)
    )
      throw new Error();
    const resultado: RegistroDiario[] = [];
    for (const registro of registros) {
      if (registro.paciente_id.toLowerCase() !== pacienteId) throw new Error();
      const aad = (campo: Aad['campo']): Aad => ({
        tabela: 'cadastro.diario_registro_versao',
        paciente_id: pacienteId,
        diario_registro_id: registro.diario_registro_id.toLowerCase(),
        registro_id: registro.registro_id.toLowerCase(),
        versao: registro.versao,
        campo,
        formato: 1,
      });
      const claro = conteudoDiarioSchema.parse(
        JSON.parse(await portas.cifra.decifrar(registro.conteudo, aad('conteudo'))),
      );
      // Tipo e conteúdo precisam concordar: um relato não vira evolução por vir rotulado assim.
      const esperado =
        registro.tipo === 'relato_familiar'
          ? conteudoRelatoDiarioSchema.safeParse(claro)
          : conteudoEvolucaoDiarioSchema.safeParse(claro);
      if (!esperado.success) throw new Error();
      const justificativa =
        registro.justificativa === null
          ? undefined
          : justificativaDiarioSchema.parse(
              JSON.parse(await portas.cifra.decifrar(registro.justificativa, aad('justificativa'))),
            );
      resultado.push(
        registroDiarioSchema.parse({
          diario_registro_id: registro.diario_registro_id,
          registro_id: registro.registro_id,
          versao: registro.versao,
          tipo: registro.tipo,
          autor_usuario_id: registro.autor_usuario_id,
          estado: registro.estado,
          audiencia: registro.audiencia,
          atencao: registro.atencao,
          retorno_solicitado: registro.retorno_solicitado,
          origem_conteudo: registro.origem_conteudo,
          responde_registro_id: registro.responde_registro_id,
          tarefa_id: registro.tarefa_id,
          criado_em: registro.criado_em,
          consultas: registro.consultas,
          conteudo: esperado.data,
          ...(justificativa === undefined ? {} : { justificativa }),
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
    return {
      ok: true as const,
      dados: comando.operacao === 'ler' ? resultado : resultado[0],
      request_id: requestId,
    };
  } catch {
    return erro(iniciada ? 'pendencia_externa' : 'servico_indisponivel');
  }
}
