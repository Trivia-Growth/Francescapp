import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  conteudoOrientacaoSchema,
  orientacaoSchema,
  respostaOrientacaoPrivadaSchema,
  situacaoOrientacaoSchema,
  type Orientacao,
} from '../../../packages/contracts/src/orientacao.ts';
import {
  campoCifradoSchema,
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
  type CampoCifrado,
} from '../../../packages/contracts/src/rpc.ts';

type Aad = {
  tabela: 'cadastro.orientacao_versao';
  paciente_id: string;
  orientacao_id: string;
  registro_id: string;
  versao: number;
  campo: 'conteudo';
  formato: 1;
};
type Identidade = { usuario_id: string; session_id: string };
type Autorizacao =
  | { estado: 'autorizado'; identidade: Identidade }
  | { estado: 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel' };
type Comando =
  | { operacao: 'ler'; paciente_id: string; apenas_vigentes?: boolean }
  | {
      operacao: 'gravar';
      paciente_id: string;
      orientacao_id?: string;
      versao_esperada: number;
      situacao: unknown;
      texto: unknown;
      autor: unknown;
      data: unknown;
      destinatarios: unknown;
      validade: unknown;
    };

/** Composição interna, sem rota ou privilégio de banco. Texto, autor declarado, data,
 * destinatários e validade são conteúdo clínico e viajam cifrados; só a situação fica em
 * claro, porque FR-019 exige que a superada nunca pareça atual sem decifrar nada. */
export async function operarOrientacaoNativa(
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
    if (
      comando.operacao === 'ler' &&
      comando.apenas_vigentes !== undefined &&
      typeof comando.apenas_vigentes !== 'boolean'
    )
      return erro('entrada_invalida');
    let orientacaoId: string | undefined;
    let situacao: Orientacao['situacao'] | undefined;
    let conteudo: ReturnType<typeof conteudoOrientacaoSchema.parse> | undefined;
    if (comando.operacao === 'gravar') {
      if (!chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia')).success)
        return erro('entrada_invalida');
      if (
        !Number.isInteger(comando.versao_esperada) ||
        comando.versao_esperada < 0 ||
        comando.versao_esperada >= 2147483647
      )
        return erro('entrada_invalida');
      // Criar e revisar são caminhos distintos: versão zero sem identificador, revisão com ele.
      if (comando.versao_esperada === 0) {
        if (comando.orientacao_id !== undefined) return erro('entrada_invalida');
        orientacaoId = crypto.randomUUID();
      } else {
        const alvo = uuidSchema.safeParse(comando.orientacao_id);
        if (!alvo.success) return erro('entrada_invalida');
        orientacaoId = alvo.data.toLowerCase();
      }
      const situacaoValidada = situacaoOrientacaoSchema.safeParse(comando.situacao);
      const conteudoValidado = conteudoOrientacaoSchema.safeParse({
        texto: comando.texto,
        autor: comando.autor,
        data: comando.data,
        destinatarios: comando.destinatarios,
        validade: comando.validade ?? null,
      });
      if (!situacaoValidada.success || !conteudoValidado.success) return erro('entrada_invalida');
      // Uma orientação nova nasce vigente; o banco recusa o contrário, mas falhar aqui
      // evita gastar cifra e atestado num pedido que já se sabe inválido.
      if (comando.versao_esperada === 0 && situacaoValidada.data !== 'vigente')
        return erro('entrada_invalida');
      situacao = situacaoValidada.data;
      conteudo = conteudoValidado.data;
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
    if (comando.operacao === 'ler' && comando.apenas_vigentes === true)
      entrada.apenas_vigentes = true;
    if (comando.operacao === 'gravar' && orientacaoId && conteudo) {
      const registroId = crypto.randomUUID();
      const aad: Aad = {
        tabela: 'cadastro.orientacao_versao',
        paciente_id: pacienteId,
        orientacao_id: orientacaoId,
        registro_id: registroId,
        versao: comando.versao_esperada + 1,
        campo: 'conteudo',
        formato: 1,
      };
      Object.assign(entrada, {
        orientacao_id: orientacaoId,
        registro_id: registroId,
        versao_esperada: comando.versao_esperada,
        situacao,
        conteudo: campoCifradoSchema.parse(
          await portas.cifra.cifrar(JSON.stringify(conteudo), aad),
        ),
        aad,
      });
    }
    const metadados = dadosAtestadoSchema.omit({ digest_entrada: true }).parse({
      ...portas.metadados(requestId),
      ...identidade,
      operacao: comando.operacao === 'gravar' ? 'api.gravar_orientacao' : 'api.ler_orientacoes',
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
    const resposta = respostaOrientacaoPrivadaSchema.parse(
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
      return erro(resposta.erro.codigo === 'conflito' ? 'conflito_versao' : 'sem_permissao');
    // Forma da resposta é parte do contrato: lista devolve coleção, gravação devolve um registro.
    if ((comando.operacao === 'ler') !== Array.isArray(resposta.dados)) throw new Error();
    const registros = Array.isArray(resposta.dados) ? resposta.dados : [resposta.dados];
    if (
      comando.operacao === 'gravar' &&
      (registros[0]?.registro_id !== entrada.registro_id ||
        registros[0]?.orientacao_id !== orientacaoId ||
        registros[0]?.versao !== comando.versao_esperada + 1 ||
        registros[0]?.situacao !== situacao)
    )
      throw new Error();
    const resultado: Orientacao[] = [];
    for (const registro of registros) {
      if (registro.paciente_id.toLowerCase() !== pacienteId) throw new Error();
      const aad: Aad = {
        tabela: 'cadastro.orientacao_versao',
        paciente_id: pacienteId,
        orientacao_id: registro.orientacao_id.toLowerCase(),
        registro_id: registro.registro_id.toLowerCase(),
        versao: registro.versao,
        campo: 'conteudo',
        formato: 1,
      };
      const claro = conteudoOrientacaoSchema.parse(
        JSON.parse(await portas.cifra.decifrar(registro.conteudo, aad)),
      );
      resultado.push(
        orientacaoSchema.parse({
          ...claro,
          orientacao_id: registro.orientacao_id,
          versao: registro.versao,
          situacao: registro.situacao,
          registrado_em: registro.criado_em,
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
