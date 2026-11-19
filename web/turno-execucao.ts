import type { EstadoBarreiraExecucaoTurno } from '../packages/contracts/src/turno-execucao-barreira.ts';
import {
  gravarExecucaoPublicaSchema,
  type CatalogoTurnoPublico,
  type RegistroExecucaoPublico,
  type ConteudoExecucaoPublico,
} from '../packages/contracts/src/turno-execucao-http.ts';
import type { Turno } from '../packages/contracts/src/turno.ts';
import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.ts';
import type { ServicoTurnoExecucao } from './servico-turno-execucao-http.ts';
import {
  elementoTurno as el,
  campoTurno,
  selecaoTurno,
  instanteTurno,
  dataLocalTurno,
  estadoTurno,
  botaoTurno,
} from './turno-execucao-campos.ts';
import {
  montarEditorExecucao,
  rotulosClasse,
  type ClasseExecucao,
} from './turno-execucao-editor.ts';
import { apresentarRegistroTurno } from './turno-execucao-leitura.ts';
import { montarAnexosOcorrencia } from './turno-execucao-arquivos.ts';
import {
  montarConversaoOcorrenciaTurno,
  type PortasConversaoOcorrencia,
} from './turno-execucao-conversao.ts';
import { montarRelatoriosTurno } from './turno-execucao-relatorios.ts';
import { montarLocalizacaoCoordenacao } from './turno-execucao-localizacao-coordenacao.ts';
import { montarGestaoExecucaoTurno } from './turno-execucao-gestao.ts';

export function montarExecucaoTurno(
  raiz: HTMLElement,
  pacienteId: string,
  turno: Turno | null,
  servico: ServicoTurnoExecucao,
  opcoes: {
    usuarioId: string;
    administrador: boolean;
    acessoPerdido(erro: unknown): void;
    alteracaoPendente(valor: boolean): void;
    conversao?: PortasConversaoOcorrencia;
  },
) {
  let barreira: EstadoBarreiraExecucaoTurno | null = null;
  let reconciliacao: { comando_id: string; chave: string } | null = null;
  let reconhecimento: { epoca: number; recibo_id: string; chave: string } | null = null;
  let conferencia = false;
  let ativa = true;
  let ocupada = false;
  let rascunho = false;
  let catalogo: CatalogoTurnoPublico[] = [];
  let prescricoes: RegistroExecucaoPublico[] = [];
  let paginaPrescricoes: Awaited<ReturnType<ServicoTurnoExecucao['prescricoesVigentes']>> | null =
    null;
  let consulta: Parameters<ServicoTurnoExecucao['consultar']>[0] | null = null;
  let proximo: Awaited<ReturnType<ServicoTurnoExecucao['consultar']>>['proximo_cursor'] = null;
  let editor: ReturnType<typeof montarEditorExecucao> | null = null;
  let tentativa: {
    entrada: Parameters<ServicoTurnoExecucao['gravar']>[0];
    chave: string;
    consultada: boolean;
  } | null = null;
  const filhos: (() => void)[] = [];
  const filhosLeitura: (() => void)[] = [];
  const pendencias = new Map<string, boolean>();
  const pendente = (origem: string) => (valor: boolean) => {
    pendencias.set(origem, valor);
    opcoes.alteracaoPendente([...pendencias.values()].some(Boolean));
    if (ativa) controles();
  };
  const secao = el('section');
  secao.className = 'turno-execucao';
  const status = estadoTurno('Consultando catálogo da execução…');
  const acoes = el('div');
  acoes.className = 'turno-execucao__acoes';
  const editorRaiz = el('div');
  const lista = el('div');
  const auxiliares = el('div');
  const filtroForm = el('form');
  const filtroGrupo = el('fieldset');
  filtroGrupo.append(el('legend', 'Consultar série de registros'));
  const classe = selecaoTurno(
    filtroGrupo,
    'Tipo de registro',
    Object.entries(rotulosClasse).map(([valor, rotulo]) => ({ valor, rotulo })),
    'afericao',
  );
  const de = new Date();
  de.setHours(0, 0, 0, 0);
  const ate = new Date(de);
  ate.setDate(ate.getDate() + 1);
  const inicio = campoTurno(filtroGrupo, 'Desde', {
    tipo: 'datetime-local',
    valor: dataLocalTurno(de.toISOString()),
  });
  const fim = campoTurno(filtroGrupo, 'Até', {
    tipo: 'datetime-local',
    valor: dataLocalTurno(ate.toISOString()),
  });
  const consultar = el('button', 'Consultar série');
  consultar.type = 'submit';
  filtroGrupo.append(consultar);
  filtroForm.append(filtroGrupo);
  const mais = botaoTurno('Próxima página de registros', () => {
    if (consulta && proximo)
      void carregarSerie(
        {
          ...consulta,
          cursor_instante: proximo.instante,
          cursor_id: proximo.id,
          cursor_versao: proximo.versao,
        },
        true,
      );
  });
  mais.hidden = true;
  const conferir = botaoTurno('Conferir registro enviado', () => void recuperar());
  conferir.hidden = true;
  const painelBarreira = el('div');
  const reciboResumo = el('p');
  const reconciliar = botaoTurno(
    'Conferir envios antes de novo registro',
    () => void reconciliarEnvios(),
  );
  const reconhecer = botaoTurno(
    'Reconhecer recibo conferido e liberar novo registro',
    () => void reconhecerEnvio(),
  );
  reconhecer.hidden = true;
  painelBarreira.append(reciboResumo, reconciliar, reconhecer);
  const cancelar = botaoTurno('Descartar rascunho não enviado', () => {
    if (tentativa || ocupada) return;
    if (rascunho && !window.confirm('Descartar as alterações não enviadas deste registro?')) return;
    editor?.desmontar();
    editor = null;
    rascunho = false;
    pendente('editor')(false);
    controles();
  });
  cancelar.hidden = true;
  const atualizarCatalogo = botaoTurno('Atualizar catálogo', () => {
    if (!editor && !tentativa) void preparar();
  });
  secao.append(
    el('h3', 'Execução do cuidado'),
    el(
      'p',
      turno?.situacao === 'aberto'
        ? 'Seu turno está aberto. Cada registro preserva autor, instante do servidor e versões anteriores.'
        : 'Registros de execução exigem turno próprio aberto. Prescrições externas, séries e relatórios seguem suas permissões de acesso.',
    ),
    status,
    painelBarreira,
    atualizarCatalogo,
    acoes,
    editorRaiz,
    cancelar,
    conferir,
    filtroForm,
    lista,
    mais,
    auxiliares,
  );
  raiz.replaceChildren(secao);
  const relatorios = el('details');
  relatorios.append(el('summary', 'Relatórios e PDF'));
  const relatorioRaiz = el('div');
  relatorios.append(relatorioRaiz);
  secao.append(relatorios);
  filhos.push(
    montarRelatoriosTurno(relatorioRaiz, servico, {
      turno,
      acessoPerdido: opcoes.acessoPerdido,
      alteracaoPendente: pendente('pdf'),
    }),
  );
  const gestao = el('details');
  gestao.append(el('summary', 'Fundamento familiar, medicação e catálogo'));
  const gestaoRaiz = el('div');
  gestao.append(gestaoRaiz);
  secao.append(gestao);
  const localizacao = el('details');
  localizacao.append(el('summary', 'Localização declarada — coordenação'));
  const localizacaoRaiz = el('div');
  localizacao.append(localizacaoRaiz);
  secao.append(localizacao);
  let localizacaoMontada = false;
  localizacao.ontoggle = () => {
    if (localizacao.open && !localizacaoMontada) {
      localizacaoMontada = true;
      filhos.push(
        montarLocalizacaoCoordenacao(localizacaoRaiz, servico, {
          acessoPerdido: opcoes.acessoPerdido,
          alteracaoPendente: pendente('localizacao-restrita'),
        }),
      );
    }
  };
  let gestaoMontada = false;
  gestao.ontoggle = () => {
    if (gestao.open && !gestaoMontada) {
      gestaoMontada = true;
      filhos.push(
        montarGestaoExecucaoTurno(gestaoRaiz, servico, {
          acessoPerdido: opcoes.acessoPerdido,
          alteracaoPendente: pendente('gestao'),
          administrador: opcoes.administrador,
        }),
      );
    }
  };
  function controles() {
    const leituraPendente = [...pendencias].some(
      ([origem, valor]) =>
        valor && (origem.startsWith('anexo-') || origem.startsWith('conversao-')),
    );
    filtroGrupo.disabled = ocupada || leituraPendente;
    mais.disabled = ocupada || leituraPendente;
    for (const botao of acoes.querySelectorAll('button'))
      botao.disabled =
        !barreira ||
        barreira.resultado_pendente !== null ||
        reconciliacao !== null ||
        reconhecimento !== null ||
        ocupada ||
        editor !== null ||
        tentativa !== null ||
        (botao.dataset.exigeTurno === 'true' && turno?.situacao !== 'aberto');
    const recibo = barreira?.resultado_pendente;
    reciboResumo.textContent = recibo
      ? `Recibo pendente: ${rotulosClasse[recibo.classe]}, versão ${recibo.versao}, ${new Date(recibo.registrado_em).toLocaleString('pt-BR')}. ${recibo.paciente_id === pacienteId ? 'Caso atual.' : 'Outro caso. Nenhum conteúdo clínico desse caso é carregado aqui.'} Confira antes de reconhecer.`
      : '';
    reconciliar.disabled =
      ocupada || (editor !== null && tentativa === null && reconhecimento === null);
    reconhecer.hidden = !barreira?.resultado_pendente;
    reconhecer.disabled = ocupada || !conferencia;
    editor?.bloquear(
      ocupada || tentativa !== null || !barreira || barreira.resultado_pendente !== null,
    );
    cancelar.hidden = !editor || tentativa !== null;
    cancelar.disabled = ocupada;
    conferir.hidden = tentativa === null;
    conferir.disabled = ocupada;
    atualizarCatalogo.disabled = ocupada || editor !== null || tentativa !== null;
  }
  function falha(erro: unknown) {
    if (!ativa) return;
    if (
      exigeNovoAcesso(erro) &&
      !(erro instanceof FalhaApi && erro.codigo === 'pendencia_externa')
    ) {
      ativa = false;
      barreira = null;
      reconciliacao = null;
      reconhecimento = null;
      tentativa = null;
      editor?.desmontar();
      for (const desmontar of filhos) desmontar();
      for (const desmontar of filhosLeitura) desmontar();
      lista.replaceChildren();
      raiz.replaceChildren();
      opcoes.acessoPerdido(erro);
      return;
    }
    status.textContent = mensagemFalha(erro);
  }
  async function carregarSerie(
    entrada: Parameters<ServicoTurnoExecucao['consultar']>[0],
    acrescentar = false,
  ) {
    if (!ativa || ocupada) return;
    if (
      [...pendencias].some(
        ([origem, valor]) =>
          valor && (origem.startsWith('anexo-') || origem.startsWith('conversao-')),
      )
    ) {
      status.textContent = 'Conclua ou recupere o anexo ou a conversão antes de trocar a consulta.';
      return;
    }
    if (!acrescentar) {
      consulta = null;
      proximo = null;
      for (const desmontar of filhosLeitura.splice(0)) desmontar();
      lista.replaceChildren();
      auxiliares.replaceChildren();
      mais.hidden = true;
    }
    ocupada = true;
    controles();
    status.textContent = 'Consultando série de registros…';
    try {
      const pagina = await servico.consultar(entrada);
      if (!ativa) return;
      if (!acrescentar) {
        for (const desmontar of filhosLeitura.splice(0)) desmontar();
        lista.replaceChildren();
        auxiliares.replaceChildren();
      }
      if (!pagina.itens.length && !acrescentar)
        lista.append(el('p', 'Nenhum registro neste período.'));
      for (const registro of pagina.itens) {
        const item = apresentarRegistroTurno(registro);
        item.append(botaoTurno('Consultar versões anteriores', () => void historico(registro)));
        if (
          registro.registrador_usuario_id === opcoes.usuarioId ||
          registro.conteudo.classe === 'prescricao'
        )
          item.append(
            botaoTurno(
              'Retificar preservando o original',
              () => void abrirEditor(registro.conteudo.classe, registro),
            ),
          );
        if (registro.conteudo.classe === 'ocorrencia') {
          const anexosRaiz = el('div');
          item.append(anexosRaiz);
          filhosLeitura.push(
            montarAnexosOcorrencia(anexosRaiz, registro, servico, {
              podeAnexar:
                turno?.situacao === 'aberto' &&
                registro.turno_id === turno.turno_id &&
                registro.registrador_usuario_id === opcoes.usuarioId,
              acessoPerdido: opcoes.acessoPerdido,
              alteracaoPendente: pendente(`anexo-${registro.registro_id}`),
            }),
          );
          if (opcoes.conversao) {
            const conversao = el('div');
            item.append(conversao);
            filhosLeitura.push(
              montarConversaoOcorrenciaTurno(
                conversao,
                pacienteId,
                registro,
                servico,
                opcoes.conversao,
                {
                  acessoPerdido: opcoes.acessoPerdido,
                  alteracaoPendente: pendente(`conversao-${registro.registro_id}`),
                },
              ),
            );
          }
        }
        lista.append(item);
      }
      consulta = { ...entrada };
      proximo = pagina.proximo_cursor;
      mais.hidden = proximo === null;
      status.textContent = proximo
        ? 'Página consultada. Há mais registros no período.'
        : 'Consulta da série concluída.';
    } catch (erro) {
      falha(erro);
    } finally {
      ocupada = false;
      if (ativa) controles();
    }
  }
  async function historico(
    registro: RegistroExecucaoPublico,
    cursor?: NonNullable<typeof proximo>,
    destino?: HTMLElement,
  ) {
    if (!ativa || ocupada) return;
    ocupada = true;
    controles();
    const painel = destino ?? el('section');
    if (!destino) {
      painel.append(el('h4', 'Histórico preservado do registro'));
      auxiliares.replaceChildren(painel);
    }
    try {
      const pagina = await servico.consultar({
        classe: registro.conteudo.classe,
        historico: true,
        registro_id: registro.registro_id,
        inicio: '1970-01-01T00:00:00Z',
        fim: new Date(Date.now() + 86_400_000).toISOString(),
        limite: 25,
        ...(cursor
          ? { cursor_instante: cursor.instante, cursor_id: cursor.id, cursor_versao: cursor.versao }
          : {}),
      });
      if (!ativa) return;
      if (!pagina.itens.length) painel.append(el('p', 'Nenhuma versão encontrada nesta consulta.'));
      for (const versao of pagina.itens) painel.append(apresentarRegistroTurno(versao));
      if (pagina.proximo_cursor)
        painel.append(
          botaoTurno(
            'Mais versões do registro',
            () => void historico(registro, pagina.proximo_cursor ?? undefined, painel),
          ),
        );
      status.textContent = 'Histórico consultado; versões e executor original preservados.';
    } catch (erro) {
      falha(erro);
    } finally {
      ocupada = false;
      if (ativa) controles();
    }
  }
  async function carregarPrescricoes(
    cursor?: NonNullable<NonNullable<typeof paginaPrescricoes>['proximo_cursor']>,
  ) {
    const pagina = await servico.prescricoesVigentes({
      ...(paginaPrescricoes ? { vigente_em: paginaPrescricoes.vigente_em } : {}),
      ...(cursor
        ? { cursor_instante: cursor.instante, cursor_id: cursor.id, cursor_versao: cursor.versao }
        : {}),
      limite: 25,
    });
    if (!ativa) return;
    prescricoes = cursor ? [...prescricoes, ...pagina.itens] : pagina.itens;
    paginaPrescricoes = pagina;
  }
  async function abrirEditor(classeEscolhida: ClasseExecucao, atual?: RegistroExecucaoPublico) {
    if (
      !ativa ||
      ocupada ||
      editor ||
      tentativa ||
      !barreira ||
      barreira.resultado_pendente ||
      reconciliacao ||
      reconhecimento
    )
      return;
    if (!atual && classeEscolhida !== 'prescricao' && (!turno || turno.situacao !== 'aberto')) {
      status.textContent = 'Abra seu turno neste caso antes de registrar ou retificar execução.';
      return;
    }
    ocupada = true;
    controles();
    try {
      if (classeEscolhida === 'administracao') {
        paginaPrescricoes = null;
        await carregarPrescricoes();
        if (!ativa) return;
      }
      const desenhar = () => {
        editor = montarEditorExecucao(
          editorRaiz,
          classeEscolhida,
          { turnoId: turno?.turno_id ?? null, catalogo, prescricoes, atual },
          {
            alteracaoPendente(valor) {
              rascunho = valor;
              pendente('editor')(valor);
            },
            cancelar: () => cancelar.click(),
            enviar(conteudo: ConteudoExecucaoPublico, motivo?: string) {
              if (tentativa || ocupada) return;
              const validado = gravarExecucaoPublicaSchema.safeParse({
                epoca: barreira?.epoca,
                registro_id: atual?.registro_id ?? crypto.randomUUID(),
                versao_esperada: atual?.versao ?? 0,
                conteudo,
                ...(motivo ? { motivo } : {}),
              });
              if (!validado.success) {
                editor?.informar('Confira os dados e o motivo obrigatório.');
                return;
              }
              tentativa = {
                entrada: structuredClone(validado.data),
                chave: crypto.randomUUID(),
                consultada: false,
              };
              pendente('editor')(true);
              void enviar();
            },
          },
        );
        if (classeEscolhida === 'administracao' && paginaPrescricoes?.proximo_cursor) {
          const proxima = paginaPrescricoes.proximo_cursor;
          editorRaiz.append(
            botaoTurno('Mais prescrições vigentes', () => {
              if (rascunho || tentativa) {
                status.textContent =
                  'Cancele esta edição antes de ampliar a lista de prescrições; seus campos foram preservados.';
                return;
              }
              if (ocupada) return;
              ocupada = true;
              controles();
              void carregarPrescricoes(proxima)
                .then(() => {
                  if (ativa) {
                    editor?.desmontar();
                    desenhar();
                  }
                })
                .catch(falha)
                .finally(() => {
                  ocupada = false;
                  if (ativa) controles();
                });
            }),
          );
        }
        editor.focar();
        controles();
      };
      desenhar();
      status.textContent =
        'Preencha o registro. Valores clínicos não são preenchidos pelo histórico.';
    } catch (erro) {
      falha(erro);
    } finally {
      ocupada = false;
      if (ativa) {
        controles();
        editor?.focar();
      }
    }
  }
  async function enviar() {
    if (!ativa || ocupada || !tentativa) return;
    ocupada = true;
    tentativa.consultada = false;
    controles();
    editor?.informar('Aguardando confirmação do servidor…');
    try {
      const registro = await servico.gravar(tentativa.entrada, tentativa.chave);
      if (!ativa) return;
      if (
        registro.registro_id !== tentativa.entrada.registro_id ||
        registro.versao !== tentativa.entrada.versao_esperada + 1
      )
        throw new FalhaApi('pendencia_externa', 0, true);
      reconhecimento = {
        epoca: tentativa.entrada.epoca,
        recibo_id: registro.recibo_id,
        chave: crypto.randomUUID(),
      };
      await servico
        .reconhecer(
          { epoca: reconhecimento.epoca, recibo_id: reconhecimento.recibo_id },
          reconhecimento.chave,
        )
        .then((estado) => {
          if (ativa) {
            barreira = estado;
            reconhecimento = null;
          }
        });
      if (!ativa) return;
      tentativa = null;
      editor?.desmontar();
      editor = null;
      rascunho = false;
      pendente('editor')(false);
      status.textContent =
        registro.conteudo.classe === 'ocorrencia'
          ? 'Ocorrência confirmada. Consulte a série de ocorrências para anexar foto ou converter em ação.'
          : 'Registro confirmado; original e histórico preservados.';
      lista.prepend(apresentarRegistroTurno(registro));
    } catch (erro) {
      const exigeConferencia =
        erro instanceof FalhaApi &&
        (erro.codigo === 'conflito' ||
          erro.codigo === 'conflito_versao' ||
          erro.codigo === 'conflito_idempotencia');
      if (exigeConferencia) barreira = null;
      if (!resultadoIncerto(erro) && !exigeConferencia) tentativa = null;
      falha(erro);
      editor?.informar(
        tentativa
          ? 'Resultado incerto. Confira os envios: a época anterior será encerrada antes de liberar qualquer nova intenção.'
          : 'Envio recusado. Corrija os campos ou consulte a versão atual antes de uma nova revisão.',
      );
    } finally {
      ocupada = false;
      if (ativa) controles();
    }
  }
  async function recuperar() {
    await reconciliarEnvios();
  }
  async function reconciliarEnvios() {
    if (!ativa || ocupada || (editor !== null && tentativa === null && reconhecimento === null))
      return;
    ocupada = true;
    conferencia = false;
    controles();
    reconciliacao ??= { comando_id: crypto.randomUUID(), chave: crypto.randomUUID() };
    try {
      const estado = await servico.reconciliar(
        { comando_id: reconciliacao.comando_id },
        reconciliacao.chave,
      );
      if (!ativa) return;
      barreira = estado;
      reconciliacao = null;
      reconhecimento = null;
      tentativa = null;
      editor?.desmontar();
      editor = null;
      rascunho = false;
      const recibo = estado.resultado_pendente;
      if (recibo) {
        status.textContent = `Envio confirmado pendente de conferência: ${rotulosClasse[recibo.classe]}, versão ${recibo.versao}, ${new Date(recibo.registrado_em).toLocaleString('pt-BR')}. ${recibo.paciente_id === pacienteId ? 'Caso atual.' : 'Outro caso; somente metadados próprios disponíveis aqui.'}`;
        if (recibo.paciente_id === pacienteId) {
          try {
            const pagina = await servico.consultar({
              classe: recibo.classe,
              registro_id: recibo.registro_id,
              historico: true,
              limite: 100,
            });
            if (!ativa) return;
            const registro = pagina.itens.find((item) => item.versao === recibo.versao);
            if (registro) lista.prepend(apresentarRegistroTurno(registro));
          } catch {
            if (ativa)
              status.textContent +=
                ' Conteúdo indisponível com o acesso atual; recibo operacional preservado.';
          }
        }
        conferencia = true;
        pendente('editor')(true);
      } else {
        pendente('editor')(false);
        status.textContent =
          'Conferência concluída. Envios da época anterior foram encerrados; nenhum resultado pendente. Novo registro exige uma ação explícita.';
      }
    } catch (erro) {
      barreira = null;
      falha(erro);
      pendente('editor')(true);
    } finally {
      ocupada = false;
      if (ativa) controles();
    }
  }
  async function reconhecerEnvio() {
    if (!ativa || ocupada || !barreira?.resultado_pendente || !conferencia) return;
    reconhecimento ??= {
      epoca: barreira.epoca,
      recibo_id: barreira.resultado_pendente.recibo_id,
      chave: crypto.randomUUID(),
    };
    ocupada = true;
    controles();
    try {
      const estado = await servico.reconhecer(
        { epoca: reconhecimento.epoca, recibo_id: reconhecimento.recibo_id },
        reconhecimento.chave,
      );
      if (!ativa) return;
      barreira = estado;
      reconhecimento = null;
      conferencia = false;
      pendente('editor')(false);
      status.textContent = 'Recibo reconhecido. Novo registro liberado.';
    } catch (erro) {
      falha(erro);
    } finally {
      ocupada = false;
      if (ativa) controles();
    }
  }
  async function preparar() {
    if (!ativa || ocupada) return;
    ocupada = true;
    controles();
    try {
      catalogo = await servico.catalogo();
      if (!ativa) return;
      acoes.replaceChildren();
      for (const nome of Object.keys(rotulosClasse) as ClasseExecucao[]) {
        const botao = botaoTurno(
          `Registrar ${rotulosClasse[nome].toLocaleLowerCase('pt-BR')}`,
          () => void abrirEditor(nome),
        );
        botao.dataset.exigeTurno = String(nome !== 'prescricao');
        if (nome !== 'prescricao' && turno?.situacao !== 'aberto') botao.disabled = true;
        acoes.append(botao);
      }
      if (barreira && !barreira.resultado_pendente)
        status.textContent =
          'Catálogo consultado. Selecione um registro ou consulte a série por período.';
    } catch (erro) {
      falha(erro);
    } finally {
      ocupada = false;
      if (ativa) controles();
    }
  }
  filtroForm.onsubmit = (evento) => {
    evento.preventDefault();
    if (ocupada) return;
    try {
      const desde = instanteTurno(inicio.value);
      const ate = instanteTurno(fim.value);
      if (Date.parse(ate) <= Date.parse(desde)) throw new Error();
      void carregarSerie({
        classe: classe.value as ClasseExecucao,
        inicio: desde,
        fim: ate,
        limite: 25,
      });
    } catch {
      status.textContent = 'Confira as datas e o tipo de registro.';
    }
  };
  controles();
  void reconciliarEnvios().then(() => {
    if (ativa) void preparar();
  });
  return () => {
    ativa = false;
    barreira = null;
    reconciliacao = null;
    reconhecimento = null;
    tentativa = null;
    editor?.desmontar();
    editor = null;
    catalogo = [];
    prescricoes = [];
    for (const desmontar of filhos) desmontar();
    for (const desmontar of filhosLeitura) desmontar();
    pendencias.clear();
    raiz.replaceChildren();
  };
}
