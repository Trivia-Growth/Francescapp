import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  conteudoFichaPlantaoSchema,
  respostaFichaPlantaoPrivadaSchema,
  submissaoFichaPlantaoSchema,
  resolucaoPendenciaEscritaSchema,
  rascunhoFichaPlantaoSchema,
  type ConteudoFichaPlantao,
} from '../../../packages/contracts/src/ficha-plantao.ts';
import type {
  FichaPlantaoProjetada,
  PendenciaPlantaoHttp,
  RascunhoFichaPlantaoProjetado,
  ResultadoFichaPlantao,
} from '../../../packages/contracts/src/ficha-plantao-http.ts';
import {
  campoCifradoSchema,
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
  type CampoCifrado,
} from '../../../packages/contracts/src/rpc.ts';

/** FR-073 a FR-077 e FR-081. Composição interna da ficha de plantão, sem rota pública e sem
 * privilégio de banco: autorização, auditoria e atomicidade pertencem a
 * `operacao.ficha_plantao_operacao_privada`, que grava tudo numa transação só. Aqui há
 * cifra, atestado e idempotência — e nenhuma decisão de acesso. O papel declarado que
 * trafega é rótulo de registro e não participa de decisão nenhuma (FR-079). */

const TABELA_FICHA = 'cadastro.turno_plantao_versao' as const;
const TABELA_PENDENCIA = 'cadastro.turno_plantao_pendencia_versao' as const;
const TABELA_RESPOSTA = 'cadastro.turno_plantao_resposta_versao' as const;
const TABELA_RASCUNHO = 'cadastro.ficha_plantao_rascunho' as const;

type AadFicha = {
  tabela: typeof TABELA_FICHA;
  registro_id: string;
  campo: 'atividades' | 'observacoes' | 'motivo';
  formato: 1;
};
type AadPendencia = {
  tabela: typeof TABELA_PENDENCIA;
  registro_id: string;
  campo: 'conteudo' | 'motivo';
  formato: 1;
};
type AadResposta = {
  tabela: typeof TABELA_RESPOSTA;
  registro_id: string;
  campo: 'conteudo';
  formato: 1;
};
type AadRascunho = {
  tabela: typeof TABELA_RASCUNHO;
  registro_id: string;
  campo: 'conteudo';
  formato: 1;
};
type Aad = AadFicha | AadPendencia | AadResposta | AadRascunho;

type Identidade = { usuario_id: string; session_id: string };
type Autorizacao =
  | { estado: 'autorizado'; identidade: Identidade }
  | { estado: 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel' };

export type ComandoFichaPlantao =
  | { operacao: 'consultar'; paciente_id: string; turno_id: string }
  | { operacao: 'pendencias'; paciente_id: string }
  | { operacao: 'rascunho_ler'; paciente_id: string; turno_id: string }
  | { operacao: 'rascunho_salvar'; paciente_id: string; corpo: unknown }
  | { operacao: 'submeter'; paciente_id: string; corpo: unknown }
  | { operacao: 'resolver'; paciente_id: string; corpo: unknown };

const ACOES = {
  consultar: 'api.consultar_ficha_plantao',
  pendencias: 'api.consultar_ficha_plantao',
  rascunho_ler: 'api.consultar_rascunho_ficha_plantao',
  rascunho_salvar: 'api.salvar_rascunho_ficha_plantao',
  submeter: 'api.gravar_ficha_plantao',
  resolver: 'api.resolver_pendencia_plantao',
} as const;

/** O `id` da LINHA é o que o AAD amarra, e a projeção do banco não o devolve: sem uma regra
 * de derivação, a ficha publicada e a pendência gravada seriam ilegíveis depois de um
 * recarregamento. A derivação é determinística a partir de `(tabela, registro, versão)`, que
 * já é a chave primária da linha — continua havendo um envelope por versão, e o envelope de
 * uma versão continua sem servir para outra. Nada aqui é segredo: AAD é dado autenticado. */
export async function idLinhaFichaPlantao(
  tabela: string,
  registroId: string,
  versao: number,
): Promise<string> {
  if (!Number.isInteger(versao) || versao < 1) throw new Error('Versão inválida.');
  const semente = `ffcmapp:ficha-plantao:linha:v1:${tabela}:${uuidSchema.parse(registroId).toLowerCase()}:${versao}`;
  const resumo = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(semente)),
  );
  const bytes = resumo.slice(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((valor) => valor.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function operarFichaPlantaoNativa(
  request: Request,
  comando: ComandoFichaPlantao,
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
    if (!paciente.success || !(comando.operacao in ACOES)) return erro('entrada_invalida');
    const pacienteId = paciente.data.toLowerCase();
    const mutacao = comando.operacao === 'submeter' || comando.operacao === 'resolver';
    const entrada: Record<string, unknown> = { request_id: requestId, paciente_id: pacienteId };
    let chaveIdempotencia: string | undefined;
    if (mutacao || comando.operacao === 'rascunho_salvar') {
      const chave = chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia'));
      if (!chave.success) return erro('entrada_invalida');
      chaveIdempotencia = chave.data;
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

    // Contexto de leitura usado depois para decifrar: cada campo volta cifrado e só o AAD
    // correto o abre. Guardar o que foi enviado evita confiar na devolução do banco.
    let registroId: string | undefined;
    let turnoId: string | undefined;

    if (comando.operacao === 'pendencias') {
      // Sem turno e sem registro: a MESMA consulta autorizada devolve a ficha nula e as
      // pendências escritas do caso inteiro. Nenhum caminho de leitura novo é criado.
    } else if (comando.operacao === 'consultar' || comando.operacao === 'rascunho_ler') {
      const turno = uuidSchema.safeParse(comando.turno_id);
      if (!turno.success) return erro('entrada_invalida');
      turnoId = turno.data.toLowerCase();
      Object.assign(entrada, { turno_id: turnoId });
      // A ficha é uma por plantão: o registro dela é o próprio turno.
      if (comando.operacao === 'consultar') {
        registroId = turnoId;
        Object.assign(entrada, { registro_id: registroId });
      }
    } else if (comando.operacao === 'rascunho_salvar') {
      const corpo = rascunhoFichaPlantaoSchema.safeParse(comando.corpo);
      if (!corpo.success) return erro('entrada_invalida');
      turnoId = corpo.data.turno_id.toLowerCase();
      // `id` novo a cada gravação: o envelope da versão anterior deixa de servir para a linha.
      const linha = crypto.randomUUID();
      const aad: AadRascunho = {
        tabela: TABELA_RASCUNHO,
        registro_id: linha,
        campo: 'conteudo',
        formato: 1,
      };
      const texto = JSON.stringify(corpo.data.conteudo);
      if (new TextEncoder().encode(texto).length > 20_000) return erro('entrada_invalida');
      Object.assign(entrada, {
        turno_id: turnoId,
        id: linha,
        conteudo: campoCifradoSchema.parse(await portas.cifra.cifrar(texto, aad)),
        aad: { conteudo: aad },
      });
    } else if (comando.operacao === 'submeter') {
      const corpo = submissaoFichaPlantaoSchema.safeParse(comando.corpo);
      if (!corpo.success) return erro('entrada_invalida');
      const dados = corpo.data;
      turnoId = dados.turno_id.toLowerCase();
      registroId = dados.registro_id.toLowerCase();
      // Uma ficha por plantão. Sem isto, uma ficha publicada com registro arbitrário deixaria
      // de ser recuperável — a projeção do banco é chaveada pelo registro, não pelo turno.
      if (registroId !== turnoId) return erro('entrada_invalida');
      const versao = dados.versao_esperada + 1;
      const linha = await idLinhaFichaPlantao(TABELA_FICHA, registroId, versao);
      const aad = (campo: AadFicha['campo']): AadFicha => ({
        tabela: TABELA_FICHA,
        registro_id: linha,
        campo,
        formato: 1,
      });
      const conteudo: Record<string, unknown> = {};
      const c = dados.conteudo;
      if (c.periodo !== undefined) conteudo.periodo = c.periodo;
      if (c.janela_declarada !== undefined) conteudo.janela_declarada = c.janela_declarada;
      if (c.papel_declarado !== undefined) conteudo.papel_declarado = c.papel_declarado;
      if (c.atividades !== undefined)
        conteudo.atividades = {
          conteudo: campoCifradoSchema.parse(
            await portas.cifra.cifrar(c.atividades.texto, aad('atividades')),
          ),
          fonte: c.atividades.fonte,
          visibilidade: c.atividades.visibilidade,
        };
      if (c.observacoes !== undefined)
        conteudo.observacoes = {
          conteudo: campoCifradoSchema.parse(
            await portas.cifra.cifrar(c.observacoes.texto, aad('observacoes')),
          ),
          fonte: c.observacoes.fonte,
          visibilidade: c.observacoes.visibilidade,
        };
      if (c.estado_emocional !== undefined)
        conteudo.estado_emocional = {
          // Registro canônico de rotina, com observador e instante e SEM valor: derivado da
          // mesma versão para que o reenvio idempotente não crie um segundo registro.
          id: await idLinhaFichaPlantao(
            'cadastro.turno_execucao_registro.estado_emocional',
            registroId,
            versao,
          ),
          estado: c.estado_emocional.estado,
          instante_ocorrencia: c.estado_emocional.instante_ocorrencia,
        };
      // FR-078/FR-081. Cada resposta de campo acrescentado tem envelope PRÓPRIO, derivado
      // de (tabela:campo, registro, versão) — um envelope por campo e por versão da ficha,
      // de modo que o de uma versão não decifra no lugar da outra nem de outro campo.
      const respostas: Record<string, unknown>[] = [];
      for (const item of c.respostas ?? []) {
        const campoId = item.campo_id.toLowerCase();
        const linhaResposta = await idLinhaFichaPlantao(
          `${TABELA_RESPOSTA}:${campoId}`,
          registroId,
          versao,
        );
        const aadResposta: AadResposta = {
          tabela: TABELA_RESPOSTA,
          registro_id: linhaResposta,
          campo: 'conteudo',
          formato: 1,
        };
        respostas.push({
          campo_id: campoId,
          id: linhaResposta,
          conteudo: campoCifradoSchema.parse(await portas.cifra.cifrar(item.texto, aadResposta)),
          fonte: item.fonte,
          visibilidade: item.visibilidade,
          aad: aadResposta,
        });
      }
      if (respostas.length) conteudo.respostas = respostas;
      const pendencias: Record<string, unknown>[] = [];
      for (const pendencia of c.pendencias ?? []) {
        const linhaPendencia = await idLinhaFichaPlantao(
          TABELA_PENDENCIA,
          pendencia.pendencia_id,
          1,
        );
        const aadPendencia: AadPendencia = {
          tabela: TABELA_PENDENCIA,
          registro_id: linhaPendencia,
          campo: 'conteudo',
          formato: 1,
        };
        pendencias.push({
          pendencia_id: pendencia.pendencia_id.toLowerCase(),
          id: linhaPendencia,
          conteudo: campoCifradoSchema.parse(
            await portas.cifra.cifrar(pendencia.conteudo.texto, aadPendencia),
          ),
          fonte: pendencia.conteudo.fonte,
          visibilidade: pendencia.conteudo.visibilidade,
          aad: aadPendencia,
        });
      }
      const aads: Record<string, unknown> = {};
      if (c.atividades !== undefined) aads.atividades = aad('atividades');
      if (c.observacoes !== undefined) aads.observacoes = aad('observacoes');
      if (dados.motivo !== undefined) aads.motivo = aad('motivo');
      const digest = await portas.idempotencia.calcularDigestIdempotencia(
        portas.atestador.canonicalizar({
          paciente_id: pacienteId,
          turno_id: turnoId,
          registro_id: registroId,
          versao_esperada: dados.versao_esperada,
          conteudo: dados.conteudo,
          campos_extras_catalogo: dados.campos_extras_catalogo ?? null,
          motivo: dados.motivo ?? null,
        }),
      );
      if (!/^[A-Za-z0-9_-]{43}$/.test(digest)) throw new Error();
      Object.assign(entrada, {
        turno_id: turnoId,
        registro_id: registroId,
        id: linha,
        versao,
        versao_esperada: dados.versao_esperada,
        conteudo,
        ...(pendencias.length ? { pendencias } : {}),
        // Retrato id->versão do modelo: o banco o revalida sob `for share` e recusa com
        // conflito quando o catálogo mudou. Vai só quando há resposta a revalidar.
        ...(respostas.length
          ? {
              campos_extras_catalogo: Object.fromEntries(
                Object.entries(dados.campos_extras_catalogo ?? {}).map(([id, v]) => [
                  id.toLowerCase(),
                  v,
                ]),
              ),
            }
          : {}),
        ...(dados.motivo === undefined
          ? {}
          : {
              motivo: campoCifradoSchema.parse(
                await portas.cifra.cifrar(dados.motivo, aad('motivo')),
              ),
            }),
        aad: aads,
        chave_idempotencia: chaveIdempotencia,
        digest_idempotencia: digest,
      });
    } else {
      const corpo = resolucaoPendenciaEscritaSchema.safeParse(comando.corpo);
      if (!corpo.success) return erro('entrada_invalida');
      const dados = corpo.data;
      registroId = dados.pendencia_id.toLowerCase();
      const versao = dados.versao_esperada + 1;
      const linha = await idLinhaFichaPlantao(TABELA_PENDENCIA, registroId, versao);
      const aad: AadPendencia = {
        tabela: TABELA_PENDENCIA,
        registro_id: linha,
        campo: 'motivo',
        formato: 1,
      };
      const digest = await portas.idempotencia.calcularDigestIdempotencia(
        portas.atestador.canonicalizar({
          paciente_id: pacienteId,
          registro_id: registroId,
          versao_esperada: dados.versao_esperada,
          motivo: dados.motivo,
        }),
      );
      if (!/^[A-Za-z0-9_-]{43}$/.test(digest)) throw new Error();
      Object.assign(entrada, {
        registro_id: registroId,
        id: linha,
        versao_esperada: dados.versao_esperada,
        motivo: campoCifradoSchema.parse(await portas.cifra.cifrar(dados.motivo, aad)),
        aad: { motivo: aad },
        chave_idempotencia: chaveIdempotencia,
        digest_idempotencia: digest,
      });
    }

    const metadados = dadosAtestadoSchema.omit({ digest_entrada: true }).parse({
      ...portas.metadados(requestId),
      ...identidade,
      operacao: ACOES[comando.operacao],
    });
    if (metadados.request_id !== requestId) throw new Error();
    const prova = resultadoAtestacaoSchema.parse(
      await portas.atestador.atestarEntrada(metadados, entrada),
    );
    const dadosAtestado = dadosAtestadoSchema.parse(JSON.parse(prova.dadosCanonicos));
    if (
      portas.atestador.canonicalizar(entrada) !== prova.entradaCanonica ||
      portas.atestador.canonicalizar(dadosAtestado) !== prova.dadosCanonicos ||
      Object.entries(metadados).some(
        ([chave, valor]) => dadosAtestado[chave as keyof typeof dadosAtestado] !== valor,
      ) ||
      Object.entries(dadosAtestado).some(
        ([chave, valor]) => prova.atestado[chave as keyof typeof dadosAtestado] !== valor,
      )
    )
      throw new Error();
    if (request.signal.aborted) throw new Error();
    iniciada = mutacao || comando.operacao === 'rascunho_salvar';
    const resposta = respostaFichaPlantaoPrivadaSchema.parse(
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
            : resposta.erro.codigo === 'entrada_invalida'
              ? 'entrada_invalida'
              : resposta.erro.codigo === 'servico_indisponivel'
                ? 'servico_indisponivel'
                : 'sem_permissao',
      );

    const bruto = resposta.dados;
    let ficha: FichaPlantaoProjetada | null = null;
    if (bruto.ficha) {
      const f = bruto.ficha;
      if (
        f.paciente_id.toLowerCase() !== pacienteId ||
        (registroId !== undefined && f.registro_id.toLowerCase() !== registroId) ||
        (turnoId !== undefined && f.turno_id.toLowerCase() !== turnoId)
      )
        throw new Error('Ficha incompatível com o pedido.');
      const linha = await idLinhaFichaPlantao(TABELA_FICHA, f.registro_id, f.versao);
      const abrir = async <F extends string, V extends string>(
        campo: 'atividades' | 'observacoes',
        envelope: CampoCifrado | null,
        fonte: F | null,
        visibilidade: V | null,
      ): Promise<{ texto: string; fonte: F; visibilidade: V } | null> => {
        if (!envelope || fonte === null || visibilidade === null) return null;
        return {
          texto: await portas.cifra.decifrar(envelope, {
            tabela: TABELA_FICHA,
            registro_id: linha,
            campo,
            formato: 1,
          }),
          fonte,
          visibilidade,
        };
      };
      const respostasAbertas = [];
      for (const item of f.respostas) {
        const linhaResposta = await idLinhaFichaPlantao(
          `${TABELA_RESPOSTA}:${item.campo_id.toLowerCase()}`,
          f.registro_id,
          f.versao,
        );
        respostasAbertas.push({
          campo_id: item.campo_id,
          campo_nome: item.campo_nome,
          campo_ativo: item.campo_ativo,
          texto: await portas.cifra.decifrar(item.conteudo, {
            tabela: TABELA_RESPOSTA,
            registro_id: linhaResposta,
            campo: 'conteudo',
            formato: 1,
          }),
          fonte: item.fonte,
          visibilidade: item.visibilidade,
        });
      }
      ficha = {
        registro_id: f.registro_id,
        turno_id: f.turno_id,
        versao: f.versao,
        periodo: f.periodo,
        papel_declarado: f.papel_declarado,
        atividades: await abrir(
          'atividades',
          f.atividades,
          f.atividades_fonte,
          f.atividades_visibilidade,
        ),
        observacoes: await abrir(
          'observacoes',
          f.observacoes,
          f.observacoes_fonte,
          f.observacoes_visibilidade,
        ),
        respostas: respostasAbertas,
        autor_usuario_id: f.autor_usuario_id,
        registrado_em: f.registrado_em,
        retroativo: f.retroativo,
      };
    }
    const pendencias: PendenciaPlantaoHttp[] = [];
    for (const p of bruto.pendencias) {
      if (p.paciente_id.toLowerCase() !== pacienteId)
        throw new Error('Pendência incompatível com o pedido.');
      // O texto da pendência é preservado palavra por palavra na resolução, então o envelope
      // continua sendo o da versão 1 — é dela que vem o AAD, nunca da versão corrente.
      const linha = await idLinhaFichaPlantao(TABELA_PENDENCIA, p.pendencia_id, 1);
      pendencias.push({
        pendencia_id: p.pendencia_id,
        turno_id: p.turno_id,
        versao: p.versao,
        origem: p.origem,
        situacao: p.situacao,
        texto: await portas.cifra.decifrar(p.conteudo, {
          tabela: TABELA_PENDENCIA,
          registro_id: linha,
          campo: 'conteudo',
          formato: 1,
        }),
        fonte: p.fonte,
        visibilidade: p.visibilidade,
        declarado_por_usuario_id: p.declarado_por_usuario_id,
        registrado_em: p.registrado_em,
        resolvido_por_usuario_id: p.resolvido_por_usuario_id,
        resolvido_em: p.resolvido_em,
      });
    }
    let rascunho: RascunhoFichaPlantaoProjetado = null;
    if (bruto.rascunho) {
      const r = bruto.rascunho;
      if (r.paciente_id.toLowerCase() !== pacienteId)
        throw new Error('Rascunho incompatível com o pedido.');
      const texto = await portas.cifra.decifrar(r.conteudo, {
        tabela: TABELA_RASCUNHO,
        registro_id: r.rascunho_id,
        campo: 'conteudo',
        formato: 1,
      });
      const conteudo: ConteudoFichaPlantao = conteudoFichaPlantaoSchema.parse(JSON.parse(texto));
      rascunho = {
        turno_id: r.turno_id,
        conteudo,
        atualizado_em: r.atualizado_em,
        publicado: false,
      };
    }

    const atual = await portas.revalidar(request);
    if (
      request.signal.aborted ||
      atual.estado !== 'autorizado' ||
      atual.identidade.usuario_id.toLowerCase() !== identidade.usuario_id ||
      atual.identidade.session_id.toLowerCase() !== identidade.session_id
    )
      return erro(iniciada ? 'pendencia_externa' : 'nao_autenticado');
    const resultado: ResultadoFichaPlantao & { rascunho: RascunhoFichaPlantaoProjetado } = {
      ficha,
      pendencias,
      rascunho,
    };
    return { ok: true as const, dados: resultado, request_id: requestId };
  } catch {
    return erro(iniciada ? 'pendencia_externa' : 'servico_indisponivel');
  }
}
