import { z } from 'zod';
import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  MIMES_COMPROVANTE,
  TAMANHO_MAXIMO_COMPROVANTE_BYTES,
  registrarDespesaSchema,
  registrarValorAcordadoSchema,
  retificarDespesaSchema,
  consultarApuracaoSchema,
  type DespesaVersao,
} from '../../../packages/contracts/src/financeiro.ts';
import {
  campoCifradoSchema,
  dadosAtestadoSchema,
  financeiroApuracaoSaidaSchema,
  financeiroDespesaSaidaSchema,
  financeiroValorSaidaSchema,
  respostaFinanceiraPrivadaSchema,
  resultadoAtestacaoSchema,
  wrapperFinanceiro,
  type AcaoFinanceira,
  type CampoCifrado,
  type MetadadosAadFinanceiro,
} from '../../../packages/contracts/src/rpc.ts';

/** AAD do financeiro: o tipo do contrato, não uma cópia local. Nenhuma tabela de cuidado
 * aparece aqui, e nenhum campo de cuidado é cifrado por esta composição — a separação do
 * design D1 vale também para a chave. A canonicalização é a de produção, em
 * `supabase/functions/_shared/cifra-autenticada.ts`, que ganhou o ramo das duas tabelas
 * financeiras; a justificativa de cada amarração e de cada ausência está lá. */
export type AadFinanceiro = MetadadosAadFinanceiro;

type Identidade = { usuario_id: string; session_id: string };
type Autorizacao =
  | { estado: 'autorizado'; identidade: Identidade }
  | { estado: 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel' };

export type ComandoFinanceiro =
  | { operacao: 'consultarAudiencia' }
  | { operacao: 'consultarValores'; profissional_usuario_id: string }
  | ({ operacao: 'registrarValor' } & z.infer<typeof registrarValorAcordadoSchema>)
  | { operacao: 'consultarDespesas'; paciente_id: string }
  | ({ operacao: 'registrarDespesa' } & z.infer<typeof registrarDespesaSchema>)
  | ({ operacao: 'retificarDespesa' } & z.infer<typeof retificarDespesaSchema>)
  | ({ operacao: 'consultarApuracao' } & z.infer<typeof consultarApuracaoSchema>)
  | { operacao: 'lerComprovante'; paciente_id: string; despesa_id: string }
  | {
      operacao: 'enviarComprovante';
      paciente_id: string;
      despesa_id: string;
      bytes: Uint8Array;
      mime_type: (typeof MIMES_COMPROVANTE)[number];
    };

export type CodigoFinanceiro =
  | 'entrada_invalida'
  | 'nao_autenticado'
  | 'sem_permissao'
  | 'nao_encontrado'
  | 'conflito'
  | 'conflito_idempotencia'
  | 'servico_indisponivel'
  | 'pendencia_externa';

export type PortasFinanceiras = {
  autorizar(request: Request): Promise<Autorizacao>;
  revalidar(request: Request): Promise<Autorizacao>;
  metadados(requestId: string): {
    key_id: string;
    emitido_em: string;
    expira_em: string;
    request_id: string;
  };
  cifra: {
    cifrar(valor: string, aad: AadFinanceiro): Promise<CampoCifrado>;
    decifrar(valor: CampoCifrado, aad: AadFinanceiro): Promise<string>;
  };
  idempotencia: { calcularDigestIdempotencia(comandoLogico: string): Promise<string> };
  atestador: {
    canonicalizar(valor: unknown): string;
    atestarEntrada(dados: unknown, entrada: Record<string, unknown>): Promise<unknown>;
  };
  executar(
    wrapper: (typeof wrapperFinanceiro)[AcaoFinanceira],
    transporte: {
      p_transporte: {
        entrada: Record<string, unknown>;
        entrada_canonica: string;
        dados_canonicos: string;
      };
    },
  ): Promise<unknown>;
  storage: {
    enviar(caminho: string, bytes: Uint8Array, tipo: string): Promise<'criado' | 'existente'>;
    obter(caminho: string): Promise<Uint8Array>;
  };
};

const ACOES: Record<ComandoFinanceiro['operacao'], AcaoFinanceira> = {
  // A sondagem de audiência não tem ação própria no banco: reaproveita a consulta de valor
  // acordado do próprio solicitante e descarta os dados, devolvendo só o booleano. Não há
  // caminho para a interface aprender o valor de ninguém por aqui.
  consultarAudiencia: 'api.consultar_valor_acordado',
  consultarValores: 'api.consultar_valor_acordado',
  registrarValor: 'api.registrar_valor_acordado',
  consultarDespesas: 'api.consultar_despesas',
  registrarDespesa: 'api.registrar_despesa',
  retificarDespesa: 'api.retificar_despesa',
  consultarApuracao: 'api.consultar_apuracao_repasse',
  lerComprovante: 'api.consultar_despesas',
  enviarComprovante: 'api.consultar_despesas',
};

/** Os schemas do contrato são `.strict()`: a marca de despacho `operacao` não pertence ao
 * corpo validado e precisa sair antes do parse. */
function semOperacao(comando: ComandoFinanceiro): Record<string, unknown> {
  const { operacao: _despacho, ...resto } = comando;
  return resto;
}

const MUTACOES = new Set<ComandoFinanceiro['operacao']>([
  'registrarValor',
  'registrarDespesa',
  'retificarDespesa',
]);

/** Nome determinístico do objeto. Determinístico de propósito: uma segunda tentativa do mesmo
 * lançamento aponta para o mesmo objeto, então repetir nunca cria comprovante órfão nem
 * segunda despesa. A unicidade da coluna recusa dois lançamentos para o mesmo objeto. */
export function nomeObjetoComprovante(despesaId: string): string {
  return `${despesaId.toLowerCase()}/comprovante`;
}

const digestBytes = async (bytes: Uint8Array) =>
  btoa(
    String.fromCharCode(
      ...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))),
    ),
  )
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

/** Assinaturas de arquivo conferidas nos bytes, não no rótulo enviado pelo navegador: um
 * `mime_type` declarado não prova o conteúdo, e o repositório guarda o que receber. */
export function tipoDosBytesComprovante(bytes: Uint8Array): string | null {
  return MIMES_COMPROVANTE.find((mime) => tipoCompativel(bytes, mime)) ?? null;
}

function tipoCompativel(bytes: Uint8Array, mime: string): boolean {
  const comeca = (...assinatura: number[]) =>
    assinatura.every((byte, indice) => bytes[indice] === byte);
  if (mime === 'application/pdf') return comeca(0x25, 0x50, 0x44, 0x46);
  if (mime === 'image/jpeg') return comeca(0xff, 0xd8, 0xff);
  if (mime === 'image/png') return comeca(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (mime === 'image/webp')
    return (
      comeca(0x52, 0x49, 0x46, 0x46) && [0x57, 0x45, 0x42, 0x50].every((b, i) => bytes[8 + i] === b)
    );
  return false;
}

/** Composição interna do financeiro do cuidado (FR-068, FR-069, FR-070). Não registra rota,
 * não concede privilégio e não decide audiência: autorização e auditoria pertencem ao banco,
 * que confere atestado, sessão viva e concessão financeira dentro da transação. Aqui há
 * apenas cifra, atestado, idempotência e a conferência de que a resposta corresponde ao
 * pedido desta tentativa. */
export async function operarFinanceiroNativo(
  request: Request,
  comando: ComandoFinanceiro,
  portas: PortasFinanceiras,
) {
  const requestId = crypto.randomUUID();
  const erro = (codigo: CodigoFinanceiro) => ({
    ok: false as const,
    erro: { codigo },
    request_id: requestId,
  });
  let iniciada = false;
  try {
    if (request.signal.aborted) return erro('servico_indisponivel');
    const mutacao = MUTACOES.has(comando.operacao);
    let chaveIdempotencia: string | undefined;
    if (mutacao) {
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

    /** Uma chamada atestada ao banco. `conferir` é aplicado ao `dados` devolvido. */
    const chamar = async <T>(
      acao: AcaoFinanceira,
      entrada: Record<string, unknown>,
      schema: z.ZodType<T>,
    ): Promise<
      { ok: true; dados: T; repeticao: boolean } | { ok: false; codigo: CodigoFinanceiro }
    > => {
      const pedido = { request_id: requestId, ...entrada };
      const metadados = dadosAtestadoSchema.omit({ digest_entrada: true }).parse({
        ...portas.metadados(requestId),
        ...identidade,
        operacao: acao,
      });
      if (metadados.request_id !== requestId) throw new Error();
      const prova = resultadoAtestacaoSchema.parse(
        await portas.atestador.atestarEntrada(metadados, pedido),
      );
      const dados = dadosAtestadoSchema.parse(JSON.parse(prova.dadosCanonicos));
      if (
        portas.atestador.canonicalizar(pedido) !== prova.entradaCanonica ||
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
      const resposta = respostaFinanceiraPrivadaSchema(schema).parse(
        await portas.executar(wrapperFinanceiro[acao], {
          p_transporte: {
            entrada: { ...pedido, atestado: prova.atestado },
            entrada_canonica: prova.entradaCanonica,
            dados_canonicos: prova.dadosCanonicos,
          },
        }),
      );
      if (request.signal.aborted || resposta.request_id !== requestId) throw new Error();
      if (!resposta.ok) return { ok: false as const, codigo: resposta.erro.codigo };
      return { ok: true as const, dados: resposta.dados, repeticao: resposta.repeticao ?? false };
    };

    const cifrar = async (texto: string, aad: AadFinanceiro) =>
      campoCifradoSchema.parse(await portas.cifra.cifrar(texto, aad));
    const digestDe = async (comandoLogico: unknown) => {
      const digest = await portas.idempotencia.calcularDigestIdempotencia(
        portas.atestador.canonicalizar(comandoLogico),
      );
      if (!/^[A-Za-z0-9_-]{43}$/.test(digest)) throw new Error();
      return digest;
    };
    /** Converte uma linha do banco em versão de despesa apresentável. */
    const abrirDespesa = async (
      linha: z.infer<typeof financeiroDespesaSaidaSchema>,
    ): Promise<DespesaVersao> => {
      const base = {
        tabela: 'financeiro.despesa_lancamento' as const,
        despesa_id: linha.despesa_id.toLowerCase(),
        formato: 1 as const,
      };
      return {
        despesa_id: linha.despesa_id,
        paciente_id: linha.paciente_id,
        descricao: await portas.cifra.decifrar(linha.descricao_cifrada, {
          ...base,
          campo: 'descricao',
        }),
        valor_centavos: linha.valor_centavos,
        data: linha.data,
        responsavel_usuario_id: linha.responsavel_usuario_id,
        autorizacao: await portas.cifra.decifrar(linha.autorizacao_cifrada, {
          ...base,
          campo: 'autorizacao',
        }),
        autor_usuario_id: linha.autor_usuario_id,
        registrado_em: linha.registrado_em,
        versao: linha.versao,
        retificacao_de_versao: linha.versao > 1 ? linha.versao - 1 : null,
        motivo_retificacao: linha.motivo_retificacao_cifrado
          ? await portas.cifra.decifrar(linha.motivo_retificacao_cifrado, {
              ...base,
              campo: 'motivo_retificacao',
            })
          : null,
        tem_comprovante: linha.comprovante_objeto_nome !== null,
      };
    };

    let resultado: unknown;
    switch (comando.operacao) {
      case 'consultarAudiencia': {
        const r = await chamar(
          ACOES.consultarAudiencia,
          { profissional_usuario_id: identidade.usuario_id },
          z.array(financeiroValorSaidaSchema),
        );
        // Só o booleano atravessa: os valores lidos são descartados aqui dentro.
        if (!r.ok) {
          if (r.codigo !== 'sem_permissao') return erro(r.codigo);
          resultado = { permitida: false };
          break;
        }
        resultado = { permitida: true };
        break;
      }
      case 'consultarValores': {
        const profissional = uuidSchema.parse(comando.profissional_usuario_id).toLowerCase();
        const r = await chamar(
          ACOES.consultarValores,
          { profissional_usuario_id: profissional },
          z.array(financeiroValorSaidaSchema),
        );
        if (!r.ok) return erro(r.codigo);
        resultado = await Promise.all(
          r.dados.map(async (linha) => ({
            valor_id: linha.valor_id,
            profissional_usuario_id: linha.profissional_usuario_id,
            valor_turno_centavos: linha.valor_turno_centavos,
            vigencia: linha.vigencia,
            motivo: await portas.cifra.decifrar(linha.motivo_cifrado, {
              tabela: 'financeiro.valor_acordado_turno',
              registro_id: linha.valor_id.toLowerCase(),
              campo: 'motivo',
              formato: 1,
            }),
            autor_usuario_id: linha.autor_usuario_id,
            registrado_em: linha.registrado_em,
          })),
        );
        break;
      }
      case 'registrarValor': {
        const dados = registrarValorAcordadoSchema.parse(semOperacao(comando));
        const valorId = dados.valor_id.toLowerCase();
        const digest = await digestDe({
          operacao: ACOES.registrarValor,
          valor_id: valorId,
          profissional_usuario_id: dados.profissional_usuario_id.toLowerCase(),
          valor_turno_centavos: dados.valor_turno_centavos,
          vigencia: dados.vigencia,
          motivo: dados.motivo,
        });
        iniciada = true;
        const r = await chamar(
          ACOES.registrarValor,
          {
            valor_id: valorId,
            profissional_usuario_id: dados.profissional_usuario_id.toLowerCase(),
            valor_turno_centavos: dados.valor_turno_centavos,
            vigencia_inicio: dados.vigencia.inicio,
            vigencia_fim: dados.vigencia.fim,
            motivo_cifrado: await cifrar(dados.motivo, {
              tabela: 'financeiro.valor_acordado_turno',
              registro_id: valorId,
              campo: 'motivo',
              formato: 1,
            }),
            chave_idempotencia: chaveIdempotencia,
            digest_idempotencia: digest,
            auditoria_id: crypto.randomUUID(),
          },
          financeiroValorSaidaSchema,
        );
        if (!r.ok) return erro(r.codigo);
        if (r.dados.valor_id.toLowerCase() !== valorId) throw new Error();
        resultado = {
          valor_id: r.dados.valor_id,
          profissional_usuario_id: r.dados.profissional_usuario_id,
          valor_turno_centavos: r.dados.valor_turno_centavos,
          vigencia: r.dados.vigencia,
          motivo: dados.motivo,
          autor_usuario_id: r.dados.autor_usuario_id,
          registrado_em: r.dados.registrado_em,
        };
        break;
      }
      case 'consultarDespesas': {
        const paciente = uuidSchema.parse(comando.paciente_id).toLowerCase();
        const r = await chamar(
          ACOES.consultarDespesas,
          { paciente_id: paciente },
          z.array(financeiroDespesaSaidaSchema),
        );
        if (!r.ok) return erro(r.codigo);
        resultado = await Promise.all(r.dados.map((linha) => abrirDespesa(linha)));
        break;
      }
      case 'registrarDespesa': {
        const dados = registrarDespesaSchema.parse(semOperacao(comando));
        const despesaId = dados.despesa_id.toLowerCase();
        if (dados.comprovante.objeto_nome !== nomeObjetoComprovante(despesaId))
          return erro('entrada_invalida');
        const aad = {
          tabela: 'financeiro.despesa_lancamento' as const,
          despesa_id: despesaId,
          formato: 1 as const,
        };
        const digest = await digestDe({
          operacao: ACOES.registrarDespesa,
          despesa_id: despesaId,
          paciente_id: dados.paciente_id.toLowerCase(),
          descricao: dados.descricao,
          valor_centavos: dados.valor_centavos,
          data: dados.data,
          responsavel_usuario_id: dados.responsavel_usuario_id.toLowerCase(),
          autorizacao: dados.autorizacao,
          comprovante: dados.comprovante,
        });
        iniciada = true;
        const r = await chamar(
          ACOES.registrarDespesa,
          {
            despesa_id: despesaId,
            paciente_id: dados.paciente_id.toLowerCase(),
            descricao_cifrada: await cifrar(dados.descricao, { ...aad, campo: 'descricao' }),
            valor_centavos: dados.valor_centavos,
            data: dados.data,
            responsavel_usuario_id: dados.responsavel_usuario_id.toLowerCase(),
            autorizacao_cifrada: await cifrar(dados.autorizacao, { ...aad, campo: 'autorizacao' }),
            comprovante: dados.comprovante,
            chave_idempotencia: chaveIdempotencia,
            digest_idempotencia: digest,
            auditoria_id: crypto.randomUUID(),
          },
          financeiroDespesaSaidaSchema,
        );
        if (!r.ok) return erro(r.codigo);
        if (
          r.dados.despesa_id.toLowerCase() !== despesaId ||
          r.dados.versao !== 1 ||
          r.dados.comprovante_objeto_nome !== dados.comprovante.objeto_nome
        )
          throw new Error();
        resultado = {
          despesa_id: r.dados.despesa_id,
          paciente_id: r.dados.paciente_id,
          descricao: dados.descricao,
          valor_centavos: r.dados.valor_centavos,
          data: r.dados.data,
          responsavel_usuario_id: r.dados.responsavel_usuario_id,
          autorizacao: dados.autorizacao,
          comprovante: dados.comprovante,
          autor_usuario_id: r.dados.autor_usuario_id,
          registrado_em: r.dados.registrado_em,
          versao: 1,
          retificacao_de_versao: null,
          motivo_retificacao: null,
        };
        break;
      }
      case 'retificarDespesa': {
        const dados = retificarDespesaSchema.parse(semOperacao(comando));
        const despesaId = dados.despesa_id.toLowerCase();
        const lancamento = dados.retificacao_id.toLowerCase();
        const aad = {
          tabela: 'financeiro.despesa_lancamento' as const,
          despesa_id: despesaId,
          formato: 1 as const,
        };
        const digest = await digestDe({
          operacao: ACOES.retificarDespesa,
          despesa_id: despesaId,
          retificacao_id: lancamento,
          descricao: dados.descricao,
          valor_centavos: dados.valor_centavos,
          data: dados.data,
          responsavel_usuario_id: dados.responsavel_usuario_id.toLowerCase(),
          autorizacao: dados.autorizacao,
          motivo: dados.motivo,
        });
        iniciada = true;
        const r = await chamar(
          ACOES.retificarDespesa,
          {
            despesa_id: despesaId,
            retificacao_id: lancamento,
            descricao_cifrada: await cifrar(dados.descricao, { ...aad, campo: 'descricao' }),
            valor_centavos: dados.valor_centavos,
            data: dados.data,
            responsavel_usuario_id: dados.responsavel_usuario_id.toLowerCase(),
            autorizacao_cifrada: await cifrar(dados.autorizacao, { ...aad, campo: 'autorizacao' }),
            motivo_retificacao_cifrado: await cifrar(dados.motivo, {
              ...aad,
              campo: 'motivo_retificacao',
            }),
            chave_idempotencia: chaveIdempotencia,
            digest_idempotencia: digest,
            auditoria_id: crypto.randomUUID(),
          },
          financeiroDespesaSaidaSchema,
        );
        if (!r.ok) return erro(r.codigo);
        if (r.dados.despesa_id.toLowerCase() !== despesaId || r.dados.versao < 2) throw new Error();
        resultado = await abrirDespesa(r.dados);
        break;
      }
      case 'consultarApuracao': {
        const dados = consultarApuracaoSchema.parse(semOperacao(comando));
        const r = await chamar(
          ACOES.consultarApuracao,
          {
            profissional_usuario_id: dados.profissional_usuario_id.toLowerCase(),
            periodo_inicio: dados.periodo_inicio,
            periodo_fim: dados.periodo_fim,
          },
          financeiroApuracaoSaidaSchema,
        );
        if (!r.ok) return erro(r.codigo);
        if (
          r.dados.periodo_inicio !== dados.periodo_inicio ||
          r.dados.periodo_fim !== dados.periodo_fim
        )
          throw new Error();
        resultado = r.dados;
        break;
      }
      case 'lerComprovante': {
        const entrega = await entregarComprovante(comando, chamar, portas, request);
        if (!entrega.ok) return erro(entrega.codigo);
        resultado = entrega.bytes;
        break;
      }
      case 'enviarComprovante': {
        const paciente = uuidSchema.parse(comando.paciente_id).toLowerCase();
        const despesaId = uuidSchema.parse(comando.despesa_id).toLowerCase();
        if (
          comando.bytes.byteLength === 0 ||
          comando.bytes.byteLength > TAMANHO_MAXIMO_COMPROVANTE_BYTES ||
          !tipoCompativel(comando.bytes, comando.mime_type)
        )
          return erro('entrada_invalida');
        const r = await chamar(
          ACOES.enviarComprovante,
          { paciente_id: paciente },
          z.array(financeiroDespesaSaidaSchema),
        );
        if (!r.ok) return erro(r.codigo);
        const linha = r.dados.find(
          (item) => item.despesa_id.toLowerCase() === despesaId && item.versao === 1,
        );
        if (!linha || linha.comprovante_objeto_nome === null) return erro('nao_encontrado');
        iniciada = true;
        const enviado = await portas.storage.enviar(
          linha.comprovante_objeto_nome,
          comando.bytes,
          comando.mime_type,
        );
        if (enviado === 'existente') {
          // Os bytes do comprovante são imutáveis: repetir só é aceitável se o objeto já
          // guardado for exatamente o mesmo. Divergente é conflito, nunca sobrescrita.
          const guardado = await portas.storage.obter(linha.comprovante_objeto_nome);
          if ((await digestBytes(guardado)) !== (await digestBytes(comando.bytes)))
            return erro('conflito');
        }
        resultado = { enviado: true };
        break;
      }
    }

    const atual = await portas.revalidar(request);
    if (
      request.signal.aborted ||
      atual.estado !== 'autorizado' ||
      atual.identidade.usuario_id.toLowerCase() !== identidade.usuario_id ||
      atual.identidade.session_id.toLowerCase() !== identidade.session_id
    )
      return erro(iniciada ? 'pendencia_externa' : 'nao_autenticado');
    return { ok: true as const, dados: resultado, request_id: requestId };
  } catch {
    // Mutação já iniciada nunca vira "falhou e pode repetir à vontade": vira pendência, e a
    // repetição exige a mesma chave de idempotência (tarefa 2.7).
    return erro(iniciada ? 'pendencia_externa' : 'servico_indisponivel');
  }
}

/** Entrega do comprovante por fluxo autorizado a cada leitura (FR-069, tarefa 2.4): duas
 * leituras atestadas e auditadas no banco, antes e depois do I/O do repositório. Divergência
 * entre as duas vira `sem_permissao` e nenhum byte sai — inclusive quando a concessão
 * financeira foi revogada durante a leitura. Nenhuma URL, pública ou assinada, é emitida. */
async function entregarComprovante(
  comando: { paciente_id: string; despesa_id: string },
  chamar: <T>(
    acao: AcaoFinanceira,
    entrada: Record<string, unknown>,
    schema: z.ZodType<T>,
  ) => Promise<
    { ok: true; dados: T; repeticao: boolean } | { ok: false; codigo: CodigoFinanceiro }
  >,
  portas: PortasFinanceiras,
  request: Request,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; codigo: CodigoFinanceiro }> {
  const paciente = uuidSchema.parse(comando.paciente_id).toLowerCase();
  const despesaId = uuidSchema.parse(comando.despesa_id).toLowerCase();
  const ler = async () => {
    const r = await chamar(
      'api.consultar_despesas',
      { paciente_id: paciente },
      z.array(financeiroDespesaSaidaSchema),
    );
    if (!r.ok) return { ok: false as const, codigo: r.codigo };
    const linha = r.dados.find(
      (item) => item.despesa_id.toLowerCase() === despesaId && item.versao === 1,
    );
    return { ok: true as const, linha };
  };
  const inicial = await ler();
  if (!inicial.ok) return inicial;
  const origem = inicial.linha;
  if (!origem?.comprovante_objeto_nome) return { ok: false as const, codigo: 'nao_encontrado' };
  let bytes: Uint8Array;
  try {
    bytes = await portas.storage.obter(origem.comprovante_objeto_nome);
  } catch {
    return { ok: false as const, codigo: 'servico_indisponivel' };
  }
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength > TAMANHO_MAXIMO_COMPROVANTE_BYTES ||
    request.signal.aborted
  )
    return { ok: false as const, codigo: 'servico_indisponivel' };
  const final = await ler();
  if (!final.ok) return final;
  const atual = final.linha;
  if (
    request.signal.aborted ||
    !atual ||
    atual.comprovante_objeto_nome !== origem.comprovante_objeto_nome ||
    atual.registrado_em !== origem.registrado_em ||
    atual.versao !== origem.versao
  )
    return { ok: false as const, codigo: 'sem_permissao' };
  return { ok: true as const, bytes };
}
