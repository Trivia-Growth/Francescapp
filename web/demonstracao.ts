/// <reference types="vite/client" />

import { localizarPendencias, validarSecoesAnamnese } from '../packages/cadastro/src/anamnese';
import { validarTarefaPlano } from '../packages/cadastro/src/tarefa-plano';

// Esta página não autentica e nunca chama serviços ou grava dados.
if (import.meta.env.DEV && window.location.hostname === 'localhost') {
  const elemento = <T extends HTMLElement>(id: string): T => {
    const item = document.getElementById(id);
    if (!item) throw new Error('Elemento da demonstração indisponível.');
    return item as T;
  };
  const login = elemento('login-view');
  const pacientes = elemento('patients-view');
  const acoes = elemento('session-actions');
  const tabela = elemento('patients-table');
  const corpo = elemento<HTMLTableSectionElement>('patients-body');
  const vazio = elemento('list-empty');
  const formulario = elemento<HTMLFormElement>('create-form');
  const nome = elemento<HTMLInputElement>('patient-name');
  const preferencia = elemento<HTMLInputElement>('preferred-name');
  type Anamnese = { estado: string; valor: string; fonte: string; data: string };
  const anamneses = new Map<object, Anamnese>();
  type Tarefa = {
    descricao: string;
    responsavel: string;
    prazo: string;
    prioridade: string;
    estado: string;
    acaoOuJustificativa: string;
  };
  const tarefas = new Map<object, Tarefa[]>();
  const formulariosAlterados = new Set<HTMLFormElement>();
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
  let selecionado: object | undefined;
  let anamneseAlterada = false;
  const anamnese = elemento('anamnese-view');
  const estado = elemento<HTMLSelectElement>('anamnese-state');
  const valor = elemento<HTMLTextAreaElement>('anamnese-value');
  const fonte = elemento<HTMLInputElement>('anamnese-source');
  const data = elemento<HTMLInputElement>('anamnese-date');
  const registros = [
    { nome: 'Paciente Exemplo Um', preferencia: 'Exemplo Um' },
    { nome: 'Paciente Exemplo Dois', preferencia: '' },
  ];
  const atualizar = () => {
    corpo.replaceChildren();
    for (const registro of registros) {
      const linha = corpo.insertRow();
      linha.insertCell().textContent = registro.nome;
      linha.insertCell().textContent = registro.preferencia || '—';
      const abrir = document.createElement('button');
      abrir.type = 'button';
      abrir.className = 'button-secondary';
      abrir.textContent = 'Abrir anamnese';
      abrir.setAttribute('aria-label', `Abrir anamnese de ${registro.nome}`);
      abrir.addEventListener('click', () => {
        selecionado = registro;
        anamneseAlterada = false;
        const salvo = anamneses.get(registro);
        estado.value = salvo?.estado ?? 'pendente';
        valor.value = salvo?.valor ?? '';
        fonte.value = salvo?.fonte ?? '';
        data.value = salvo?.data ?? '';
        elemento('anamnese-patient').textContent = registro.nome;
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
      abrirTarefas.setAttribute('aria-label', `Abrir tarefas de ${registro.nome}`);
      abrirTarefas.addEventListener('click', () => {
        selecionado = registro;
        formularioTarefa.reset();
        elemento('task-feedback').textContent = '';
        elemento('tasks-patient').textContent = registro.nome;
        atualizarTarefas();
        pacientes.hidden = true;
        telaTarefas.hidden = false;
        elemento('tasks-title').focus();
      });
      linha.insertCell().append(abrir, document.createTextNode(' '), abrirTarefas);
    }
    tabela.hidden = registros.length === 0;
    vazio.hidden = registros.length !== 0;
    elemento('list-status').textContent = `${registros.length} pacientes fictícios nesta lista.`;
  };
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
      form.addEventListener('submit', (evento) => {
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
        tarefa.estado = estado.value;
        tarefa.acaoOuJustificativa = campoAcao.value.trim();
        detalhes.textContent = `Responsável: ${tarefa.responsavel} · Prazo: ${tarefa.prazo} · Prioridade: ${tarefa.prioridade} · Estado: ${rotulosEstado[tarefa.estado]}`;
        acao.textContent = tarefa.acaoOuJustificativa
          ? `Ação ou justificativa: ${tarefa.acaoOuJustificativa}`
          : '';
        formulariosAlterados.delete(form);
        feedback.textContent = 'Tarefa atualizada somente nesta prévia.';
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
  formularioTarefa.addEventListener('submit', (evento) => {
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
    formulariosAlterados.clear();
    const itens = tarefas.get(selecionado) ?? [];
    itens.push(tarefa);
    tarefas.set(selecionado, itens);
    formularioTarefa.reset();
    atualizarTarefas();
    elemento('task-feedback').textContent = 'Tarefa guardada somente nesta prévia.';
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
  formularioAnamnese.addEventListener('submit', (evento) => {
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
    anamneses.set(selecionado, {
      estado: estado.value,
      valor: valor.value,
      fonte: fonte.value,
      data: data.value,
    });
    anamneseAlterada = false;
    atualizarProgresso();
    elemento('anamnese-feedback').textContent = 'Alterações guardadas somente nesta prévia.';
  });
  elemento('demo-login').addEventListener('click', () => {
    login.hidden = true;
    pacientes.hidden = false;
    acoes.hidden = false;
    elemento('session-role').textContent = 'Demonstração local';
    elemento('scope-description').textContent =
      'Cadastros fictícios disponíveis nesta demonstração.';
    elemento('new-patient-link').hidden = false;
    elemento('cadastro').hidden = false;
    atualizar();
    elemento('patients-title').focus();
  });
  elemento('logout').addEventListener('click', () => {
    if (!podeDescartar()) return;
    // Recarregar descarta todos os dados criados durante a demonstração.
    window.location.reload();
  });
  elemento('reload-patients').addEventListener('click', atualizar);
  formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const nomeLimpo = nome.value.trim();
    if (!nomeLimpo) {
      elemento('create-feedback').textContent = 'Informe o nome fictício.';
      nome.focus();
      return;
    }
    registros.push({ nome: nomeLimpo, preferencia: preferencia.value.trim() });
    formulario.reset();
    atualizar();
    elemento('create-feedback').textContent = 'Cadastro fictício adicionado somente nesta página.';
  });
  document.body.hidden = false;
}
