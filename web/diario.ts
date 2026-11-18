import { esqueletoCarregando, iniciarAcao } from './esqueleto.js';
import type {
  AudienciaDiario,
  ConteudoEvolucaoDiario,
  ConteudoRelatoDiario,
  OrigemConteudoDiario,
  RegistroDiario,
  SalvarRegistroDiario,
} from '../packages/contracts/src/diario.ts';
import { relatoTextualSchema } from '../packages/contracts/src/relato-textual.ts';
import type { TarefaCuidado } from '../packages/contracts/src/tarefa-cuidado.ts';
import { exigeNovoAcesso, mensagemFalha } from './api.js';

export type ServicoDiarioTela = {
  consultar(pacienteId: string): Promise<RegistroDiario[]>;
  salvar(pacienteId: string, entrada: SalvarRegistroDiario): Promise<RegistroDiario>;
};

/** Conversão em tarefa (FR-014). A tarefa pertence à fatia de tarefas, com a barreira e o
 * ciclo dela; aqui só entra o identificador devolvido, para o registro guardar o
 * encaminhamento que a sinalização gerou. Sem esta porta a tela ainda sinaliza atenção e
 * registra motivo e data — só não amarra a tarefa. */
export type ConversaoEmTarefa = (
  pacienteId: string,
  tarefa: TarefaCuidado,
) => Promise<string | undefined>;

/** FR-010: ditar o registro em vez de digitá-lo. A gravação, o envio e a transcrição
 * pertencem à fatia de áudio; o diário só recebe o texto já revisado e confirmado pelo
 * autor, e devolve a função que desmonta o componente. */
export type EntradaPorAudio = (
  raiz: HTMLElement,
  aoConfirmar: (texto: string) => void,
) => () => void;

const rotuloEstado: Record<RegistroDiario['estado'], string> = {
  rascunho: 'Rascunho',
  publicado: 'Publicado',
  retificado: 'Retificado',
};
const rotuloAudiencia: Record<AudienciaDiario, string> = {
  equipe: 'Equipe do caso',
  equipe_e_familia: 'Equipe do caso e família',
};

function elemento<K extends keyof HTMLElementTagNameMap>(tipo: K, texto?: string) {
  const el = document.createElement(tipo);
  if (texto !== undefined) el.textContent = texto;
  return el;
}

function linha(titulo: string, valor: string): HTMLElement {
  const item = elemento('p');
  item.append(elemento('strong', `${titulo}: `), document.createTextNode(valor));
  return item;
}

/** FR-013: envio, consulta e retorno são situações distintas, e consultar não encerra a
 * solicitação de retorno. A frase é montada só para quem enviou. */
function situacaoDoRemetente(registro: RegistroDiario, respostas: number): string {
  if (registro.estado === 'rascunho') return 'Rascunho: ainda não enviado.';
  const partes = ['Enviado'];
  partes.push(registro.consultas > 0 ? 'consultado pela equipe' : 'ainda não consultado');
  if (respostas > 0) partes.push('retorno registrado');
  else if (registro.retorno_solicitado) partes.push('retorno solicitado e ainda não registrado');
  return `${partes.join(' · ')}.`;
}

function dataLegivel(iso: string): string {
  const instante = new Date(iso);
  return Number.isNaN(instante.getTime()) ? iso : instante.toLocaleString('pt-BR');
}

/** Aba de diário e evolução da ficha (FR-008, FR-009, FR-012, FR-013, FR-014), ligada ao
 * serviço autorizado no servidor. A audiência mostrada aqui é informativa: quem decide quem
 * enxerga cada registro é o banco. */
export function montarDiario(
  raiz: HTMLElement,
  pacienteId: string,
  usuarioId: string,
  servico: ServicoDiarioTela,
  obterAreas: () => readonly string[],
  acessoPerdido: (erro: unknown) => void,
  alteracaoPendente: (pendente: boolean) => void = () => {},
  converterEmTarefa?: ConversaoEmTarefa,
  montarEntradaPorAudio?: EntradaPorAudio,
  /** FR-008: família registra relato (tipo `relato_familiar`, audiência sempre `equipe`),
   * nunca a síntese de evolução da equipe nem a resposta a um relato. */
  ehFamilia = false,
): () => void {
  let ativa = true;
  let registros: RegistroDiario[] = [];
  let pendenteFamiliar = false;
  let salvandoFamiliar = false;
  let geracaoConsulta = 0;
  let formularioFamiliar: HTMLFormElement | undefined;
  let regiaoLeituras: HTMLElement | undefined;
  let avisoLeituras: HTMLElement | undefined;
  let estadoLeituras: 'carregando' | 'pronto' | 'erro' = 'carregando';
  let salvosDuranteConsulta: Map<string, RegistroDiario> | undefined;
  // Componentes montados dentro de um formulário que é recriado a cada troca de aba.
  const desmontesDoFormulario: (() => void)[] = [];
  const desmontarFormularios = () => {
    for (const desmontar of desmontesDoFormulario.splice(0)) desmontar();
  };
  const descartarAcesso = (erro: unknown): boolean => {
    if (!exigeNovoAcesso(erro)) return false;
    ativa = false;
    geracaoConsulta++;
    if (ehFamilia) document.removeEventListener('visibilitychange', visibilidadeAlterada);
    desmontarFormularios();
    raiz.replaceChildren();
    acessoPerdido(erro);
    return true;
  };
  const status = elemento('p', 'Carregando o diário…');
  status.setAttribute('role', 'status');
  const carregamento = esqueletoCarregando(3, true);
  raiz.replaceChildren(status, carregamento);

  const gravar = async (entrada: SalvarRegistroDiario): Promise<RegistroDiario> => {
    const salvo = await servico.salvar(pacienteId, entrada);
    salvosDuranteConsulta?.set(salvo.diario_registro_id, salvo);
    registros = [
      salvo,
      ...registros.filter((r) => r.diario_registro_id !== salvo.diario_registro_id),
    ];
    return salvo;
  };

  const campo = <T extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    destino: HTMLElement,
    rotulo: string,
    controle: T,
  ): T => {
    const label = elemento('label', rotulo);
    label.append(controle);
    destino.append(label);
    return controle;
  };

  /** FR-008: relato da família. Audiência é sempre "equipe" — é a coordenação/equipe que
   * decide ampliar para "equipe e família" ao responder, não quem relata. Sem atenção
   * sinalizada e sem resposta: isso é vocabulário da equipe, não da família. */
  const formularioRelatoFamiliar = (
    aoConcluir: (aviso: string) => void,
    rascunhoExistente?: RegistroDiario,
  ): HTMLFormElement => {
    const form = elemento('form');
    form.noValidate = true;
    form.append(
      elemento('h3', 'Registrar no diário'),
      elemento('p', 'Conte o que aconteceu e o que você gostaria de levar à coordenação.'),
    );
    const data = campo(form, 'Quando aconteceu? (obrigatória)', elemento('input'));
    data.type = 'date';
    const descricao = campo(form, 'O que aconteceu? (obrigatória)', elemento('textarea'));
    // FR-010: ditar é atalho para preencher a descrição, nunca requisito.
    let origemConteudo: OrigemConteudoDiario = rascunhoExistente?.origem_conteudo ?? 'texto';
    if (montarEntradaPorAudio) {
      const porAudio = document.createElement('div');
      porAudio.className = 'diario-entrada-audio';
      form.append(porAudio);
      const desmontarAudio = montarEntradaPorAudio(porAudio, (texto) => {
        descricao.value = texto;
        origemConteudo = 'audio_transcrito';
        pendenteFamiliar = true;
        alteracaoPendente(true);
        descricao.focus();
      });
      desmontesDoFormulario.push(desmontarAudio);
      descricao.addEventListener('input', () => {
        if (!descricao.value.trim()) origemConteudo = 'texto';
      });
    }
    const categoria = campo(form, 'Categoria (opcional)', elemento('input'));
    const contexto = campo(form, 'O que ajudou? (opcional)', elemento('textarea'));
    const acao = campo(form, 'Ação tomada (opcional)', elemento('textarea'));
    const retorno = elemento('input');
    retorno.type = 'checkbox';
    campo(form, 'Gostaria de um retorno da coordenação', retorno);
    if (rascunhoExistente) {
      const conteudo = rascunhoExistente.conteudo as ConteudoRelatoDiario;
      data.value = conteudo.dataAcontecimento;
      descricao.value = conteudo.descricao;
      categoria.value = conteudo.categoria ?? '';
      contexto.value = conteudo.contexto ?? '';
      acao.value = conteudo.acaoTomada ?? '';
      retorno.checked = rascunhoExistente.retorno_solicitado;
    }
    const aviso = elemento('p');
    aviso.setAttribute('role', 'status');
    aviso.setAttribute('aria-live', 'polite');
    const rascunho = elemento('button', 'Salvar rascunho');
    rascunho.type = 'button';
    const publicar = elemento('button', 'Publicar');
    publicar.type = 'submit';
    form.append(aviso, rascunho, publicar);
    form.addEventListener('input', () => {
      pendenteFamiliar = true;
      alteracaoPendente(true);
      aviso.textContent = '';
    });
    const montarConteudo = (): ConteudoRelatoDiario | undefined => {
      const resultado = relatoTextualSchema.safeParse({
        dataAcontecimento: data.value,
        descricao: descricao.value,
        ...(categoria.value.trim() ? { categoria: categoria.value.trim() } : {}),
        ...(contexto.value.trim() ? { contexto: contexto.value.trim() } : {}),
        ...(acao.value.trim() ? { acaoTomada: acao.value.trim() } : {}),
      });
      return resultado.success ? resultado.data : undefined;
    };
    const enviar = async (estado: 'rascunho' | 'publicado') => {
      const conteudo = montarConteudo();
      if (!conteudo) {
        aviso.textContent = 'Informe quando aconteceu e o que aconteceu.';
        (data.value ? descricao : data).focus();
        return;
      }
      const controles = [
        ...form.querySelectorAll<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement
        >('input, textarea, select, button'),
      ];
      for (const controle of controles) controle.disabled = true;
      aviso.textContent = estado === 'rascunho' ? 'Salvando rascunho…' : 'Publicando…';
      const finalizar = iniciarAcao(estado === 'rascunho' ? rascunho : publicar);
      salvandoFamiliar = true;
      try {
        await gravar({
          ...(rascunhoExistente
            ? { diario_registro_id: rascunhoExistente.diario_registro_id }
            : {}),
          versao_esperada: rascunhoExistente?.versao ?? 0,
          tipo: 'relato_familiar',
          estado,
          audiencia: 'equipe',
          atencao: false,
          retorno_solicitado: retorno.checked,
          origem_conteudo: origemConteudo,
          conteudo,
        });
        pendenteFamiliar = false;
        alteracaoPendente(false);
        aoConcluir(estado === 'rascunho' ? 'Rascunho salvo.' : 'Relato enviado à coordenação.');
      } catch (erro) {
        if (descartarAcesso(erro)) return;
        aviso.textContent = mensagemFalha(erro);
      } finally {
        finalizar();
        salvandoFamiliar = false;
        for (const controle of controles) controle.disabled = false;
      }
    };
    rascunho.addEventListener('click', () => void enviar('rascunho'));
    form.addEventListener('submit', (evento) => {
      evento.preventDefault();
      void enviar('publicado');
    });
    return form;
  };

  /** FR-009: modelo curto por área. As áreas vêm da configuração da equipe; quando a leitura
   * falha, o campo continua existindo como texto livre em vez de sumir da tela. */
  const formularioEvolucao = (
    aoConcluir: (aviso: string) => void,
    responde?: RegistroDiario,
  ): HTMLFormElement => {
    const form = elemento('form');
    form.noValidate = true;
    form.append(
      elemento(
        'h3',
        responde ? 'Responder ao relato da família' : 'Registrar evolução profissional',
      ),
    );
    const listaAreas = obterAreas();
    const area = listaAreas.length
      ? campo(form, 'Área (obrigatória)', elemento('select'))
      : campo(form, 'Área (obrigatória)', elemento('input'));
    if (area instanceof HTMLSelectElement)
      for (const nome of listaAreas) {
        const opcao = elemento('option', nome);
        opcao.value = nome;
        area.append(opcao);
      }
    const data = campo(form, 'Data do atendimento (obrigatória)', elemento('input'));
    data.type = 'date';
    const atividade = campo(form, 'Atividade (obrigatória para publicar)', elemento('textarea'));
    // FR-010: ditar é atalho para preencher a atividade, nunca requisito — o campo acima
    // continua inteiro para quem prefere ou precisa digitar.
    let origemAtividade: OrigemConteudoDiario = 'texto';
    if (montarEntradaPorAudio) {
      const porAudio = document.createElement('div');
      porAudio.className = 'diario-entrada-audio';
      form.append(porAudio);
      const desmontarAudio = montarEntradaPorAudio(porAudio, (texto) => {
        atividade.value = texto;
        origemAtividade = 'audio_transcrito';
        alteracaoPendente(true);
        atividade.focus();
      });
      desmontesDoFormulario.push(desmontarAudio);
      // Editar o texto depois de ditar continua sendo transcrição revisada, não digitação:
      // só voltar a zero desfaz a origem.
      atividade.addEventListener('input', () => {
        if (!atividade.value.trim()) origemAtividade = 'texto';
      });
    }
    const observacoes = campo(form, 'Observações compartilháveis', elemento('textarea'));
    const progresso = campo(form, 'Progresso', elemento('textarea'));
    const orientacao = campo(form, 'Orientação', elemento('textarea'));
    const proximo = campo(form, 'Próximo passo', elemento('textarea'));
    const objetivo = campo(form, 'Objetivo relacionado', elemento('input'));
    const audiencia = campo(form, 'Quem verá este registro', elemento('select'));
    for (const valor of ['equipe', 'equipe_e_familia'] as AudienciaDiario[]) {
      const opcao = elemento('option', rotuloAudiencia[valor]);
      opcao.value = valor;
      audiencia.append(opcao);
    }
    // FR-013: o retorno precisa alcançar quem escreveu o relato, e o banco recusa outra coisa.
    if (responde?.tipo === 'relato_familiar') {
      audiencia.value = 'equipe_e_familia';
      audiencia.disabled = true;
      form.append(
        elemento(
          'p',
          'O retorno a um relato da família é sempre visto por quem o escreveu, além da equipe.',
        ),
      );
    }
    const destinatarios = elemento('p');
    destinatarios.setAttribute('role', 'status');
    const mostrarDestinatarios = () => {
      destinatarios.textContent = `Ao publicar, este registro ficará visível para: ${rotuloAudiencia[audiencia.value as AudienciaDiario]}.`;
    };
    mostrarDestinatarios();
    audiencia.addEventListener('change', mostrarDestinatarios);
    const atencao = elemento('input');
    atencao.type = 'checkbox';
    campo(form, 'Indicar necessidade de atenção', atencao);
    const aviso = elemento('p');
    aviso.setAttribute('role', 'status');
    aviso.setAttribute('aria-live', 'polite');
    const rascunho = elemento('button', 'Salvar rascunho');
    rascunho.type = 'button';
    const publicar = elemento('button', 'Publicar');
    publicar.type = 'submit';
    form.append(destinatarios, aviso, rascunho, publicar);
    form.addEventListener('input', () => {
      alteracaoPendente(true);
      aviso.textContent = '';
    });
    const montarConteudo = (): ConteudoEvolucaoDiario | undefined => {
      const valores = {
        data: data.value,
        area: area.value.trim(),
        ...(atividade.value.trim() ? { atividade: atividade.value.trim() } : {}),
        ...(observacoes.value.trim()
          ? { observacoesCompartilhaveis: observacoes.value.trim() }
          : {}),
        ...(progresso.value.trim() ? { progresso: progresso.value.trim() } : {}),
        ...(orientacao.value.trim() ? { orientacao: orientacao.value.trim() } : {}),
        ...(proximo.value.trim() ? { proximoPasso: proximo.value.trim() } : {}),
        ...(objetivo.value.trim() ? { objetivoRelacionado: objetivo.value.trim() } : {}),
      };
      if (!valores.data || !valores.area) return undefined;
      return valores as ConteudoEvolucaoDiario;
    };
    const enviar = async (estado: 'rascunho' | 'publicado') => {
      const conteudo = montarConteudo();
      if (!conteudo) {
        aviso.textContent = 'Informe a data do atendimento e a área.';
        (data.value ? area : data).focus();
        return;
      }
      if (estado === 'publicado' && !conteudo.atividade) {
        aviso.textContent = 'Para publicar, descreva a atividade realizada.';
        atividade.focus();
        return;
      }
      const controles = [
        ...form.querySelectorAll<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement
        >('input, textarea, select, button'),
      ];
      for (const controle of controles) controle.disabled = true;
      aviso.textContent = estado === 'rascunho' ? 'Salvando rascunho…' : 'Publicando…';
      const finalizar = iniciarAcao(estado === 'rascunho' ? rascunho : publicar);
      try {
        await gravar({
          versao_esperada: 0,
          tipo: 'evolucao_profissional',
          estado,
          audiencia: audiencia.value as AudienciaDiario,
          atencao: atencao.checked,
          retorno_solicitado: false,
          origem_conteudo: origemAtividade,
          ...(responde ? { responde_registro_id: responde.diario_registro_id } : {}),
          conteudo,
        });
        alteracaoPendente(false);
        aoConcluir(
          estado === 'rascunho'
            ? 'Rascunho salvo.'
            : 'Evolução publicada para a audiência escolhida.',
        );
      } catch (erro) {
        if (descartarAcesso(erro)) return;
        aviso.textContent = mensagemFalha(erro);
      } finally {
        finalizar();
        for (const controle of controles) controle.disabled = false;
        if (responde?.tipo === 'relato_familiar') audiencia.disabled = true;
      }
    };
    rascunho.addEventListener('click', () => void enviar('rascunho'));
    form.addEventListener('submit', (evento) => {
      evento.preventDefault();
      void enviar('publicado');
    });
    return form;
  };

  /** FR-012: retificar preserva o histórico e exige justificativa. */
  const formularioRetificacao = (
    registro: RegistroDiario,
    aoConcluir: (aviso: string) => void,
  ): HTMLFormElement => {
    const form = elemento('form');
    form.noValidate = true;
    form.append(
      elemento('h4', 'Retificar registro publicado'),
      elemento(
        'p',
        'A versão publicada continua no histórico. A correção entra como nova versão, com data, autoria e motivo.',
      ),
    );
    const correcao = campo(form, 'Texto corrigido (obrigatório)', elemento('textarea'));
    const motivo = campo(form, 'Motivo da retificação (obrigatório)', elemento('textarea'));
    const aviso = elemento('p');
    aviso.setAttribute('role', 'status');
    const confirmar = elemento('button', 'Registrar retificação');
    confirmar.type = 'submit';
    form.append(aviso, confirmar);
    form.addEventListener('input', () => {
      if (ehFamilia) pendenteFamiliar = true;
      alteracaoPendente(true);
      aviso.textContent = '';
    });
    form.addEventListener('submit', (evento) => {
      evento.preventDefault();
      const texto = correcao.value.trim();
      const justificativa = motivo.value.trim();
      if (!texto || !justificativa) {
        aviso.textContent = 'Informe o texto corrigido e o motivo da retificação.';
        (texto ? motivo : correcao).focus();
        return;
      }
      const conteudo =
        registro.tipo === 'relato_familiar'
          ? ({ ...(registro.conteudo as ConteudoRelatoDiario), descricao: texto } as const)
          : ({ ...(registro.conteudo as ConteudoEvolucaoDiario), atividade: texto } as const);
      confirmar.disabled = true;
      aviso.textContent = 'Registrando retificação…';
      const finalizar = iniciarAcao(confirmar);
      if (ehFamilia) salvandoFamiliar = true;
      void (async () => {
        try {
          await gravar({
            diario_registro_id: registro.diario_registro_id,
            versao_esperada: registro.versao,
            tipo: registro.tipo,
            estado: 'retificado',
            audiencia: registro.audiencia,
            atencao: registro.atencao,
            retorno_solicitado: registro.retorno_solicitado,
            origem_conteudo: registro.origem_conteudo,
            conteudo,
            justificativa,
          });
          if (ehFamilia) pendenteFamiliar = false;
          alteracaoPendente(false);
          aoConcluir('Retificação registrada; a versão anterior continua no histórico.');
        } catch (erro) {
          if (descartarAcesso(erro)) return;
          aviso.textContent = mensagemFalha(erro);
          confirmar.disabled = false;
        } finally {
          finalizar();
          if (ehFamilia) salvandoFamiliar = false;
        }
      })();
    });
    return form;
  };

  const desenhar = (mensagem?: string) => {
    if (!ativa) return;
    // O formulário anterior sai da árvore aqui; o que estava montado nele precisa parar
    // junto, senão uma gravação em curso continuaria viva fora da tela.
    desmontarFormularios();
    const painel = elemento('section');
    painel.append(elemento('h2', 'Diário e evolução'));
    painel.append(
      elemento(
        'p',
        'O diário registra o acompanhamento entre atendimentos. Ele não é canal de emergência e não garante resposta imediata.',
      ),
    );
    if (mensagem) {
      const confirmacao = elemento('p', mensagem);
      confirmacao.setAttribute('role', 'status');
      painel.append(confirmacao);
    }
    if (ehFamilia) {
      formularioFamiliar = formularioRelatoFamiliar((texto) => desenhar(texto));
      painel.append(formularioFamiliar);
    } else {
      painel.append(formularioEvolucao((texto) => desenhar(texto)));
    }
    avisoLeituras = elemento('p');
    avisoLeituras.setAttribute('role', 'status');
    regiaoLeituras = elemento('div');
    painel.append(avisoLeituras, regiaoLeituras);
    raiz.replaceChildren(painel);
    desenharLeituras();
  };

  const trocarEditorFamiliar = (novo: () => HTMLFormElement) => {
    if (salvandoFamiliar || !formularioFamiliar) return;
    if (pendenteFamiliar && !window.confirm('Descartar alterações não salvas do relato atual?'))
      return;
    desmontarFormularios();
    const proximo = novo();
    formularioFamiliar.replaceWith(proximo);
    formularioFamiliar = proximo;
    pendenteFamiliar = false;
    alteracaoPendente(false);
    proximo.querySelector<HTMLElement>('input, textarea')?.focus();
  };

  const desenharLeituras = () => {
    if (!ativa || !regiaoLeituras) return;
    regiaoLeituras.replaceChildren();
    const carregando = estadoLeituras === 'carregando';
    regiaoLeituras.setAttribute('aria-busy', String(carregando));
    if (avisoLeituras) avisoLeituras.textContent = carregando ? 'Carregando o diário…' : '';
    if (ehFamilia && document.visibilityState === 'hidden') {
      if (avisoLeituras) avisoLeituras.textContent = '';
      return;
    }
    if (carregando) regiaoLeituras.append(esqueletoCarregando(3, true));
    if (estadoLeituras !== 'pronto') return;
    if (!registros.length) {
      regiaoLeituras.append(elemento('p', 'Nenhum registro no diário deste paciente ainda.'));
      return;
    }
    const lista = elemento('ul');
    for (const registro of registros) {
      const respostas = registros.filter(
        (outro) => outro.responde_registro_id === registro.diario_registro_id,
      ).length;
      const item = elemento('li');
      const artigo = elemento('article');
      artigo.append(
        elemento(
          'h3',
          registro.tipo === 'relato_familiar' ? 'Relato da família' : 'Evolução profissional',
        ),
      );
      artigo.append(linha('Situação', rotuloEstado[registro.estado]));
      artigo.append(linha('Registrado em', dataLegivel(registro.criado_em)));
      artigo.append(linha('Quem vê', rotuloAudiencia[registro.audiencia]));
      if (registro.origem_conteudo === 'audio_transcrito')
        artigo.append(elemento('p', 'Texto obtido de transcrição de áudio e revisado pelo autor.'));
      if (registro.tipo === 'relato_familiar') {
        const conteudo = registro.conteudo as ConteudoRelatoDiario;
        artigo.append(linha('Aconteceu em', conteudo.dataAcontecimento));
        artigo.append(linha('Descrição', conteudo.descricao));
        if (conteudo.categoria) artigo.append(linha('Categoria', conteudo.categoria));
        if (conteudo.contexto) artigo.append(linha('Contexto', conteudo.contexto));
        if (conteudo.acaoTomada) artigo.append(linha('Ação tomada', conteudo.acaoTomada));
      } else {
        const conteudo = registro.conteudo as ConteudoEvolucaoDiario;
        artigo.append(linha('Área', conteudo.area));
        artigo.append(linha('Data do atendimento', conteudo.data));
        if (conteudo.atividade) artigo.append(linha('Atividade', conteudo.atividade));
        if (conteudo.observacoesCompartilhaveis)
          artigo.append(linha('Observações compartilháveis', conteudo.observacoesCompartilhaveis));
        if (conteudo.progresso) artigo.append(linha('Progresso', conteudo.progresso));
        if (conteudo.orientacao) artigo.append(linha('Orientação', conteudo.orientacao));
        if (conteudo.proximoPasso) artigo.append(linha('Próximo passo', conteudo.proximoPasso));
        if (conteudo.objetivoRelacionado)
          artigo.append(linha('Objetivo relacionado', conteudo.objetivoRelacionado));
      }
      if (registro.justificativa)
        artigo.append(linha('Motivo da retificação', registro.justificativa));
      if (registro.atencao) artigo.append(linha('Atenção', 'Sinalizada por quem registrou.'));
      if (registro.tarefa_id)
        artigo.append(linha('Encaminhamento', 'Convertido em tarefa da equipe.'));
      if (registro.autor_usuario_id === usuarioId) {
        const situacao = elemento('p', situacaoDoRemetente(registro, respostas));
        situacao.setAttribute('role', 'status');
        artigo.append(situacao);
        if (ehFamilia && registro.tipo === 'relato_familiar' && registro.estado === 'rascunho') {
          const retomar = elemento('button', 'Retomar rascunho');
          retomar.type = 'button';
          retomar.addEventListener('click', () => {
            trocarEditorFamiliar(() =>
              formularioRelatoFamiliar((texto) => desenhar(texto), registro),
            );
          });
          artigo.append(retomar);
        } else if (registro.estado !== 'rascunho') {
          const retificar = elemento('button', 'Retificar');
          retificar.type = 'button';
          retificar.addEventListener('click', () => {
            if (ehFamilia)
              trocarEditorFamiliar(() =>
                formularioRetificacao(registro, (texto) => desenhar(texto)),
              );
            else retificar.replaceWith(formularioRetificacao(registro, (texto) => desenhar(texto)));
          });
          artigo.append(retificar);
        }
      } else if (
        !ehFamilia &&
        registro.tipo === 'relato_familiar' &&
        registro.estado !== 'rascunho'
      ) {
        const responder = elemento('button', 'Responder');
        responder.type = 'button';
        responder.addEventListener('click', () => {
          responder.replaceWith(formularioEvolucao((texto) => desenhar(texto), registro));
        });
        artigo.append(responder);
        if (converterEmTarefa) artigo.append(botaoConversao(registro, respostas));
      }
      item.append(artigo);
      lista.append(item);
    }
    regiaoLeituras.append(lista);
  };

  /** FR-014: a sinalização guarda motivo, data e o encaminhamento gerado. A tarefa em si é
   * criada pela fatia de tarefas; aqui entra só o identificador que ela devolve. */
  const botaoConversao = (registro: RegistroDiario, _respostas: number): HTMLElement => {
    const abrir = elemento('button', 'Sinalizar atenção e converter em tarefa');
    abrir.type = 'button';
    abrir.addEventListener('click', () => {
      const form = elemento('form');
      form.noValidate = true;
      form.append(elemento('h4', 'Converter relato em tarefa'));
      const motivo = campo(form, 'Motivo da atenção (obrigatório)', elemento('textarea'));
      const responsavel = campo(form, 'Responsável (obrigatório)', elemento('input'));
      const prazo = campo(form, 'Prazo (obrigatório)', elemento('input'));
      prazo.type = 'date';
      const aviso = elemento('p');
      aviso.setAttribute('role', 'status');
      const confirmar = elemento('button', 'Converter');
      confirmar.type = 'submit';
      form.append(aviso, confirmar);
      form.addEventListener('submit', (evento) => {
        evento.preventDefault();
        const texto = motivo.value.trim();
        if (!texto || !responsavel.value.trim() || !prazo.value) {
          aviso.textContent = 'Informe motivo, responsável e prazo.';
          return;
        }
        confirmar.disabled = true;
        aviso.textContent = 'Registrando atenção…';
        const finalizar = iniciarAcao(confirmar);
        void (async () => {
          try {
            const descricao = `Atenção sinalizada no diário: ${texto}`;
            const tarefaId = await converterEmTarefa?.(pacienteId, {
              descricao,
              responsavel: responsavel.value.trim(),
              prazo: prazo.value,
              prioridade: 'alta',
              estado: 'pendente',
            });
            await gravar({
              versao_esperada: 0,
              tipo: 'evolucao_profissional',
              estado: 'publicado',
              audiencia: 'equipe_e_familia',
              atencao: true,
              retorno_solicitado: false,
              origem_conteudo: 'texto',
              responde_registro_id: registro.diario_registro_id,
              ...(tarefaId ? { tarefa_id: tarefaId } : {}),
              conteudo: {
                data: new Date().toISOString().slice(0, 10),
                area: 'Coordenação do cuidado',
                atividade: descricao,
              },
            });
            desenhar(
              tarefaId
                ? 'Atenção sinalizada e tarefa criada para a equipe.'
                : 'Atenção sinalizada. Abra a aba Tarefas para criar a ação com responsável.',
            );
          } catch (erro) {
            if (descartarAcesso(erro)) return;
            aviso.textContent = mensagemFalha(erro);
            confirmar.disabled = false;
          } finally {
            finalizar();
          }
        })();
      });
      abrir.replaceWith(form);
    });
    return abrir;
  };

  const consultar = async () => {
    const geracao = ++geracaoConsulta;
    const salvos = new Map<string, RegistroDiario>();
    salvosDuranteConsulta = salvos;
    estadoLeituras = 'carregando';
    if (ehFamilia) desenharLeituras();
    try {
      const recebidos = await servico.consultar(pacienteId);
      if (!ativa || geracao !== geracaoConsulta) return;
      registros = [
        ...salvos.values(),
        ...recebidos.filter((r) => !salvos.has(r.diario_registro_id)),
      ];
      salvosDuranteConsulta = undefined;
      estadoLeituras = 'pronto';
      if (ehFamilia) desenharLeituras();
      else desenhar();
    } catch (erro) {
      if (!ativa || geracao !== geracaoConsulta || descartarAcesso(erro)) return;
      salvosDuranteConsulta = undefined;
      estadoLeituras = 'erro';
      if (ehFamilia) {
        desenharLeituras();
        if (avisoLeituras) avisoLeituras.textContent = mensagemFalha(erro);
      } else {
        carregamento.remove();
        status.textContent = mensagemFalha(erro);
      }
    }
  };
  const visibilidadeAlterada = () => {
    if (document.visibilityState === 'hidden') {
      geracaoConsulta++;
      salvosDuranteConsulta = undefined;
      registros = [];
      estadoLeituras = 'carregando';
      desenharLeituras();
    } else {
      void consultar();
    }
  };
  if (ehFamilia) {
    desenhar();
    document.addEventListener('visibilitychange', visibilidadeAlterada);
    if (document.visibilityState !== 'hidden') void consultar();
  } else void consultar();

  return () => {
    ativa = false;
    geracaoConsulta++;
    if (ehFamilia) document.removeEventListener('visibilitychange', visibilidadeAlterada);
    desmontarFormularios();
    alteracaoPendente(false);
    raiz.replaceChildren();
  };
}
