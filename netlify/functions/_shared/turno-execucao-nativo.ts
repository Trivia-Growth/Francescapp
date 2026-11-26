import { tipoImagemExecucao } from './turno-execucao-imagem.ts';
import { conteudoDiarioSchema } from '../../../packages/contracts/src/diario.ts';
import { z } from 'zod';
import {
  chaveIdempotenciaSchema,
  campoCifradoSchema,
  uuidSchema,
} from '../../../packages/contracts/src/comum.ts';
import {
  turnoExecucaoHttp,
  TAMANHO_MAXIMO_ANEXO_TURNO,
  relatorioTurnoPublicoSchema,
  type ComandoExecucaoTurno,
  type RelatorioTurnoPublico,
} from '../../../packages/contracts/src/turno-execucao-http.ts';
import {
  prepararAtestadoConversao,
  type PortasAtestadoConversao,
  type TransporteConversaoFilho,
} from './conversao-diario-atestado.ts';
import {
  aadExecucao,
  abrirRegistroExecucao,
  cifrarExecucao,
  nomesExecucao,
  objeto,
  type CifraExecucao,
} from './turno-execucao-projecao.ts';
import { prepararConversaoOcorrencia } from './turno-execucao-conversao.ts';
import { apresentarEventoExecucao } from './turno-execucao-apresentacao.ts';
import { gerarPdfExecucao, type SecaoPdfExecucao } from './turno-execucao-pdf.ts';
import { montarSecoesFichaConsolidada } from './turno-execucao-ficha-consolidada.ts';
import { turnoSchema } from '../../../packages/contracts/src/turno.ts';
type Identidade = { usuario_id: string; session_id: string };
type Autorizacao =
  | { estado: 'autorizado'; identidade: Identidade }
  | { estado: 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel' };
export type PortasExecucaoTurno = PortasAtestadoConversao & {
  autorizar(request: Request): Promise<Autorizacao>;
  revalidar(request: Request): Promise<Autorizacao>;
  cifra: CifraExecucao;
  areas: readonly string[];
  idempotencia: { calcularDigestIdempotencia(comando: string): Promise<string> };
  executar(
    rpc:
      | 'turno_execucao'
      | 'turno_relatorio'
      | 'turno_localizacao'
      | 'turno_anexo'
      | 'turno_execucao_barreira',
    transporte: { p_transporte: TransporteConversaoFilho },
  ): Promise<unknown>;
  storage: {
    enviar(caminho: string, bytes: Uint8Array, tipo: string): Promise<'criado' | 'existente'>;
    obter(caminho: string): Promise<Uint8Array>;
  };
  lerCaso(
    request: Request,
    entrada: { inicio: string; fim: string; destinatario: string; proposito: string },
  ): Promise<readonly { titulo: string; texto: string }[]>;
};
function apresentarPassagem(valor: unknown): string {
  const conteudo = conteudoDiarioSchema.parse(valor);
  const rotulos: Record<string, string> = {
    data: 'Data',
    area: 'Área',
    atividade: 'Atividade',
    observacoesCompartilhaveis: 'Observações compartilháveis',
    progresso: 'Progresso',
    orientacao: 'Orientação',
    proximoPasso: 'Próximo passo',
    objetivoRelacionado: 'Objetivo relacionado',
    dataAcontecimento: 'Data do acontecimento',
    descricao: 'Descrição',
    categoria: 'Categoria',
    contexto: 'Contexto',
    acaoTomada: 'Ação tomada',
  };
  return Object.entries(conteudo)
    .map(([campo, valor]) => `${rotulos[campo]}: ${valor}`)
    .join('\n');
}
class FalhaExecucao extends Error {
  constructor(readonly codigo: string) {
    super('Operação não concluída.');
  }
}
const baseAnexo = (valor: unknown) => {
  const r = objeto(valor);
  return {
    anexo_id: r.id,
    ocorrencia_id: r.ocorrencia_id,
    mime_type: r.mime_type,
    tamanho_bytes: r.tamanho_bytes,
    audiencia: r.audiencia,
  };
};
const digestBytes = async (bytes: Uint8Array) =>
  btoa(
    String.fromCharCode(
      ...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))),
    ),
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const imagemValida = (bytes: Uint8Array, tipo: string) => tipoImagemExecucao(bytes) === tipo;
export async function operarExecucaoTurno(
  request: Request,
  comando: ComandoExecucaoTurno,
  portas: PortasExecucaoTurno,
) {
  const requestId = crypto.randomUUID();
  let iniciada = false;
  const erro = (codigo: string) => ({
    ok: false as const,
    erro: { codigo },
    request_id: requestId,
  });
  try {
    const pacienteLido = uuidSchema.safeParse(comando.paciente_id);
    if (!pacienteLido.success) return erro('entrada_invalida');
    const paciente = pacienteLido.data.toLowerCase();
    const contrato = turnoExecucaoHttp[comando.operacao];
    const validada = contrato.entrada.safeParse(comando.entrada);
    if (!validada.success) return erro('entrada_invalida');
    const entrada = validada.data;
    const inicial = await portas.autorizar(request);
    if (inicial.estado !== 'autorizado') return erro(inicial.estado);
    const identidade = inicial.identidade;
    if (
      request.signal.aborted ||
      request.headers.get('x-sessao')?.toLowerCase() !== identidade.session_id.toLowerCase()
    )
      return erro('nao_autenticado');
    const chave =
      contrato.metodo === 'POST'
        ? chaveIdempotenciaSchema.parse(request.headers.get('x-chave-idempotencia'))
        : undefined;
    const digest = async (valor: unknown) =>
      portas.idempotencia.calcularDigestIdempotencia(
        portas.atestador.canonicalizar({
          paciente_id: paciente,
          operacao: comando.operacao,
          entrada: valor,
        }),
      );
    const rpc = async (
      nome: Parameters<PortasExecucaoTurno['executar']>[0],
      acao: string,
      campos: Record<string, unknown>,
      mutacao = false,
    ) => {
      if (request.signal.aborted) throw new Error('Pedido cancelado.');
      const e = { request_id: requestId, paciente_id: paciente, ...campos };
      const transporte = await prepararAtestadoConversao(e, acao, identidade, requestId, portas);
      if (mutacao) iniciada = true;
      const bruto = objeto(await portas.executar(nome, { p_transporte: transporte }));
      if (bruto.request_id !== requestId || typeof bruto.ok !== 'boolean')
        throw new Error('Resposta incompatível.');
      if (!bruto.ok) {
        const codigo = objeto(bruto.erro).codigo;
        throw new FalhaExecucao(
          codigo === 'conflito'
            ? 'conflito_versao'
            : typeof codigo === 'string'
              ? codigo
              : 'servico_indisponivel',
        );
      }
      if (nome === 'turno_execucao_barreira' && bruto.repeticao === undefined)
        bruto.repeticao = false;
      if (typeof bruto.repeticao !== 'boolean') throw new Error('Resposta incompatível.');
      return { dados: bruto.dados, identidades: bruto.identidades, repeticao: bruto.repeticao };
    };
    const consultaRelatorio = async (
      consulta: Record<string, unknown>,
    ): Promise<RelatorioTurnoPublico> => {
      const r = await rpc('turno_relatorio', 'api.consultar_relatorio_turno', consulta);
      const raw = objeto(r.dados);
      if (raw.paciente_id !== paciente) throw new Error('Resposta incompatível.');
      const nomes = await nomesExecucao(raw.identidades, portas.cifra);
      const itens = [];
      for (const item of z.array(z.unknown()).parse(raw.itens)) {
        const evento = objeto(item);
        const d = objeto(evento.dados);
        let dados: unknown;
        if (evento.categoria === 'turno')
          dados = turnoSchema.safeExtend({ profissional_nome: z.string().nullable() }).parse({
            profissional_nome: nomes.get(String(d.profissional_usuario_id)) ?? null,
            turno_id: d.id,
            paciente_id: d.paciente_id,
            profissional_usuario_id: d.profissional_usuario_id,
            aberto_em: d.aberto_em,
            encerrado_em: d.encerrado_em,
            situacao: d.situacao,
            versao: d.versao,
            parametros: d.parametros ?? {
              duracao_padrao_minutos: d.duracao_padrao_minutos,
              tolerancia_atraso_minutos: d.tolerancia_atraso_minutos,
              tratamento_nao_encerrado: d.tratamento_nao_encerrado,
            },
          });
        else if (evento.categoria === 'passagem') {
          const texto = await portas.cifra.decifrar(campoCifradoSchema.parse(d.conteudo_cifrado), {
            tabela: 'cadastro.diario_registro_versao',
            paciente_id: paciente,
            diario_registro_id: uuidSchema.parse(d.diario_registro_id),
            registro_id: uuidSchema.parse(d.registro_id),
            versao: z.number().int().positive().parse(d.versao),
            campo: 'conteudo',
            formato: 1,
          });
          dados = {
            turno_id: d.turno_id,
            registro_id: d.registro_id,
            versao: d.versao,
            autor_usuario_id: d.autor_usuario_id,
            autor_nome: nomes.get(String(d.autor_usuario_id)) ?? null,
            publicado_em: d.publicado_em,
            audiencia: d.audiencia,
            conteudo: apresentarPassagem(JSON.parse(texto)),
          };
        } else dados = await abrirRegistroExecucao(d, paciente, portas.cifra, nomes);
        itens.push({
          categoria: evento.categoria,
          id: evento.id,
          versao: evento.versao,
          instante: evento.instante,
          dados,
          ...(evento.categoria === 'ocorrencia'
            ? {
                anexos: z
                  .array(z.unknown())
                  .parse(d.anexos ?? [])
                  .map((v) => {
                    const a = objeto(v);
                    return {
                      anexo_id: a.anexo_id,
                      mime_type: a.mime_type,
                      tamanho_bytes: a.tamanho_bytes,
                    };
                  }),
              }
            : {}),
        });
      }
      await rpc('turno_relatorio', 'api.consultar_relatorio_turno', {
        ...consulta,
        consulta_id: raw.consulta_id,
      });
      return relatorioTurnoPublicoSchema.parse({
        consulta_id: raw.consulta_id,
        instante_corte: raw.instante_corte,
        rotulos_atuais: true,
        tipo: raw.tipo,
        paciente_id: raw.paciente_id,
        inicio: raw.inicio,
        fim: raw.fim,
        itens,
        proximo_cursor: raw.proximo_cursor,
        lacunas: raw.lacunas,
      });
    };
    let dados: unknown;
    switch (comando.operacao) {
      case 'reconciliar':
      case 'reconhecer':
        dados = (
          await rpc(
            'turno_execucao_barreira',
            comando.operacao === 'reconciliar'
              ? 'api.reconciliar_execucao_turno'
              : 'api.reconhecer_execucao_turno',
            objeto(entrada),
            true,
          )
        ).dados;
        break;
      case 'gravar': {
        if (!chave) return erro('entrada_invalida');
        const humano = turnoExecucaoHttp.gravar.entrada.parse(entrada);
        const privado = await cifrarExecucao(
          humano,
          paciente,
          chave,
          await digest(humano),
          portas.cifra,
        );
        const r = await rpc(
          'turno_execucao',
          'api.gravar_execucao_turno',
          { ...privado, epoca: humano.epoca },
          true,
        );
        dados = {
          ...(await abrirRegistroExecucao(
            r.dados,
            paciente,
            portas.cifra,
            await nomesExecucao(r.identidades ?? [], portas.cifra),
          )),
          recibo_id: uuidSchema.parse(objeto(r.dados).recibo_id),
        };
        break;
      }
      case 'consultar':
      case 'prescricoesVigentes': {
        const consulta =
          comando.operacao === 'consultar'
            ? objeto(entrada)
            : {
                ...objeto(entrada),
                classe: 'prescricao',
                vigente_em: objeto(entrada).vigente_em ?? new Date().toISOString(),
                inicio: '1970-01-01T00:00:00Z',
                fim: '9999-01-01T00:00:00Z',
              };
        const r = await rpc('turno_execucao', 'api.consultar_execucao_turno', consulta);
        const raw = objeto(r.dados);
        const nomes = await nomesExecucao(r.identidades ?? [], portas.cifra);
        dados = {
          itens: await Promise.all(
            z
              .array(z.unknown())
              .parse(raw.itens)
              .map((v) => abrirRegistroExecucao(v, paciente, portas.cifra, nomes)),
          ),
          proximo_cursor: raw.proximo_cursor,
          ...(comando.operacao === 'prescricoesVigentes'
            ? { vigente_em: consulta.vigente_em }
            : {}),
        };
        await rpc('turno_execucao', 'api.consultar_execucao_turno', consulta);
        break;
      }
      case 'catalogo':
      case 'configurarCatalogo': {
        const r = await rpc(
          'turno_execucao',
          comando.operacao === 'catalogo'
            ? 'api.consultar_catalogo_turno'
            : 'api.configurar_catalogo_turno',
          objeto(entrada),
          comando.operacao !== 'catalogo',
        );
        dados = z
          .array(z.unknown())
          .parse(r.dados)
          .map((v) => {
            const c = objeto(v);
            return {
              tipo: c.tipo,
              unidade: c.unidade,
              ativo: c.ativo,
              observacao: c.classe === 'rotina',
              referencia_informativa: c.referencia_informativa,
            };
          });
        break;
      }
      case 'candidatosMedicacao':
      case 'familiares': {
        const r = await rpc(
          comando.operacao === 'familiares' ? 'turno_relatorio' : 'turno_execucao',
          comando.operacao === 'familiares'
            ? 'api.consultar_fundamento_turno'
            : 'api.consultar_concessoes_medicacao_turno',
          objeto(entrada),
        );
        const raw = objeto(r.dados);
        const rows = z.array(z.unknown()).parse(raw.itens);
        const nomes = await nomesExecucao(rows, portas.cifra);
        dados = {
          itens: rows.map((v) => {
            const c = objeto(v);
            return {
              usuario_id: c.usuario_id,
              nome: nomes.get(String(c.usuario_id)) ?? null,
              ...(comando.operacao === 'familiares' ? {} : { concedida: c.concedida }),
            };
          }),
          proximo_cursor: raw.proximo_cursor,
          pode_gerir: raw.pode_gerir,
        };
        break;
      }
      case 'concederMedicacao':
        dados = (await rpc('turno_execucao', 'api.conceder_medicacao_turno', objeto(entrada), true))
          .dados;
        break;
      case 'consultarFundamento':
      case 'gravarFundamento': {
        const e = { ...objeto(entrada) };
        if (comando.operacao === 'gravarFundamento') {
          const h = turnoExecucaoHttp.gravarFundamento.entrada.parse(entrada);
          const aad = aadExecucao(
            'cadastro.turno_fundamento_familiar_versao',
            paciente,
            null,
            h.familiar_usuario_id,
            h.versao_esperada + 1,
            'fundamento',
          );
          Object.assign(e, {
            fundamento: await portas.cifra.cifrar(h.fundamento, aad),
            aad_fundamento: aad,
            chave_idempotencia: chave,
            digest_idempotencia: await digest(h),
          });
        }
        const r = await rpc(
          'turno_relatorio',
          comando.operacao === 'gravarFundamento'
            ? 'api.gravar_fundamento_turno'
            : 'api.consultar_fundamento_turno',
          e,
          comando.operacao === 'gravarFundamento',
        );
        if (r.dados === null) dados = null;
        else {
          const f = objeto(r.dados);
          dados = {
            paciente_id: f.paciente_id,
            familiar_usuario_id: f.familiar_usuario_id,
            versao: f.versao,
            estado: f.estado,
            fundamento: await portas.cifra.decifrar(
              campoCifradoSchema.parse(f.fundamento),
              aadExecucao(
                'cadastro.turno_fundamento_familiar_versao',
                paciente,
                null,
                String(f.familiar_usuario_id),
                Number(f.versao),
                'fundamento',
              ),
            ),
            vigencia_inicio: f.vigencia_inicio,
            vigencia_fim: f.vigencia_fim,
            autor_usuario_id: f.autor_usuario_id,
            registrado_em: f.registrado_em,
          };
        }
        break;
      }
      case 'consultarConversaoOcorrencia': {
        const autorizacao = await prepararAtestadoConversao(
          { request_id: requestId, paciente_id: paciente, autorizacao_somente: true },
          'api.ler_tarefas_cuidado',
          identidade,
          requestId,
          portas,
        );
        const r = await rpc('turno_execucao', 'api.consultar_conversao_ocorrencia_turno', {
          ...objeto(entrada),
          autorizacao_tarefa: autorizacao,
        });
        if (r.dados === null) dados = null;
        else {
          const c = objeto(r.dados);
          dados = { tarefa_id: c.tarefa_id, evolucao_id: c.evolucao_id };
        }
        break;
      }
      case 'converterOcorrencia': {
        if (!chave) return erro('entrada_invalida');
        const h = turnoExecucaoHttp.converterOcorrencia.entrada.parse(entrada);
        const { tarefa_id: _t, reserva_id: _r, geracao_reserva: _g, ...logico } = h;
        const e = await prepararConversaoOcorrencia(
          h,
          { paciente, requestId, chave: chave, digest: await digest(logico), identidade },
          portas,
        );
        const r = objeto(
          (await rpc('turno_execucao', 'api.converter_ocorrencia_turno', e, true)).dados,
        );
        dados = { tarefa_id: r.tarefa_id, evolucao_id: r.evolucao_id };
        break;
      }
      case 'relatorio':
        dados = await consultaRelatorio(objeto(entrada));
        break;
      case 'consultarPdf':
        dados = (await rpc('turno_relatorio', 'api.consultar_exportacao_turno', objeto(entrada)))
          .dados;
        break;
      case 'consultarPdfLocalizacao':
        dados = (
          await rpc(
            'turno_localizacao',
            'api.consultar_exportacao_localizacao_turno',
            objeto(entrada),
          )
        ).dados;
        break;
      case 'pdf': {
        const h = turnoExecucaoHttp.pdf.entrada.parse(entrada);
        const { exportacao_id, destinatario, proposito, ...consulta } = h;
        const existente = await rpc('turno_relatorio', 'api.consultar_exportacao_turno', {
          exportacao_id,
        });
        if (existente.dados !== null) throw new FalhaExecucao('conflito_idempotencia');
        const secoes: SecaoPdfExecucao[] = [];
        // FR-080: o consolidado diário sai na ordem da ficha de plantão, montada ao final a
        // partir dos mesmos eventos da projeção autorizada. Nenhuma consulta nova.
        const eventosFicha: RelatorioTurnoPublico['itens'][number][] = [];
        let lacunasFicha: RelatorioTurnoPublico['lacunas'] = [];
        let cursor: Record<string, unknown> = {};
        let consultaId: string | undefined;
        let instanteCorte: string | undefined;
        let textoTotal = 0;
        const vistos = new Set<string>();
        do {
          const pagina = await consultaRelatorio({
            ...consulta,
            ...cursor,
            ...(consultaId ? { consulta_id: consultaId } : {}),
            limite: 100,
          });
          if (
            consultaId &&
            (consultaId !== pagina.consulta_id || instanteCorte !== pagina.instante_corte)
          )
            throw new Error('Consulta incompatível.');
          consultaId = pagina.consulta_id;
          instanteCorte = pagina.instante_corte;
          for (const evento of pagina.itens) {
            if (h.tipo === 'diario') {
              eventosFicha.push(evento);
              continue;
            }
            const secao = apresentarEventoExecucao(evento);
            textoTotal += secao.titulo.length + secao.texto.length;
            if (textoTotal > 500_000) throw new Error('PDF excede limite de conteúdo.');
            secoes.push(secao);
          }
          if (vistos.size === 0 && h.tipo === 'diario') lacunasFicha = pagina.lacunas;
          else if (vistos.size === 0)
            secoes.push({
              titulo: 'Lacunas de cobertura',
              texto: pagina.lacunas.length
                ? pagina.lacunas
                    .map(
                      (lacuna) =>
                        `Sem cobertura registrada entre ${lacuna.inicio} e ${lacuna.fim}.`,
                    )
                    .join('\n')
                : 'Nenhuma lacuna indicada no período autorizado.',
            });
          if (!pagina.proximo_cursor) break;
          const assinatura = JSON.stringify(pagina.proximo_cursor);
          if (vistos.has(assinatura)) throw new Error('Paginação incompatível.');
          vistos.add(assinatura);
          cursor = {
            cursor_instante: pagina.proximo_cursor.instante,
            cursor_id: pagina.proximo_cursor.id,
            cursor_versao: pagina.proximo_cursor.versao,
            cursor_classe: pagina.proximo_cursor.classe,
          };
        } while (!request.signal.aborted);
        if (!instanteCorte) throw new Error('Corte de consulta ausente.');
        if (h.tipo === 'diario') {
          secoes.push(
            ...montarSecoesFichaConsolidada({ itens: eventosFicha, lacunas: lacunasFicha }),
          );
          textoTotal = secoes.reduce((t, s) => t + s.titulo.length + s.texto.length, 0);
          if (textoTotal > 500_000) throw new Error('PDF excede limite de conteúdo.');
        }
        secoes.unshift({
          titulo: 'Sobre esta emissão',
          texto:
            'Rótulos de autoria são os atuais; identidades históricas permanecem no registro. O conteúdo é o da projeção autorizada para quem emitiu, no corte indicado na identificação acima.',
        });
        if (h.tipo === 'caso')
          secoes.push(
            ...(await portas.lerCaso(request, {
              inicio: h.inicio,
              fim: h.fim,
              destinatario,
              proposito,
            })),
          );
        const bytes = await gerarPdfExecucao(
          {
            turno: 'Relatório de um turno',
            diario: 'Consolidado diário no formato da ficha',
            semanal: 'Consolidado de sete dias',
            caso: 'Exportação do caso por período',
          }[h.tipo],
          secoes,
          request.signal,
          instanteCorte,
          {
            caso: paciente,
            emissor: `identificador do autor persistido ${identidade.usuario_id}`,
            destinatario,
            proposito,
            versao: 1,
            exportacao: exportacao_id,
            periodo: { inicio: h.inicio, fim: h.fim },
          },
        );
        const aad = (campo: 'destinatario' | 'proposito') =>
          aadExecucao(
            'cadastro.turno_exportacao_pdf',
            paciente,
            h.turno_id ?? null,
            exportacao_id,
            1,
            campo,
          );
        const auditado = await rpc(
          'turno_relatorio',
          'api.registrar_exportacao_turno',
          {
            ...consulta,
            consulta_id: consultaId,
            exportacao_id,
            destinatario: await portas.cifra.cifrar(destinatario, aad('destinatario')),
            proposito: await portas.cifra.cifrar(proposito, aad('proposito')),
            aad_destinatario: aad('destinatario'),
            aad_proposito: aad('proposito'),
            digest_pdf: await digestBytes(bytes),
            chave_idempotencia: chave,
            digest_idempotencia: await digest(h),
          },
          true,
        );
        if (auditado.repeticao) throw new FalhaExecucao('conflito_idempotencia');
        if (objeto(auditado.dados).exportacao_id !== exportacao_id)
          throw new Error('Exportação não confirmada.');
        dados = bytes;
        break;
      }
      case 'exportarLocalizacao': {
        const h = turnoExecucaoHttp.exportarLocalizacao.entrada.parse(entrada);
        const existente = await rpc(
          'turno_localizacao',
          'api.consultar_exportacao_localizacao_turno',
          { turno_id: h.turno_id, exportacao_id: h.exportacao_id },
        );
        if (existente.dados !== null) throw new FalhaExecucao('conflito_idempotencia');
        const consulta = await rpc('turno_localizacao', 'api.consultar_localizacao_turno', {
          turno_id: h.turno_id,
        });
        const local = turnoExecucaoHttp.consultarLocalizacao.saida.parse(consulta.dados);
        const secoes = local.itens.map((item) => ({
          titulo: item.momento === 'abertura' ? 'Abertura' : 'Encerramento',
          texto: item.motivo_ausencia
            ? `Localização ausente: ${item.motivo_ausencia}.`
            : `Latitude declarada: ${item.latitude}. Longitude declarada: ${item.longitude}. Precisão informada: ${item.precisao_metros} metros. Registro: ${item.registrado_em}.`,
        }));
        if (local.ausencia)
          secoes.push({
            titulo: 'Retenção',
            texto: 'Localização descartada após o prazo de retenção.',
          });
        const bytes = await gerarPdfExecucao(
          'Localização declarada pelo aparelho',
          [
            {
              titulo: 'Finalidade restrita',
              texto:
                'Dado declarado, sem prova de presença. Audiência: Administrador e case manager do caso.',
            },
            ...secoes,
          ],
          request.signal,
          local.itens
            .map((item) => item.registrado_em)
            .sort()
            .at(-1) ?? '1970-01-01T00:00:00Z',
          {
            caso: paciente,
            emissor: `identificador do autor persistido ${identidade.usuario_id}`,
            destinatario: h.destinatario,
            proposito: h.proposito,
            versao: 1,
            exportacao: h.exportacao_id,
          },
        );
        const aad = (campo: 'destinatario' | 'proposito') =>
          aadExecucao(
            'cadastro.turno_localizacao_exportacao',
            paciente,
            h.turno_id,
            h.exportacao_id,
            1,
            campo,
          );
        const registro = await rpc(
          'turno_localizacao',
          'api.exportar_localizacao_turno',
          {
            turno_id: h.turno_id,
            exportacao_id: h.exportacao_id,
            destinatario: await portas.cifra.cifrar(h.destinatario, aad('destinatario')),
            proposito: await portas.cifra.cifrar(h.proposito, aad('proposito')),
            aad_destinatario: aad('destinatario'),
            aad_proposito: aad('proposito'),
            digest_pdf: await digestBytes(bytes),
            chave_idempotencia: chave,
            digest_idempotencia: await digest(h),
          },
          true,
        );
        if (registro.repeticao) throw new FalhaExecucao('conflito_idempotencia');
        if (objeto(registro.dados).exportacao_id !== h.exportacao_id)
          throw new Error('Exportação não confirmada.');
        dados = bytes;
        break;
      }
      case 'consentimento':
      case 'gravarConsentimento': {
        const e = objeto(entrada);
        const r = await rpc(
          'turno_localizacao',
          comando.operacao === 'consentimento'
            ? 'api.consultar_consentimento_turno'
            : 'api.gravar_consentimento_turno',
          {
            ...e,
            ...(comando.operacao === 'gravarConsentimento'
              ? { chave_idempotencia: chave, digest_idempotencia: await digest(e) }
              : {}),
          },
          comando.operacao === 'gravarConsentimento',
        );
        if (r.dados === null) dados = null;
        else {
          const c = objeto(r.dados);
          dados = {
            usuario_id: c.usuario_id,
            versao: c.versao,
            concedido: c.concedido,
            finalidade: c.finalidade,
            audiencia: c.audiencia,
            retencao_dias: c.retencao_dias,
            registrado_em: c.registrado_em,
          };
        }
        break;
      }
      case 'registrarLocalizacao':
        await rpc('turno_localizacao', 'api.registrar_localizacao_turno', objeto(entrada), true);
        dados = { registrado: true };
        break;
      case 'consultarLocalizacao':
        dados = (await rpc('turno_localizacao', 'api.consultar_localizacao_turno', objeto(entrada)))
          .dados;
        break;
      case 'anexos': {
        const raw = objeto(
          (await rpc('turno_anexo', 'api.listar_anexos_turno', objeto(entrada))).dados,
        );
        dados = {
          itens: z.array(z.unknown()).parse(raw.itens).map(baseAnexo),
          proximo_cursor: raw.proximo_cursor,
        };
        break;
      }
      case 'enviarAnexo': {
        const h = turnoExecucaoHttp.enviarAnexo.entrada.parse(entrada);
        if (
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(h.arquivo_base64)
        )
          return erro('entrada_invalida');
        const bytes = Uint8Array.from(atob(h.arquivo_base64), (c) => c.charCodeAt(0));
        if (
          bytes.length !== h.tamanho_bytes ||
          bytes.length > TAMANHO_MAXIMO_ANEXO_TURNO ||
          !imagemValida(bytes, h.mime_type)
        )
          return erro('entrada_invalida');
        const { arquivo_base64: _bytes, ...meta } = h;
        const reserva = objeto(
          (
            await rpc(
              'turno_anexo',
              'api.reservar_anexo_turno',
              {
                ...meta,
                classificacao: 'execucao_turno',
                chave_idempotencia: chave,
                digest_idempotencia: await digest({ ...meta, sha256: await digestBytes(bytes) }),
              },
              true,
            )
          ).dados,
        );
        if (
          reserva.id !== h.anexo_id ||
          reserva.paciente_id !== paciente ||
          typeof reserva.objeto_nome !== 'string'
        )
          throw new Error('Reserva incompatível.');
        const enviado = await portas.storage.enviar(reserva.objeto_nome, bytes, h.mime_type);
        if (enviado === 'existente') {
          const armazenado = await portas.storage.obter(reserva.objeto_nome);
          if ((await digestBytes(armazenado)) !== (await digestBytes(bytes)))
            throw new FalhaExecucao('conflito_idempotencia');
        }
        const confirmado = objeto(
          (await rpc('turno_anexo', 'api.confirmar_anexo_turno', { anexo_id: h.anexo_id }, true))
            .dados,
        );
        if (confirmado.anexo_id !== h.anexo_id || confirmado.confirmado !== true)
          throw new Error('Anexo não confirmado.');
        dados = baseAnexo(
          (await rpc('turno_anexo', 'api.consultar_anexo_turno', { anexo_id: h.anexo_id })).dados,
        );
        break;
      }
      case 'baixarAnexo': {
        const id = uuidSchema.parse(comando.anexo_id);
        const r = objeto(
          (await rpc('turno_anexo', 'api.consultar_anexo_turno', { anexo_id: id })).dados,
        );
        if (r.id !== id || r.paciente_id !== paciente || typeof r.objeto_nome !== 'string')
          throw new Error('Anexo incompatível.');
        const bytes = await portas.storage.obter(r.objeto_nome);
        if (
          bytes.length > TAMANHO_MAXIMO_ANEXO_TURNO ||
          bytes.length !== r.tamanho_bytes ||
          !imagemValida(bytes, String(r.mime_type))
        )
          throw new Error('Anexo incompatível.');
        await rpc('turno_anexo', 'api.consultar_anexo_turno', { anexo_id: id });
        dados = bytes;
        break;
      }
    }
    const atual = await portas.revalidar(request);
    if (
      request.signal.aborted ||
      atual.estado !== 'autorizado' ||
      atual.identidade.usuario_id !== identidade.usuario_id ||
      atual.identidade.session_id !== identidade.session_id
    )
      return erro(iniciada ? 'pendencia_externa' : 'nao_autenticado');
    return { ok: true as const, dados: contrato.saida.parse(dados), request_id: requestId };
  } catch (falha) {
    return erro(
      falha instanceof FalhaExecucao
        ? falha.codigo
        : iniciada
          ? 'pendencia_externa'
          : 'servico_indisponivel',
    );
  }
}
