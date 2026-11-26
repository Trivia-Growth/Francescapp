import { z } from 'zod';
import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  turnoGrupo3Http,
  escalaVersaoSchema,
  escalaCasoSchema,
  referenciaPassagemSchema,
  referenciaPassagemPrivadaSchema,
  passagemTurnoPrivadaSchema,
  passagemTurnoSchema,
  cienciaPassagemSchema,
  identidadeTurnoPrivadaSchema,
  cursorEscalaSchema,
} from '../../../packages/contracts/src/turno-passagem.ts';
import {
  conteudoEvolucaoDiarioSchema,
  salvarRegistroDiarioSchema,
} from '../../../packages/contracts/src/diario.ts';
import {
  campoCifradoSchema,
  type CampoCifrado,
  type MetadadosAad,
} from '../../../packages/contracts/src/rpc.ts';
import {
  prepararAtestadoConversao,
  type PortasAtestadoConversao,
} from './conversao-diario-atestado.ts';
import { prepararGravacaoDiarioNativa } from './diario-nativo.ts';

export type OperacaoGrupo3 = keyof typeof turnoGrupo3Http;
export type ComandoGrupo3 = {
  operacao: OperacaoGrupo3;
  paciente_id: string;
  escala_id?: string;
  turno_id?: string;
  entrada: unknown;
};
type Identidade = { usuario_id: string; session_id: string };
type Autorizacao =
  | { estado: 'autorizado'; identidade: Identidade }
  | { estado: 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel' };
export type PortasGrupo3 = PortasAtestadoConversao & {
  autorizar(request: Request): Promise<Autorizacao>;
  revalidar(request: Request): Promise<Autorizacao>;
  cifra: {
    cifrar(valor: string, aad: MetadadosAad): Promise<CampoCifrado>;
    decifrar(valor: CampoCifrado, aad: MetadadosAad): Promise<string>;
  };
  idempotencia: { calcularDigestIdempotencia(comando: string): Promise<string> };
  executar(
    request: Request,
    transporte: { p_transporte: Awaited<ReturnType<typeof prepararAtestadoConversao>> },
  ): Promise<unknown>;
};
export const acoesGrupo3 = {
  escala: 'api.consultar_escala_turno',
  criarEscala: 'api.criar_escala_turno',
  alterarEscala: 'api.alterar_escala_turno',
  passagem: 'api.consultar_passagem_turno',
  publicar: 'api.publicar_passagem_turno',
  ciencia: 'api.ciencia_passagem_turno',
} as const;
const escalaPrivada = escalaVersaoSchema
  .omit({ motivo: true })
  .extend({ motivo: campoCifradoSchema.nullable() });
const identidadesPrivadas = z.array(identidadeTurnoPrivadaSchema).max(200);
const casoPrivado = z
  .object({
    identidades: identidadesPrivadas,
    proximo_cursor: cursorEscalaSchema.nullable(),
    pode_gerir: z.boolean(),
    itens: z.array(escalaPrivada).max(500),
    profissionais: z
      .array(
        z
          .object({ usuario_id: uuidSchema, concessao_id: uuidSchema, email: campoCifradoSchema })
          .strict(),
      )
      .max(500),
  })
  .strict();
const respostaSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      repeticao: z.boolean(),
      dados: z.unknown(),
      request_id: uuidSchema,
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      erro: z
        .object({
          codigo: z.enum([
            'sem_permissao',
            'conflito',
            'conflito_idempotencia',
            'servico_indisponivel',
          ]),
        })
        .strict(),
      request_id: uuidSchema,
    })
    .strict(),
]);
const aadMotivo = (pacienteId: string, escalaId: string, versao: number) => ({
  tabela: 'cadastro.turno_escala_versao' as const,
  paciente_id: pacienteId,
  escala_id: escalaId,
  versao,
  campo: 'motivo' as const,
  formato: 1 as const,
});

/** Somente prepara filha Diário; a RPC agregada é o único ponto de persistência. */
export async function operarTurnoGrupo3(
  request: Request,
  comando: ComandoGrupo3,
  portas: PortasGrupo3,
) {
  const requestId = crypto.randomUUID();
  const erro = (codigo: string) => ({
    ok: false as const,
    erro: { codigo },
    request_id: requestId,
  });
  let iniciada = false;
  try {
    const contrato = turnoGrupo3Http[comando.operacao];
    const paciente = uuidSchema.safeParse(comando.paciente_id);
    if (!contrato || !paciente.success) return erro('entrada_invalida');
    const corpo = contrato.entrada.safeParse(comando.entrada);
    if (!corpo.success) return erro('entrada_invalida');
    const pacienteId = paciente.data.toLowerCase();
    const mutacao = contrato.metodo !== 'GET';
    const chave = mutacao
      ? chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia'))
      : null;
    if (mutacao && !chave?.success) return erro('entrada_invalida');
    const escalaId =
      comando.operacao === 'alterarEscala'
        ? uuidSchema.parse(comando.escala_id).toLowerCase()
        : undefined;
    const turnoId = ['passagem', 'publicar', 'ciencia'].includes(comando.operacao)
      ? uuidSchema.parse(comando.turno_id).toLowerCase()
      : undefined;
    const inicial = await portas.autorizar(request);
    if (inicial.estado !== 'autorizado') return erro(inicial.estado);
    const identidade = {
      usuario_id: uuidSchema.parse(inicial.identidade.usuario_id).toLowerCase(),
      session_id: uuidSchema.parse(inicial.identidade.session_id).toLowerCase(),
    };
    if (
      request.signal.aborted ||
      request.headers.get('x-sessao')?.toLowerCase() !== identidade.session_id
    )
      return erro('nao_autenticado');
    const vigente = async () => {
      const atual = await portas.revalidar(request);
      return (
        !request.signal.aborted &&
        atual.estado === 'autorizado' &&
        atual.identidade.usuario_id.toLowerCase() === identidade.usuario_id &&
        atual.identidade.session_id.toLowerCase() === identidade.session_id
      );
    };
    const entrada: Record<string, unknown> = {
      request_id: requestId,
      paciente_id: pacienteId,
      ...(escalaId ? { escala_id: escalaId } : {}),
      ...(turnoId ? { turno_id: turnoId } : {}),
    };
    if (comando.operacao === 'escala') Object.assign(entrada, corpo.data);
    if (mutacao && chave?.success) {
      const digest = await portas.idempotencia.calcularDigestIdempotencia(
        portas.atestador.canonicalizar({
          operacao: acoesGrupo3[comando.operacao],
          paciente_id: pacienteId,
          escala_id: escalaId ?? null,
          turno_id: turnoId ?? null,
          entrada: corpo.data,
        }),
      );
      if (!/^[A-Za-z0-9_-]{43}$/.test(digest)) throw new Error();
      Object.assign(entrada, { chave_idempotencia: chave.data, digest_idempotencia: digest });
      if (comando.operacao === 'criarEscala') Object.assign(entrada, corpo.data);
      if (comando.operacao === 'alterarEscala') {
        const humano = turnoGrupo3Http.alterarEscala.entrada.parse(corpo.data);
        const aad = aadMotivo(pacienteId, escalaId as string, humano.versao_esperada + 1);
        Object.assign(entrada, {
          ...humano,
          motivo: await portas.cifra.cifrar(humano.motivo, aad),
          aad_motivo: aad,
        });
      }
      if (comando.operacao === 'publicar') {
        const humano = turnoGrupo3Http.publicar.entrada.parse(corpo.data);
        entrada.versao_esperada = humano.versao_esperada;
        if (new TextEncoder().encode(JSON.stringify(humano.conteudo)).length > 24_000)
          return erro('entrada_invalida');
        const salvar = salvarRegistroDiarioSchema.parse({
          versao_esperada: 0,
          tipo: 'evolucao_profissional',
          estado: 'publicado',
          audiencia: 'equipe',
          atencao: false,
          retorno_solicitado: false,
          origem_conteudo: 'texto',
          conteudo: humano.conteudo,
        });
        entrada.diario = await prepararGravacaoDiarioNativa(
          {
            requestId,
            pacienteId,
            diarioId: crypto.randomUUID(),
            registroId: crypto.randomUUID(),
            identidade,
            chaveIdempotencia: chave.data,
            salvar,
          },
          portas,
        );
      }
    }
    const transporte = {
      p_transporte: await prepararAtestadoConversao(
        entrada,
        acoesGrupo3[comando.operacao],
        identidade,
        requestId,
        portas,
      ),
    };
    if (!(await vigente())) return erro('nao_autenticado');
    iniciada = mutacao;
    const resposta = respostaSchema.parse(await portas.executar(request, transporte));
    if (request.signal.aborted || resposta.request_id !== requestId) throw new Error();
    if (!resposta.ok)
      return erro(resposta.erro.codigo === 'conflito' ? 'conflito_versao' : resposta.erro.codigo);
    const abrirEscala = async (valor: unknown) => {
      const item = escalaPrivada.parse(valor);
      if (
        item.paciente_id.toLowerCase() !== pacienteId ||
        (escalaId && item.escala_id.toLowerCase() !== escalaId)
      )
        throw new Error();
      return escalaVersaoSchema.parse({
        ...item,
        motivo: item.motivo
          ? await portas.cifra.decifrar(
              item.motivo,
              aadMotivo(pacienteId, item.escala_id, item.versao),
            )
          : null,
      });
    };
    const abrirReferencia = async (valor: unknown) => {
      const item = referenciaPassagemPrivadaSchema.parse(valor);
      const conteudo = conteudoEvolucaoDiarioSchema.parse(
        JSON.parse(
          await portas.cifra.decifrar(item.conteudo, {
            tabela: 'cadastro.diario_registro_versao',
            paciente_id: pacienteId,
            diario_registro_id: item.diario_registro_id,
            registro_id: item.registro_id,
            versao: item.versao,
            campo: 'conteudo',
            formato: 1,
          }),
        ),
      );
      const { versao: _versao, ...restante } = item;
      return referenciaPassagemSchema.parse({ ...restante, conteudo });
    };
    const conferirIdentidades = (valor: unknown, referidos: Set<string>) => {
      const itens = identidadesPrivadas.parse(valor);
      const vistos = new Set<string>();
      const concessoes = new Set<string>();
      for (const item of itens) {
        const id = item.usuario_id.toLowerCase();
        if (
          !referidos.has(id) ||
          vistos.has(id) ||
          (item.email === null) !== (item.concessao_id === null)
        )
          throw new Error();
        if (item.concessao_id) {
          const concessao = item.concessao_id.toLowerCase();
          if (concessoes.has(concessao)) throw new Error();
          concessoes.add(concessao);
        }
        vistos.add(id);
      }
      if (vistos.size !== referidos.size) throw new Error();
    };
    const abrirIdentidades = async (valor: unknown) =>
      Promise.all(
        identidadesPrivadas.parse(valor).map(async (p) => {
          if ((p.email === null) !== (p.concessao_id === null)) throw new Error();
          return {
            usuario_id: p.usuario_id,
            rotulo:
              p.email && p.concessao_id
                ? await portas.cifra.decifrar(p.email, {
                    tabela: 'identidade.concessao_equipe',
                    registro_id: p.concessao_id,
                    campo: 'email',
                    formato: 1,
                  })
                : null,
          };
        }),
      );
    let dados: unknown;
    if (comando.operacao === 'escala') {
      const caso = casoPrivado.parse(resposta.dados);
      if (
        (!caso.pode_gerir && caso.profissionais.length > 0) ||
        caso.itens.some((item) => item.paciente_id.toLowerCase() !== pacienteId)
      )
        throw new Error();
      conferirIdentidades(
        caso.identidades,
        new Set(
          caso.itens
            .flatMap((item) => [
              item.autor_usuario_id,
              item.profissional_previsto_usuario_id,
              ...(item.profissional_assumiu_usuario_id
                ? [item.profissional_assumiu_usuario_id]
                : []),
            ])
            .map((id) => id.toLowerCase()),
        ),
      );
      dados = escalaCasoSchema.parse({
        identidades: await abrirIdentidades(caso.identidades),
        proximo_cursor: caso.proximo_cursor,
        pode_gerir: caso.pode_gerir,
        itens: await Promise.all(caso.itens.map(abrirEscala)),
        profissionais: await Promise.all(
          caso.profissionais.map(async (p) => ({
            usuario_id: p.usuario_id,
            rotulo: await portas.cifra.decifrar(p.email, {
              tabela: 'identidade.concessao_equipe',
              registro_id: p.concessao_id,
              campo: 'email',
              formato: 1,
            }),
          })),
        ),
      });
    } else if (comando.operacao === 'criarEscala' || comando.operacao === 'alterarEscala') {
      const item = await abrirEscala(resposta.dados);
      if (!resposta.repeticao) {
        if (item.autor_usuario_id.toLowerCase() !== identidade.usuario_id) throw new Error();
        if (comando.operacao === 'criarEscala') {
          const humano = turnoGrupo3Http.criarEscala.entrada.parse(corpo.data);
          if (
            item.escala_id.toLowerCase() !== humano.escala_id.toLowerCase() ||
            item.profissional_previsto_usuario_id.toLowerCase() !==
              humano.profissional_previsto_usuario_id.toLowerCase() ||
            item.versao !== 1
          )
            throw new Error();
        } else {
          const humano = turnoGrupo3Http.alterarEscala.entrada.parse(corpo.data);
          if (
            item.versao !== humano.versao_esperada + 1 ||
            item.tipo !== humano.tipo ||
            item.profissional_assumiu_usuario_id?.toLowerCase() !==
              humano.profissional_assumiu_usuario_id.toLowerCase()
          )
            throw new Error();
        }
      }
      dados = item;
    } else if (comando.operacao === 'publicar') {
      const referencia = await abrirReferencia(resposta.dados);
      if (
        referencia.turno_id.toLowerCase() !== turnoId ||
        referencia.autor_usuario_id.toLowerCase() !== identidade.usuario_id ||
        (!resposta.repeticao &&
          referencia.versao_passagem !==
            turnoGrupo3Http.publicar.entrada.parse(corpo.data).versao_esperada + 1)
      )
        throw new Error();
      dados = referencia;
    } else if (comando.operacao === 'ciencia') {
      dados = cienciaPassagemSchema.parse(resposta.dados);
      if (
        (dados as z.infer<typeof cienciaPassagemSchema>).usuario_id.toLowerCase() !==
        identidade.usuario_id
      )
        throw new Error();
    } else {
      const passagem = passagemTurnoPrivadaSchema.parse(resposta.dados);
      const referidos = new Set<string>();
      for (const id of [
        passagem.propria?.autor_usuario_id,
        passagem.anterior?.referencia.autor_usuario_id,
        passagem.anterior?.ciencia?.usuario_id,
        passagem.recebimento?.usuario_id,
        passagem.recebimento?.ciencia?.usuario_id,
      ])
        if (id) referidos.add(id.toLowerCase());
      conferirIdentidades(passagem.identidades, referidos);
      if (
        passagem.propria &&
        (passagem.propria.turno_id.toLowerCase() !== turnoId ||
          passagem.propria.autor_usuario_id.toLowerCase() !== identidade.usuario_id)
      )
        throw new Error();
      if (passagem.anterior && passagem.anterior.turno_destinatario_id.toLowerCase() !== turnoId)
        throw new Error();
      dados = passagemTurnoSchema.parse({
        ...passagem,
        identidades: await abrirIdentidades(passagem.identidades),
        propria: passagem.propria ? await abrirReferencia(passagem.propria) : null,
        anterior: passagem.anterior
          ? {
              ...passagem.anterior,
              referencia: await abrirReferencia(passagem.anterior.referencia),
            }
          : null,
      });
    }
    if (!(await vigente())) return erro(iniciada ? 'pendencia_externa' : 'nao_autenticado');
    return { ok: true as const, dados, request_id: requestId };
  } catch {
    return erro(iniciada ? 'pendencia_externa' : 'servico_indisponivel');
  }
}
