/// <reference types="vite/client" />

import { objetivoSchema, type Objetivo } from '../packages/contracts/src/plano-cuidado';
import { localizarPendencias, validarSecoesAnamnese } from '../packages/cadastro/src/anamnese';
import { validarTarefaPlano } from '../packages/cadastro/src/tarefa-plano';
import { montarRelatoTextual } from './relato-textual';
import type { RelatoTextual } from '../packages/contracts/src/relato-textual';

// Prévia isolada: usa somente o servidor local de feedback.
if (import.meta.env.DEV && window.location.hostname === 'localhost') {
  const elemento = <T extends HTMLElement>(id: string): T => {
    const item = document.getElementById(id);
    if (!item) throw new Error('Elemento da demonstração indisponível.');
    return item as T;
  };
  const login = elemento('login-view');
  const pacientes = elemento('patients-view');
  const telaRelato = elemento('relato-view');
  let desmontarRelato: (() => void) | undefined;
  elemento('open-relato').addEventListener('click', () => {
    desmontarRelato = montarRelatoTextual(elemento('relato-content'));
    login.hidden = true;
    telaRelato.hidden = false;
    elemento('relato-title').focus();
  });
  elemento('relato-back').addEventListener('click', () => {
    const form = elemento('relato-content').querySelector('form');
    if (
      form &&
      formulariosAlterados.has(form) &&
      !window.confirm('Há alterações não guardadas. Deseja descartá-las?')
    )
      return;
    if (form) formulariosAlterados.delete(form);
    desmontarRelato?.();
    desmontarRelato = undefined;
    telaRelato.hidden = true;
    if (selecionado) {
      selecionado = undefined;
      pacientes.hidden = false;
      elemento('patients-title').focus();
    } else {
      login.hidden = false;
      elemento('open-relato').focus();
    }
    elemento('relato-list').replaceChildren();
    elemento('relato-patient').textContent = '';
  });
  const acoes = elemento('session-actions');
  const tabela = elemento('patients-table');
  const corpo = elemento<HTMLTableSectionElement>('patients-body');
  const vazio = elemento('list-empty');
  const formulario = elemento<HTMLFormElement>('create-form');
  const nome = elemento<HTMLInputElement>('patient-name');
  const preferencia = elemento<HTMLInputElement>('preferred-name');
  type Anamnese = { estado: string; valor: string; fonte: string; data: string };
  const anamneses = new Map<string, Anamnese>();
  type Tarefa = {
    descricao: string;
    responsavel: string;
    prazo: string;
    prioridade: string;
    estado: string;
    acaoOuJustificativa: string;
  };
  const tarefas = new Map<string, Tarefa[]>();
  const revisoes = new Map<string, number>();
  const relatos = new Map<string, RelatoTextual[]>();
  const chaveOperacao = (id: string) => `relato-pendente:${id}`;
  const formulariosAlterados = new Set<HTMLFormElement>();
  const telaObjetivos = elemento('goals-view');
  const formularioObjetivo = elemento<HTMLFormElement>('goal-form');
  type ObjetivoLocal = Objetivo & { historico?: { objetivo: Objetivo; motivo: string }[] };
  const objetivos = new Map<string, ObjetivoLocal[]>();
  let objetivoEmRevisao: number | undefined;
  let revisaoDesatualizada = false;
  let salvandoObjetivo = false;
  const telaTarefas = elemento('tasks-view');
  const formularioTarefa = elemento<HTMLFormElement>('task-form');
  const descricaoTarefa = elemento<HTMLInputElement>('task-description');
  const responsavelTarefa = elemento<HTMLInputElement>('task-responsible');
  const prazoTarefa = elemento<HTMLInputElement>('task-deadline');
  const prioridadeTarefa = elemento<HTMLInputElement>('task-priority');
  const estadoTarefa = elemento<HTMLSelectElement>('task-status');
  const acaoTarefa = elemento<HTMLTextAreaElement>('task-action');
  const rotulosEstado: Record<string, string> = {
    pendente: 'Pendente',
    em_andamento: 'Em andamento',
    concluida: 'Concluída',
    cancelada: 'Cancelada',
  };
  let selecionado: string | undefined;
  let anamneseAlterada = false;
  const anamnese = elemento('anamnese-view');
  const estado = elemento<HTMLSelectElement>('anamnese-state');
  const valor = elemento<HTMLTextAreaElement>('anamnese-value');
  const fonte = elemento<HTMLInputElement>('anamnese-source');
  const data = elemento<HTMLInputElement>('anamnese-date');
  type Paciente = { id: string; name: string; preferredName?: string };
  let registros: Paciente[] = [];
  let csrfToken = '';
  let telaInterrompida: HTMLElement | undefined;
  const requisitar = async (caminho: string, opcoes?: RequestInit) => {
    const resposta = await fetch(`/api/local-feedback${caminho}`, opcoes);
    if (resposta.status === 401 && caminho !== '/login') {
      telaInterrompida = [pacientes, anamnese, telaTarefas, telaObjetivos, telaRelato].find(
        (tela) => !tela.hidden,
      );
      pacientes.hidden = true;
      anamnese.hidden = true;
      telaTarefas.hidden = true;
      telaObjetivos.hidden = true;
      telaRelato.hidden = true;
      acoes.hidden = true;
      login.hidden = false;
      csrfToken = '';
      elemento('login-feedback').textContent =
        'Sessão encerrada. Entre novamente para continuar; rascunhos temporários permanecem nesta página até recarregá-la.';
      elemento('login-title').focus();
    }
    if (!resposta.ok) throw new Error(String(resposta.status));
    return resposta;
  };
  const carregar = async () => {
    try {
      const resposta = await requisitar('/patients');
      registros = ((await resposta.json()) as { patients: Paciente[] }).patients;
      atualizar();
      elemento('workspace-feedback').textContent = '';
    } catch {
      elemento('workspace-feedback').textContent =
        'Não foi possível carregar os cadastros. Confira a conexão e tente atualizar.';
    }
  };
  const bloquearFormulario = (form: HTMLFormElement, bloqueado: boolean) => {
    for (const controle of form.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement
    >('input, select, textarea, button'))
      controle.disabled = bloqueado;
  };
  const bloquearTelaTarefas = () => {
    const controles = [
      ...telaTarefas.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement
      >('input, select, textarea, button'),
    ];
    const estados = controles.map((controle) => controle.disabled);
    for (const controle of controles) controle.disabled = true;
    return () =>
      controles.forEach((controle, indice) => {
        controle.disabled = estados[indice] ?? false;
      });
  };
  const carregarPrevia = async (id: string) => {
    const resposta = await requisitar(`/patients/${id}/preview`);
    const previa = (await resposta.json()) as {
      revision: number;
      anamnese: Anamnese | null;
      tarefas: Tarefa[];
      objetivos?: ObjetivoLocal[];
      relatos?: RelatoTextual[];
    };
    revisoes.set(id, previa.revision);
    if (previa.anamnese) anamneses.set(id, previa.anamnese);
    else anamneses.delete(id);
    tarefas.set(id, previa.tarefas);
    objetivos.set(id, previa.objetivos ?? []);
    relatos.set(id, previa.relatos ?? []);
  };
  const salvarPrevia = async (
    id: string,
    type: 'anamnese' | 'tarefas' | 'objetivos' | 'relatos',
    value: Anamnese | Tarefa[] | ObjetivoLocal[] | RelatoTextual[],
  ) => {
    const resposta = await requisitar(`/patients/${id}/preview`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ type, value, revision: revisoes.get(id) }),
    });
    const previa = (await resposta.json()) as { revision: number };
    revisoes.set(id, previa.revision);
  };
  const atualizar = () => {
    corpo.replaceChildren();
    for (const registro of registros) {
      const linha = corpo.insertRow();
      linha.insertCell().textContent = registro.name;
      linha.insertCell().textContent = registro.preferredName || '—';
      const abrir = document.createElement('button');
      abrir.type = 'button';
      abrir.className = 'button-secondary';
      abrir.textContent = 'Abrir anamnese';
      abrir.setAttribute('aria-label', `Abrir anamnese de ${registro.name}`);
      abrir.addEventListener('click', async () => {
        try {
          await carregarPrevia(registro.id);
        } catch {
          elemento('workspace-feedback').textContent =
            'Não foi possível carregar a prévia. Tente novamente.';
          return;
        }
        selecionado = registro.id;
        anamneseAlterada = false;
        const salvo = anamneses.get(registro.id);
        estado.value = salvo?.estado ?? 'pendente';
        valor.value = salvo?.valor ?? '';
        fonte.value = salvo?.fonte ?? '';
        data.value = salvo?.data ?? '';
        elemento('anamnese-patient').textContent = registro.name;
        elemento('anamnese-feedback').textContent = '';
        atualizarProgresso();
        pacientes.hidden = true;
        anamnese.hidden = false;
        elemento('anamnese-title').focus();
      });
      const abrirTarefas = document.createElement('button');
      abrirTarefas.type = 'button';
      abrirTarefas.className = 'button-secondary';
      abrirTarefas.textContent = 'Abrir tarefas';
      abrirTarefas.setAttribute('aria-label', `Abrir tarefas de ${registro.name}`);
      abrirTarefas.addEventListener('click', async () => {
        try {
          await carregarPrevia(registro.id);
        } catch {
          elemento('workspace-feedback').textContent =
            'Não foi possível carregar a prévia. Tente novamente.';
          return;
        }
        selecionado = registro.id;
        formularioTarefa.reset();
        elemento('task-feedback').textContent = '';
        elemento('tasks-patient').textContent = registro.name;
        atualizarTarefas();
        pacientes.hidden = true;
        telaTarefas.hidden = false;
        elemento('tasks-title').focus();
      });
      const abrirObjetivos = document.createElement('button');
      abrirObjetivos.type = 'button';
      abrirObjetivos.className = 'button-secondary';
      abrirObjetivos.textContent = 'Abrir plano';
      abrirObjetivos.setAttribute('aria-label', `Abrir plano de ${registro.name}`);
      abrirObjetivos.addEventListener('click', async () => {
        try {
          await carregarPrevia(registro.id);
        } catch {
          elemento('workspace-feedback').textContent =
            'Não foi possível carregar a prévia. Tente novamente.';
          return;
        }
        selecionado = registro.id;
        formularioObjetivo.reset();
        objetivoEmRevisao = undefined;
        revisaoDesatualizada = false;
        elemento('goal-reason-field').hidden = true;
        elemento('goal-form-title').textContent = 'Cadastrar objetivo';
        elemento('goal-feedback').textContent = '';
        elemento('goals-patient').textContent = registro.name;
        atualizarObjetivos();
        pacientes.hidden = true;
        telaObjetivos.hidden = false;
        elemento('goals-title').focus();
      });
      const abrirRelato = document.createElement('button');
      abrirRelato.type = 'button';
      abrirRelato.className = 'button-secondary';
      abrirRelato.textContent = 'Abrir relatos';
      abrirRelato.setAttribute('aria-label', `Abrir relatos de ${registro.name}`);
      abrirRelato.addEventListener('click', async () => {
        try {
          if (!navigator.locks) throw new Error('locks indisponíveis');
          await navigator.locks.request(chaveOperacao(registro.id), async () => {
            await carregarPrevia(registro.id);
            const pendente = localStorage.getItem(chaveOperacao(registro.id));
            if (pendente) {
              const resposta = await requisitar(`/patients/${registro.id}/preview`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                body: JSON.stringify({ operationId: pendente }),
              });
              const resultado = (await resposta.json()) as {
                revision: number;
                relatos?: RelatoTextual[];
                operacoesRelato?: string[];
                operacoesRelatoCanceladas?: string[];
              };
              if (
                !resultado.operacoesRelato?.includes(pendente) &&
                !resultado.operacoesRelatoCanceladas?.includes(pendente)
              )
                throw new Error('reconciliação inconclusiva');
              revisoes.set(registro.id, resultado.revision);
              relatos.set(registro.id, resultado.relatos ?? []);
              localStorage.removeItem(chaveOperacao(registro.id));
            }
          });
        } catch {
          elemento('workspace-feedback').textContent =
            'Não foi possível carregar a prévia com segurança. Tente novamente.';
          return;
        }
        selecionado = registro.id;
        const lista = elemento('relato-list');
        const atualizarRelatos = () => {
          lista.replaceChildren();
          for (const relato of relatos.get(registro.id) ?? []) {
            const item = document.createElement('li');
            item.textContent = `${relato.dataAcontecimento}: ${relato.descricao} · Categoria: ${relato.categoria || 'Não informada'} · Contexto: ${relato.contexto || 'Não informado'} · Ação: ${relato.acaoTomada || 'Não informada'} · Solicitação de retorno: ${relato.solicitacaoRetorno ? 'Sim' : 'Não'}`;
            lista.append(item);
          }
        };
        atualizarRelatos();
        desmontarRelato = montarRelatoTextual(
          elemento('relato-content'),
          async (relato) => {
            const voltar = elemento<HTMLButtonElement>('relato-back');
            voltar.disabled = true;
            try {
              await navigator.locks.request(chaveOperacao(registro.id), async () => {
                const chave = chaveOperacao(registro.id);
                if (localStorage.getItem(chave)) throw new Error('pendente');
                const operacao = crypto.randomUUID();
                localStorage.setItem(chave, operacao);
                try {
                  const resposta = await requisitar(`/patients/${registro.id}/preview`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                    body: JSON.stringify({
                      type: 'relatos',
                      value: [relato],
                      revision: revisoes.get(registro.id),
                      operationId: operacao,
                    }),
                  });
                  const previa = (await resposta.json()) as {
                    revision: number;
                    relatos: RelatoTextual[];
                  };
                  revisoes.set(registro.id, previa.revision);
                  relatos.set(registro.id, previa.relatos);
                  localStorage.removeItem(chave);
                  atualizarRelatos();
                  const form = elemento('relato-content').querySelector('form');
                  if (form) formulariosAlterados.delete(form);
                } catch (erro) {
                  if (
                    erro instanceof Error &&
                    ['400', '401', '403', '404', '409'].includes(erro.message)
                  )
                    localStorage.removeItem(chave);
                  throw erro;
                }
              });
            } finally {
              voltar.disabled = false;
            }
          },
          Boolean(localStorage.getItem(chaveOperacao(registro.id))),
        );
        const formRelato = elemento('relato-content').querySelector('form');
        formRelato?.addEventListener('input', () => formulariosAlterados.add(formRelato));
        elemento('relato-patient').textContent = registro.name;
        pacientes.hidden = true;
        telaRelato.hidden = false;
        elemento('relato-title').focus();
      });
      linha
        .insertCell()
        .append(
          abrir,
          document.createTextNode(' '),
          abrirTarefas,
          document.createTextNode(' '),
          abrirObjetivos,
          document.createTextNode(' '),
          abrirRelato,
        );
    }
    tabela.hidden = registros.length === 0;
    vazio.hidden = registros.length !== 0;
    elemento('list-status').textContent = `${registros.length} pacientes fictícios nesta lista.`;
  };
  const atualizarObjetivos = () => {
    const lista = elemento('goals-list');
    lista.replaceChildren();
    const itens = selecionado ? (objetivos.get(selecionado) ?? []) : [];
    elemento('goals-empty').hidden = itens.length > 0;
    for (const [indice, objetivo] of itens.entries()) {
      const item = document.createElement('li');
      const titulo = document.createElement('h3');
      titulo.textContent = objetivo.descricao;
      item.append(titulo);
      for (const texto of [
        `Área: ${objetivo.area}`,
        `Responsável: ${objetivo.responsavel}`,
        `Situação inicial: ${objetivo.situacaoInicial}`,
        `Como observar o progresso: ${objetivo.observacaoProgresso}`,
        `Revisão: ${objetivo.dataRevisao}`,
        `Estado: ${objetivo.estado}`,
      ]) {
        const detalhe = document.createElement('p');
        detalhe.textContent = texto;
        item.append(detalhe);
      }
      if (objetivo.historico?.length) {
        const historico = document.createElement('details');
        const resumo = document.createElement('summary');
        resumo.textContent = 'Histórico de revisões';
        historico.append(resumo);
        for (const [versao, anterior] of objetivo.historico.entries()) {
          const registro = document.createElement('p');
          registro.textContent = `Versão ${versao + 1}: ${anterior.objetivo.descricao} | Área: ${anterior.objetivo.area} | Responsável: ${anterior.objetivo.responsavel} | Situação inicial: ${anterior.objetivo.situacaoInicial} | Progresso: ${anterior.objetivo.observacaoProgresso} | Revisão: ${anterior.objetivo.dataRevisao} | Estado: ${anterior.objetivo.estado} | Motivo da alteração: ${anterior.motivo}`;
          historico.append(registro);
        }
        item.append(historico);
      }
      const revisar = document.createElement('button');
      revisar.type = 'button';
      revisar.disabled = salvandoObjetivo;
      revisar.textContent = 'Revisar objetivo';
      revisar.setAttribute('aria-label', `Revisar objetivo ${objetivo.descricao}`);
      revisar.addEventListener('click', () => {
        if (salvandoObjetivo) return;
        if (formulariosAlterados.has(formularioObjetivo) && !podeDescartar()) return;
        objetivoEmRevisao = indice;
        revisaoDesatualizada = false;
        const campos: Record<string, keyof Objetivo> = {
          'goal-description': 'descricao',
          'goal-area': 'area',
          'goal-responsible': 'responsavel',
          'goal-initial': 'situacaoInicial',
          'goal-progress': 'observacaoProgresso',
          'goal-date': 'dataRevisao',
          'goal-status': 'estado',
        };
        for (const [id, chave] of Object.entries(campos))
          elemento<HTMLInputElement>(id).value = objetivo[chave];
        elemento<HTMLInputElement>('goal-reason').value = '';
        elemento('goal-reason-field').hidden = false;
        elemento('goal-form-title').textContent = 'Revisar objetivo';
        formulariosAlterados.delete(formularioObjetivo);
        elemento<HTMLInputElement>('goal-description').focus();
      });
      item.append(revisar);
      lista.append(item);
    }
  };
  elemento('goals-back').addEventListener('click', () => {
    if (!podeDescartar()) return;
    formulariosAlterados.delete(formularioObjetivo);
    telaObjetivos.hidden = true;
    pacientes.hidden = false;
    elemento('patients-title').focus();
  });
  formularioObjetivo.addEventListener('input', () => formulariosAlterados.add(formularioObjetivo));
  formularioObjetivo.addEventListener('change', () => formulariosAlterados.add(formularioObjetivo));
  formularioObjetivo.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!selecionado || salvandoObjetivo) return;
    const campo = (id: string) => elemento<HTMLInputElement>(id).value;
    const resultado = objetivoSchema.safeParse({
      descricao: campo('goal-description'),
      area: campo('goal-area'),
      responsavel: campo('goal-responsible'),
      situacaoInicial: campo('goal-initial'),
      observacaoProgresso: campo('goal-progress'),
      dataRevisao: campo('goal-date'),
      estado: campo('goal-status'),
    });
    if (!resultado.success) {
      elemento('goal-feedback').textContent = 'Confira todos os campos e a data de revisão.';
      return;
    }
    const pacienteId = selecionado;
    if (revisaoDesatualizada) {
      elemento('goal-feedback').textContent =
        'Confira a lista e selecione novamente o objetivo antes de revisar.';
      return;
    }
    const anteriores = objetivos.get(pacienteId) ?? [];
    const motivo = campo('goal-reason').trim();
    if (objetivoEmRevisao !== undefined && !motivo) {
      elemento('goal-feedback').textContent = 'Informe o motivo da revisão.';
      return;
    }
    const itens = [...anteriores];
    if (objetivoEmRevisao === undefined) itens.push(resultado.data);
    else {
      const anterior = itens[objetivoEmRevisao];
      if (!anterior) return;
      const { historico = [], ...objetivoAnterior } = anterior;
      itens[objetivoEmRevisao] = {
        ...resultado.data,
        historico: [...historico, { objetivo: objetivoAnterior, motivo }],
      };
    }
    salvandoObjetivo = true;
    for (const botao of elemento('goals-list').querySelectorAll('button')) botao.disabled = true;
    bloquearFormulario(formularioObjetivo, true);
    elemento<HTMLButtonElement>('goals-back').disabled = true;
    try {
      await salvarPrevia(pacienteId, 'objetivos', itens);
      objetivos.set(pacienteId, itens);
      formularioObjetivo.reset();
      objetivoEmRevisao = undefined;
      revisaoDesatualizada = false;
      elemento('goal-reason-field').hidden = true;
      elemento('goal-form-title').textContent = 'Cadastrar objetivo';
      formulariosAlterados.delete(formularioObjetivo);
      atualizarObjetivos();
      elemento('goal-feedback').textContent = 'Objetivo fictício salvo nesta demonstração local.';
    } catch (erro) {
      if (erro instanceof Error && erro.message === '409') {
        try {
          await carregarPrevia(pacienteId);
          if (objetivoEmRevisao !== undefined) revisaoDesatualizada = true;
          atualizarObjetivos();
          elemento('goal-feedback').textContent =
            'A prévia foi alterada. Lista atualizada; confira se o objetivo já aparece antes de tentar novamente para evitar duplicação. Seu rascunho permanece no formulário.';
        } catch {
          elemento('goal-feedback').textContent =
            'Não foi possível atualizar a prévia. Seu rascunho permanece nesta página; confira a conexão e tente novamente.';
        }
      } else {
        try {
          await carregarPrevia(pacienteId);
          if (objetivoEmRevisao !== undefined) revisaoDesatualizada = true;
          atualizarObjetivos();
          elemento('goal-feedback').textContent =
            'Não foi possível confirmar o salvamento. Confira a lista atualizada antes de tentar novamente para evitar duplicar o objetivo. Seu rascunho permanece no formulário.';
        } catch {
          elemento('goal-feedback').textContent =
            'Não foi possível confirmar o salvamento nem atualizar a lista. Seu rascunho permanece nesta página; confira a lista antes de tentar novamente para evitar duplicar o objetivo.';
        }
      }
    } finally {
      salvandoObjetivo = false;
      for (const botao of elemento('goals-list').querySelectorAll('button')) botao.disabled = false;
      bloquearFormulario(formularioObjetivo, false);
      elemento<HTMLButtonElement>('goals-back').disabled = false;
    }
  });
  const atualizarTarefas = () => {
    const lista = elemento('tasks-list');
    lista.replaceChildren();
    const itens = selecionado ? (tarefas.get(selecionado) ?? []) : [];
    elemento('tasks-empty').hidden = itens.length > 0;
    for (const tarefa of itens) {
      const item = document.createElement('li');
      const titulo = document.createElement('h3');
      titulo.textContent = tarefa.descricao;
      const detalhes = document.createElement('p');
      detalhes.textContent = `Responsável: ${tarefa.responsavel} · Prazo: ${tarefa.prazo} · Prioridade: ${tarefa.prioridade} · Estado: ${rotulosEstado[tarefa.estado]}`;
      const acao = document.createElement('p');
      acao.textContent = tarefa.acaoOuJustificativa
        ? `Ação ou justificativa: ${tarefa.acaoOuJustificativa}`
        : '';
      const form = document.createElement('form');
      const rotuloEstado = document.createElement('label');
      rotuloEstado.textContent = 'Alterar estado';
      const estado = document.createElement('select');
      for (const [valor, rotulo] of Object.entries(rotulosEstado))
        estado.add(new Option(rotulo, valor));
      estado.value = tarefa.estado;
      rotuloEstado.append(estado);
      const rotuloAcao = document.createElement('label');
      rotuloAcao.textContent = 'Ação realizada ou justificativa';
      const campoAcao = document.createElement('textarea');
      campoAcao.value = tarefa.acaoOuJustificativa;
      rotuloAcao.append(campoAcao);
      const botao = document.createElement('button');
      botao.type = 'submit';
      botao.className = 'button-secondary';
      botao.textContent = 'Atualizar tarefa';
      const feedback = document.createElement('p');
      feedback.setAttribute('role', 'status');
      form.append(rotuloEstado, rotuloAcao, botao, feedback);
      form.addEventListener('input', () => formulariosAlterados.add(form));
      form.addEventListener('change', () => formulariosAlterados.add(form));
      form.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        const resultado = validarTarefaPlano({
          ...tarefa,
          estado: estado.value,
          acaoRealizada: campoAcao.value.trim() || undefined,
        });
        if (!resultado.valido) {
          feedback.textContent = 'Informe a ação realizada ou justificativa para concluir.';
          campoAcao.focus();
          return;
        }
        if (!selecionado) return;
        const pacienteId = selecionado;
        const atualizada = {
          ...tarefa,
          estado: estado.value,
          acaoOuJustificativa: campoAcao.value.trim(),
        };
        const atualizadas = (tarefas.get(pacienteId) ?? []).map((item) =>
          item === tarefa ? atualizada : item,
        );
        const liberarTela = bloquearTelaTarefas();
        try {
          await salvarPrevia(pacienteId, 'tarefas', atualizadas);
          tarefa.estado = atualizada.estado;
          tarefa.acaoOuJustificativa = atualizada.acaoOuJustificativa;
          tarefas.set(
            pacienteId,
            atualizadas.map((item) => (item === atualizada ? tarefa : item)),
          );
          if (selecionado !== pacienteId || telaTarefas.hidden) return;
        } catch {
          feedback.textContent =
            'Não foi possível salvar. Confira a conexão ou reabra a prévia se houve alteração em outra aba.';
          return;
        } finally {
          liberarTela();
        }
        detalhes.textContent = `Responsável: ${tarefa.responsavel} · Prazo: ${tarefa.prazo} · Prioridade: ${tarefa.prioridade} · Estado: ${rotulosEstado[tarefa.estado]}`;
        acao.textContent = tarefa.acaoOuJustificativa
          ? `Ação ou justificativa: ${tarefa.acaoOuJustificativa}`
          : '';
        formulariosAlterados.delete(form);
        feedback.textContent = 'Tarefa fictícia salva nesta demonstração local.';
      });
      item.append(titulo, detalhes, acao, form);
      lista.append(item);
    }
  };
  elemento('tasks-back').addEventListener('click', () => {
    if (!podeDescartar()) return;
    formulariosAlterados.clear();
    telaTarefas.hidden = true;
    pacientes.hidden = false;
    elemento('patients-title').focus();
  });
  formularioTarefa.addEventListener('input', () => formulariosAlterados.add(formularioTarefa));
  formularioTarefa.addEventListener('change', () => formulariosAlterados.add(formularioTarefa));
  formularioTarefa.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!selecionado) return;
    const tarefa: Tarefa = {
      descricao: descricaoTarefa.value.trim(),
      responsavel: responsavelTarefa.value.trim(),
      prazo: prazoTarefa.value,
      prioridade: prioridadeTarefa.value.trim(),
      estado: estadoTarefa.value,
      acaoOuJustificativa: acaoTarefa.value.trim(),
    };
    const resultado = validarTarefaPlano({
      ...tarefa,
      acaoRealizada: tarefa.acaoOuJustificativa || undefined,
    });
    if (!tarefa.descricao || !resultado.valido) {
      elemento('task-feedback').textContent =
        'Preencha tarefa, responsável, prazo e prioridade. Para concluir, informe ação ou justificativa.';
      return;
    }
    if (
      [...formulariosAlterados].some((form) => form !== formularioTarefa) &&
      !window.confirm('Há alterações não guardadas em outras tarefas. Deseja descartá-las?')
    )
      return;
    const pacienteId = selecionado;
    const itens = [...(tarefas.get(pacienteId) ?? []), tarefa];
    const liberarTela = bloquearTelaTarefas();
    try {
      await salvarPrevia(pacienteId, 'tarefas', itens);
      tarefas.set(pacienteId, itens);
      if (selecionado !== pacienteId || telaTarefas.hidden) return;
    } catch {
      elemento('task-feedback').textContent =
        'Não foi possível salvar. Confira a conexão ou reabra a prévia se houve alteração em outra aba.';
      return;
    } finally {
      liberarTela();
    }
    formulariosAlterados.clear();
    formularioTarefa.reset();
    atualizarTarefas();
    elemento('task-feedback').textContent = 'Tarefa fictícia salva nesta demonstração local.';
  });
  const secoesDaTela = () =>
    validarSecoesAnamnese([
      {
        id: 'exemplo',
        camposEsperados: ['exemplo'],
        respostas: [
          {
            campo: 'exemplo',
            estado: estado.value,
            valor: valor.value,
            fonte: fonte.value,
            data: data.value,
          },
        ],
      },
    ]);
  const atualizarProgresso = () => {
    const incompleta = localizarPendencias(secoesDaTela()).length > 0;
    elemento('anamnese-progress').textContent = incompleta
      ? 'Seção incompleta: há informação pendente.'
      : 'Seção sem pendências nesta prévia.';
  };
  const podeDescartar = () =>
    (!anamneseAlterada && formulariosAlterados.size === 0) ||
    window.confirm('Há alterações não guardadas. Deseja descartá-las?');
  const formularioAnamnese = elemento<HTMLFormElement>('anamnese-form');
  formularioAnamnese.addEventListener('input', () => {
    anamneseAlterada = true;
    elemento('anamnese-feedback').textContent = 'Há alterações não guardadas nesta prévia.';
  });
  elemento('back-patients').addEventListener('click', () => {
    if (!podeDescartar()) return;
    anamneseAlterada = false;
    anamnese.hidden = true;
    pacientes.hidden = false;
    elemento('patients-title').focus();
  });
  formularioAnamnese.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!selecionado) return;
    if (estado.value !== 'pendente' && (!fonte.value.trim() || !data.value)) {
      elemento('anamnese-feedback').textContent = 'Informe fonte e data para este estado.';
      fonte.focus();
      return;
    }
    if (estado.value === 'informado' && !valor.value.trim()) {
      elemento('anamnese-feedback').textContent = 'Informe a informação fictícia.';
      valor.focus();
      return;
    }
    try {
      secoesDaTela();
    } catch {
      elemento('anamnese-feedback').textContent =
        'Confira o estado, a informação, a fonte e a data.';
      return;
    }
    const pacienteId = selecionado;
    const dados = {
      estado: estado.value,
      valor: valor.value,
      fonte: fonte.value,
      data: data.value,
    };
    bloquearFormulario(formularioAnamnese, true);
    try {
      await salvarPrevia(pacienteId, 'anamnese', dados);
      anamneses.set(pacienteId, dados);
      if (selecionado !== pacienteId || anamnese.hidden) return;
    } catch {
      elemento('anamnese-feedback').textContent =
        'Não foi possível salvar. Confira a conexão ou reabra a prévia se houve alteração em outra aba.';
      return;
    } finally {
      bloquearFormulario(formularioAnamnese, false);
    }
    anamneseAlterada = false;
    atualizarProgresso();
    elemento('anamnese-feedback').textContent = 'Anamnese fictícia salva nesta demonstração local.';
  });
  const abrirSessao = async () => {
    login.hidden = true;
    pacientes.hidden = false;
    acoes.hidden = false;
    elemento('session-role').textContent = 'Demonstração local';
    elemento('scope-description').textContent =
      'Cadastros fictícios disponíveis nesta demonstração.';
    elemento('new-patient-link').hidden = false;
    elemento('cadastro').hidden = false;
    await carregar();
    if (!login.hidden) return;
    if (telaInterrompida && telaInterrompida !== pacientes) {
      pacientes.hidden = true;
      telaInterrompida.hidden = false;
      telaInterrompida = undefined;
    } else {
      telaInterrompida = undefined;
      elemento('patients-title').focus();
    }
  };
  const loginForm = elemento<HTMLFormElement>('demo-login-form');
  const senha = elemento<HTMLInputElement>('demo-password');
  loginForm.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const botao = elemento<HTMLButtonElement>('demo-login');
    botao.disabled = true;
    elemento('login-feedback').textContent = 'Entrando…';
    try {
      const resposta = await requisitar('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: senha.value }),
      });
      csrfToken = ((await resposta.json()) as { csrfToken: string }).csrfToken;
      senha.value = '';
      elemento('login-feedback').textContent = '';
      await abrirSessao();
    } catch {
      elemento('login-feedback').textContent =
        'Não foi possível entrar. Confira a senha e a conexão local. Rascunhos temporários permanecem nesta página até recarregá-la.';
    } finally {
      botao.disabled = false;
    }
  });
  elemento('logout').addEventListener('click', async () => {
    if (!podeDescartar()) return;
    try {
      await requisitar('/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: '{}',
      });
      window.location.reload();
    } catch {
      elemento('workspace-feedback').textContent =
        'Não foi possível sair. Confira a conexão e tente novamente.';
    }
  });
  elemento('reload-patients').addEventListener('click', carregar);
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const nomeLimpo = nome.value.trim();
    if (!nomeLimpo) {
      elemento('create-feedback').textContent = 'Informe o nome fictício.';
      nome.focus();
      return;
    }
    const botao = elemento<HTMLButtonElement>('create-submit');
    botao.disabled = true;
    elemento('create-feedback').textContent = 'Salvando cadastro…';
    try {
      const resposta = await requisitar('/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({
          name: nomeLimpo,
          preferredName: preferencia.value.trim() || undefined,
        }),
      });
      const { patient } = (await resposta.json()) as { patient: Paciente };
      registros.push(patient);
      formulario.reset();
      atualizar();
      elemento('create-feedback').textContent = 'Cadastro fictício salvo nesta demonstração local.';
    } catch {
      elemento('create-feedback').textContent =
        'Não foi possível salvar. Confira a conexão e tente novamente.';
    } finally {
      botao.disabled = false;
    }
  });
  requisitar('/session')
    .then(async (resposta) => {
      const sessao = (await resposta.json()) as { authenticated: boolean; csrfToken?: string };
      if (sessao.authenticated && sessao.csrfToken) {
        csrfToken = sessao.csrfToken;
        await abrirSessao();
      }
    })
    .catch(() => {
      elemento('login-feedback').textContent =
        'Servidor local indisponível. Inicie a demonstração e recarregue a página.';
    });
  document.body.hidden = false;
}
