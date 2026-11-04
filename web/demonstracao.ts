/// <reference types="vite/client" />

import { localizarPendencias, validarSecoesAnamnese } from '../packages/cadastro/src/anamnese';
import { validarTarefaPlano } from '../packages/cadastro/src/tarefa-plano';

// Prévia isolada: usa somente o servidor local de feedback.
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
      telaInterrompida = [pacientes, anamnese, telaTarefas].find((tela) => !tela.hidden);
      pacientes.hidden = true;
      anamnese.hidden = true;
      telaTarefas.hidden = true;
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
    };
    revisoes.set(id, previa.revision);
    if (previa.anamnese) anamneses.set(id, previa.anamnese);
    else anamneses.delete(id);
    tarefas.set(id, previa.tarefas);
  };
  const salvarPrevia = async (
    id: string,
    type: 'anamnese' | 'tarefas',
    value: Anamnese | Tarefa[],
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
