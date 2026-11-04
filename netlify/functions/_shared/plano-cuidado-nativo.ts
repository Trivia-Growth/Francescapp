import { uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  objetivoSchema,
  motivoPlanoSchema,
  conteudoPlanoSchema,
  respostaPlanoPrivadaSchema,
  type Objetivo,
} from '../../../packages/contracts/src/plano-cuidado.ts';
import {
  campoCifradoSchema,
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
  type MetadadosAad,
  type CampoCifrado,
} from '../../../packages/contracts/src/rpc.ts';

type Aad = Extract<MetadadosAad, { tabela: 'cadastro.objetivo_cuidado_versao' }>;
type Identidade = { usuario_id: string; session_id: string };
type Autorizacao =
  | { estado: 'autorizado'; identidade: Identidade }
  | { estado: 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel' };
type Comando =
  | { operacao: 'ler'; paciente_id: string }
  | {
      operacao: 'gravar';
      paciente_id: string;
      objetivo_id: string;
      versao_esperada: number;
      objetivo: unknown;
      motivo?: unknown;
    };
/** Operação interna sem rota ou grant; banco autoriza e audita antes da leitura. */
export async function operarPlanoCuidadoNativo(
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
      | 'servico_indisponivel'
      | 'conflito_versao'
      | 'pendencia_externa',
  ) => ({ ok: false as const, erro: { codigo }, request_id: requestId });
  let iniciada = false;
  try {
    if (request.signal.aborted) return erro('servico_indisponivel');
    const paciente = uuidSchema.safeParse(comando.paciente_id);
    if (!paciente.success || (comando.operacao !== 'ler' && comando.operacao !== 'gravar'))
      return erro('entrada_invalida');
    const pacienteId = paciente.data.toLowerCase();
    let objetivoId: string | undefined;
    let objetivo: Objetivo | undefined;
    let motivo: string | undefined;
    if (comando.operacao === 'gravar') {
      const id = uuidSchema.safeParse(comando.objetivo_id);
      const valor = objetivoSchema.safeParse(comando.objetivo);
      const razao = motivoPlanoSchema.safeParse(comando.motivo);
      if (
        !id.success ||
        !valor.success ||
        !Number.isInteger(comando.versao_esperada) ||
        comando.versao_esperada < 0 ||
        comando.versao_esperada >= 2147483647 ||
        (comando.versao_esperada > 0 && !razao.success) ||
        (comando.motivo !== undefined && !razao.success)
      )
        return erro('entrada_invalida');
      objetivoId = id.data.toLowerCase();
      objetivo = valor.data;
      motivo = razao.success ? razao.data : undefined;
      if (new TextEncoder().encode(JSON.stringify({ objetivo, motivo })).length > 23_000)
        return erro('entrada_invalida');
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
    const entrada: Record<string, unknown> = { request_id: requestId, paciente_id: pacienteId };
    if (comando.operacao === 'gravar' && objetivoId && objetivo) {
      const registroId = crypto.randomUUID();
      const aad: Aad = {
        tabela: 'cadastro.objetivo_cuidado_versao',
        paciente_id: pacienteId,
        objetivo_id: objetivoId,
        registro_id: registroId,
        versao: comando.versao_esperada + 1,
        campo: 'conteudo',
        formato: 1,
      };
      const conteudo = conteudoPlanoSchema.parse({
        objetivo,
        ...(motivo === undefined ? {} : { motivo }),
        ator_usuario_id: identidade.usuario_id,
        data: new Date().toISOString(),
      });
      Object.assign(entrada, {
        objetivo_id: objetivoId,
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
        comando.operacao === 'ler' ? 'api.ler_plano_cuidado' : 'api.gravar_objetivo_cuidado',
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
    const resposta = respostaPlanoPrivadaSchema.parse(
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
    if ((comando.operacao === 'ler') !== Array.isArray(resposta.dados)) throw new Error();
    const registros = Array.isArray(resposta.dados) ? resposta.dados : [resposta.dados];
    if (
      comando.operacao === 'gravar' &&
      (registros.length !== 1 ||
        registros[0]?.registro_id !== entrada.registro_id ||
        registros[0]?.objetivo_id !== objetivoId ||
        registros[0]?.versao !== comando.versao_esperada + 1)
    )
      throw new Error();
    const vistos = new Set<string>();
    const resultado = [];
    for (const registro of registros) {
      if (
        registro.paciente_id.toLowerCase() !== pacienteId ||
        vistos.has(registro.objetivo_id.toLowerCase())
      )
        throw new Error();
      vistos.add(registro.objetivo_id.toLowerCase());
      const aad: Aad = {
        tabela: 'cadastro.objetivo_cuidado_versao',
        paciente_id: pacienteId,
        objetivo_id: registro.objetivo_id.toLowerCase(),
        registro_id: registro.registro_id.toLowerCase(),
        versao: registro.versao,
        campo: 'conteudo',
        formato: 1,
      };
      const conteudo = conteudoPlanoSchema.parse(
        JSON.parse(await portas.cifra.decifrar(registro.conteudo, aad)),
      );
      if (registro.versao > 1 && !conteudo.motivo) throw new Error();
      resultado.push({ objetivo_id: aad.objetivo_id, versao: registro.versao, ...conteudo });
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
