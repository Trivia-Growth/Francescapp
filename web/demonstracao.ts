/// <reference types="vite/client" />

import { montarBuscaPacientesLocal, correspondeBuscaPacienteLocal } from './busca-pacientes-local';

import { objetivoSchema, type Objetivo } from '../packages/contracts/src/plano-cuidado';
import { validarTarefaPlano } from '../packages/cadastro/src/tarefa-plano';
import { montarRelatoTextual } from './relato-textual';
import { montarResumoCasoLocal } from './resumo-caso-local';
import { montarDocumentosLocais, type DocumentoLocal } from './documentos-locais';
import {
  montarPainelPendenciasLocal,
  type DadosPainelPendenciasLocal,
} from './painel-pendencias-local';
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
    elemento('relato-back').textContent = 'Voltar ao acesso';
    desmontarRelato = montarRelatoTextual(elemento('relato-content'));
    const form = elemento('relato-content').querySelector('form');
    form?.addEventListener('input', () => formulariosAlterados.add(form));
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
  type RespostaLocal = {
    secao: string;
    campo: string;
    estado: string;
    valor: string;
    fonte: string;
    data: string;
  };
  type Anamnese = RespostaLocal[] | Omit<RespostaLocal, 'secao' | 'campo'>;
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
  const telaDocumentos = elemento('documents-view');
  const documentos = new Map<string, DocumentoLocal[]>();
  let salvandoDocumento = false;
  const formularioObjetivo = elemento<HTMLFormElement>('goal-form');
  type ObjetivoLocal = Objetivo & { historico?: { objetivo: Objetivo; motivo: string }[] };
  const objetivos = new Map<string, ObjetivoLocal[]>();
  let objetivoEmRevisao: number | undefined;
  let revisaoDesatualizada = false;
  let salvandoObjetivo = false;
  type Compromisso = {
    descricao: string;
    profissional: string;
    data: string;
    hora: string;
    duracao: number;
    local: string;
    participantes: string;
    estado: 'agendado' | 'cancelado';
  };
  const agenda = new Map<string, Compromisso[]>();
  const telaAgenda = elemento('agenda-view');
  const telaAgendaGeral = elemento('general-agenda-view');
  let origemAgendaGeral = false;
  const telaResumo = elemento('summary-view');
  const formularioAgenda = elemento<HTMLFormElement>('agenda-form');
  let compromissoEmEdicao: number | undefined;
  let salvandoAgenda = false;
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
  let geracaoNavegacao = 0;
  const exibirTela = (tela: HTMLElement) => {
    for (const item of [
      pacientes,
      anamnese,
      telaTarefas,
      telaObjetivos,
      telaRelato,
      telaAgenda,
      telaAgendaGeral,
      telaResumo,
      telaDocumentos,
    ])
      item.hidden = item !== tela;
  };
  let anamneseAlterada = false;
  const anamnese = elemento('anamnese-view');
  type Paciente = { id: string; name: string; preferredName?: string; revision?: number };
  let editando: Paciente | undefined;
  let salvandoCadastro = false;
  let geracaoCadastros = 0;
  let geracaoPendencias = 0;
  let registros: Paciente[] = [];
  let csrfToken = '';
  let telaInterrompida: HTMLElement | undefined;
  const requisitar = async (caminho: string, opcoes?: RequestInit) => {
    const resposta = await fetch(`/api/local-feedback${caminho}`, opcoes);
    if (resposta.status === 401 && caminho !== '/login') {
      geracaoNavegacao++;
      geracaoPendencias++;
      telaInterrompida = [
        pacientes,
        anamnese,
        telaTarefas,
        telaObjetivos,
        telaRelato,
        telaAgenda,
        telaAgendaGeral,
        telaResumo,
        telaDocumentos,
      ].find((tela) => !tela.hidden);
      pacientes.hidden = true;
      anamnese.hidden = true;
      telaTarefas.hidden = true;
      telaObjetivos.hidden = true;
      telaRelato.hidden = true;
      telaAgenda.hidden = true;
      telaAgendaGeral.hidden = true;
      telaResumo.hidden = true;
      telaDocumentos.hidden = true;
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
    const geracao = ++geracaoCadastros;
    try {
      const resposta = await requisitar('/patients');
      const pacientesCarregados = ((await resposta.json()) as { patients: Paciente[] }).patients;
      if (geracao !== geracaoCadastros) return;
      registros = pacientesCarregados;
      atualizar();
      void carregarPendencias();
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
  const carregarPrevia = async (id: string, geracao?: number) => {
    const resposta = await requisitar(`/patients/${id}/preview`);
    const previa = (await resposta.json()) as {
      revision: number;
      anamnese: Anamnese | null;
      tarefas: Tarefa[];
      objetivos?: ObjetivoLocal[];
      relatos?: RelatoTextual[];
      agenda?: Compromisso[];
      documentos?: DocumentoLocal[];
    };
    if (geracao !== undefined && geracao !== geracaoNavegacao) return;
    revisoes.set(id, previa.revision);
    if (previa.anamnese) anamneses.set(id, previa.anamnese);
    else anamneses.delete(id);
    tarefas.set(id, previa.tarefas);
    objetivos.set(id, previa.objetivos ?? []);
    relatos.set(id, previa.relatos ?? []);
    agenda.set(id, previa.agenda ?? []);
    documentos.set(id, previa.documentos ?? []);
  };
  const salvarPrevia = async (
    id: string,
    type: 'anamnese' | 'tarefas' | 'objetivos' | 'relatos' | 'agenda' | 'documentos',
    value:
      | Anamnese
      | Tarefa[]
      | ObjetivoLocal[]
      | RelatoTextual[]
      | Compromisso[]
      | DocumentoLocal[],
  ) => {
    const resposta = await requisitar(`/patients/${id}/preview`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ type, value, revision: revisoes.get(id) }),
    });
    const previa = (await resposta.json()) as { revision: number };
    revisoes.set(id, previa.revision);
  };
  let buscaPaciente = '';
  const atualizar = () => {
    corpo.replaceChildren();
    const resultados = registros.filter((registro) =>
      correspondeBuscaPacienteLocal(registro, buscaPaciente),
    );
    for (const registro of resultados) {
      const linha = corpo.insertRow();
      linha.insertCell().textContent = registro.name;
      linha.insertCell().textContent = registro.preferredName || '—';
      const abrir = document.createElement('button');
      abrir.type = 'button';
      abrir.className = 'button-secondary';
      abrir.textContent = 'Abrir anamnese';
      abrir.setAttribute('aria-label', `Abrir anamnese de ${registro.name}`);
      abrir.addEventListener('click', async () => {
        const geracao = ++geracaoNavegacao;
        try {
          await carregarPrevia(registro.id, geracao);
        } catch {
          if (geracao !== geracaoNavegacao) return;
          elemento('workspace-feedback').textContent =
            'Não foi possível carregar a prévia. Tente novamente.';
          return;
        }
        if (geracao !== geracaoNavegacao) return;
        selecionado = registro.id;
        anamneseAlterada = false;
        const salvo = anamneses.get(registro.id);
        desenharCampos(
          salvo
            ? Array.isArray(salvo)
              ? salvo
              : [{ secao: 'Exemplo', campo: 'Exemplo', ...salvo }]
            : [
                {
                  secao: 'Exemplo',
                  campo: 'Exemplo',
                  estado: 'pendente',
                  valor: '',
                  fonte: '',
                  data: '',
                },
              ],
        );
        elemento('anamnese-patient').textContent = registro.name;
        elemento('anamnese-feedback').textContent = '';
        atualizarProgresso();
        exibirTela(anamnese);
        elemento('anamnese-title').focus();
      });
      const abrirDocumentos = document.createElement('button');
      abrirDocumentos.type = 'button';
      abrirDocumentos.className = 'button-secondary';
      abrirDocumentos.textContent = 'Abrir documentos';
      abrirDocumentos.setAttribute('aria-label', `Abrir documentos de ${registro.name}`);
      abrirDocumentos.addEventListener('click', async () => {
        const geracao = ++geracaoNavegacao;
        let anexos: { id: string; name: string; size: number }[];
        try {
          await carregarPrevia(registro.id, geracao);
          const resposta = await requisitar(`/patients/${registro.id}/attachments`);
          anexos = ((await resposta.json()) as { attachments: typeof anexos }).attachments;
        } catch {
          if (geracao === geracaoNavegacao)
            elemento('workspace-feedback').textContent =
              'Não foi possível carregar a prévia. Tente novamente.';
          return;
        }
        if (geracao !== geracaoNavegacao) return;
        selecionado = registro.id;
        const itens = documentos.get(registro.id) ?? [];
        montarDocumentosLocais(elemento('documents-content'), {
          documentos: itens,
          anexos,
          urlAnexo: (id) => `/api/local-feedback/patients/${registro.id}/attachments/${id}`,
          aoAnexar: async (arquivo) => {
            salvandoDocumento = true;
            try {
              const bytes = new Uint8Array(await arquivo.arrayBuffer());
              let binario = '';
              for (const byte of bytes) binario += String.fromCharCode(byte);
              const resposta = await requisitar(`/patients/${registro.id}/attachments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                body: JSON.stringify({ name: arquivo.name, content: btoa(binario) }),
              });
              return (
                (await resposta.json()) as {
                  attachment: { id: string; name: string; size: number };
                }
              ).attachment;
            } finally {
              salvandoDocumento = false;
            }
          },
          aoRegistrar: async (documento) => {
            salvandoDocumento = true;
            try {
              await salvarPrevia(registro.id, 'documentos', [...itens, documento]);
              documentos.set(registro.id, itens);
              const form = elemento('documents-content').querySelector('form');
              if (form) formulariosAlterados.delete(form);
            } finally {
              salvandoDocumento = false;
            }
          },
        });
        const form = elemento('documents-content').querySelector('form');
        form?.addEventListener('input', () => formulariosAlterados.add(form));
        elemento('documents-patient').textContent = registro.name;
        exibirTela(telaDocumentos);
        elemento('documents-title').focus();
      });
      const abrirResumo = document.createElement('button');
      abrirResumo.type = 'button';
      abrirResumo.className = 'button-secondary';
      abrirResumo.textContent = 'Abrir resumo';
      abrirResumo.setAttribute('aria-label', `Abrir resumo de ${registro.name}`);
      abrirResumo.addEventListener('click', async () => {
        const geracao = ++geracaoNavegacao;
        try {
          await carregarPrevia(registro.id, geracao);
        } catch {
          if (geracao !== geracaoNavegacao) return;
          elemento('workspace-feedback').textContent =
            'Não foi possível carregar o resumo. Tente novamente.';
          return;
        }
        if (geracao !== geracaoNavegacao) return;
        selecionado = registro.id;
        montarResumoCasoLocal(elemento('summary-content'), {
          anamnese: anamneses.get(registro.id) ?? null,
          tarefas: tarefas.get(registro.id) ?? [],
          objetivos: objetivos.get(registro.id) ?? [],
          relatos: relatos.get(registro.id) ?? [],
        });
        elemento('summary-patient').textContent = registro.name;
        exibirTela(telaResumo);
        elemento('summary-title').focus();
      });
      const abrirAgenda = document.createElement('button');
      abrirAgenda.type = 'button';
      abrirAgenda.className = 'button-secondary';
      abrirAgenda.textContent = 'Abrir agenda';
      abrirAgenda.setAttribute('aria-label', `Abrir agenda de ${registro.name}`);
      abrirAgenda.addEventListener('click', () => void abrirAgendaPaciente(registro, false));
      const abrirTarefas = document.createElement('button');
      abrirTarefas.type = 'button';
      abrirTarefas.className = 'button-secondary';
      abrirTarefas.textContent = 'Abrir tarefas';
      abrirTarefas.setAttribute('aria-label', `Abrir tarefas de ${registro.name}`);
      abrirTarefas.addEventListener('click', () => void abrirTarefasPaciente(registro));
      const abrirObjetivos = document.createElement('button');
      abrirObjetivos.type = 'button';
      abrirObjetivos.className = 'button-secondary';
      abrirObjetivos.textContent = 'Abrir plano';
      abrirObjetivos.setAttribute('aria-label', `Abrir plano de ${registro.name}`);
      abrirObjetivos.addEventListener('click', async () => {
        const geracao = ++geracaoNavegacao;
        try {
          await carregarPrevia(registro.id, geracao);
        } catch {
          if (geracao !== geracaoNavegacao) return;
          elemento('workspace-feedback').textContent =
            'Não foi possível carregar a prévia. Tente novamente.';
          return;
        }
        if (geracao !== geracaoNavegacao) return;
        selecionado = registro.id;
        formularioObjetivo.reset();
        objetivoEmRevisao = undefined;
        revisaoDesatualizada = false;
        elemento('goal-reason-field').hidden = true;
        elemento('goal-form-title').textContent = 'Cadastrar objetivo';
        elemento('goal-feedback').textContent = '';
        elemento('goals-patient').textContent = registro.name;
        atualizarObjetivos();
        exibirTela(telaObjetivos);
        elemento('goals-title').focus();
      });
      const abrirRelato = document.createElement('button');
      abrirRelato.type = 'button';
      abrirRelato.className = 'button-secondary';
      abrirRelato.textContent = 'Abrir relatos';
      abrirRelato.setAttribute('aria-label', `Abrir relatos de ${registro.name}`);
      abrirRelato.addEventListener('click', async () => {
        const geracao = ++geracaoNavegacao;
        try {
          if (!navigator.locks) throw new Error('locks indisponíveis');
          await navigator.locks.request(chaveOperacao(registro.id), async () => {
            await carregarPrevia(registro.id, geracao);
            if (geracao !== geracaoNavegacao) return;
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
              if (geracao !== geracaoNavegacao) return;
              revisoes.set(registro.id, resultado.revision);
              relatos.set(registro.id, resultado.relatos ?? []);
              localStorage.removeItem(chaveOperacao(registro.id));
            }
          });
        } catch {
          if (geracao !== geracaoNavegacao) return;
          elemento('workspace-feedback').textContent =
            'Não foi possível carregar a prévia com segurança. Tente novamente.';
          return;
        }
        if (geracao !== geracaoNavegacao) return;
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
        elemento('relato-back').textContent = 'Voltar à lista';
        exibirTela(telaRelato);
        elemento('relato-title').focus();
      });
      const editar = document.createElement('button');
      editar.type = 'button';
      editar.className = 'button-secondary editar-cadastro';
      editar.disabled = salvandoCadastro;
      editar.textContent = 'Editar cadastro';
      editar.setAttribute('aria-label', `Editar cadastro de ${registro.name}`);
      editar.addEventListener('click', () => {
        geracaoNavegacao++;
        if (salvandoCadastro) return;
        if (
          formulariosAlterados.has(formulario) &&
          !window.confirm('Há alterações não guardadas. Deseja descartá-las?')
        )
          return;
        editando = registro;
        nome.value = registro.name;
        preferencia.value = registro.preferredName ?? '';
        elemento('create-title').textContent = 'Editar paciente';
        elemento('create-submit').textContent = 'Salvar alterações';
        elemento('cancel-edit').hidden = false;
        elemento('create-feedback').textContent = '';
        formulariosAlterados.delete(formulario);
        nome.focus();
      });
      linha
        .insertCell()
        .append(
          abrir,
          document.createTextNode(' '),
          abrirResumo,
          document.createTextNode(' '),
          abrirDocumentos,
          document.createTextNode(' '),
          abrirAgenda,
          document.createTextNode(' '),
          abrirTarefas,
          document.createTextNode(' '),
          abrirObjetivos,
          document.createTextNode(' '),
          abrirRelato,
          document.createTextNode(' '),
          editar,
        );
    }
    tabela.hidden = resultados.length === 0;
    vazio.hidden = resultados.length !== 0;
    elemento('empty-description').textContent = buscaPaciente.trim()
      ? 'Nenhum paciente encontrado para esta busca.'
      : 'Nenhum cadastro disponível para seu acesso.';
    elemento('list-status').textContent = `${resultados.length} pacientes fictícios nesta lista.`;
  };
  const abrirTarefasPaciente = async (registro: Paciente) => {
    const geracao = ++geracaoNavegacao;
    try {
      await carregarPrevia(registro.id, geracao);
    } catch {
      if (geracao !== geracaoNavegacao) return;
      elemento('workspace-feedback').textContent =
        'Não foi possível carregar a prévia. Tente novamente.';
      return;
    }
    if (geracao !== geracaoNavegacao) return;
    selecionado = registro.id;
    formularioTarefa.reset();
    elemento('task-feedback').textContent = '';
    elemento('tasks-patient').textContent = registro.name;
    atualizarTarefas();
    exibirTela(telaTarefas);
    elemento('tasks-title').focus();
  };
  const carregarPendencias = async () => {
    const geracao = ++geracaoPendencias;
    const painel = elemento('pending-panel');
    painel.textContent = 'Carregando pendências…';
    try {
      const resposta = await requisitar('/pending-tasks');
      const dados = (await resposta.json()) as {
        patients: DadosPainelPendenciasLocal['pacientes'];
      };
      if (geracao !== geracaoPendencias) return;
      const agora = new Date();
      const hoje = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
      montarPainelPendenciasLocal(painel, {
        hoje,
        pacientes: dados.patients,
        abrirTarefas: (id) => {
          const registro = registros.find((item) => item.id === id);
          if (registro) void abrirTarefasPaciente(registro);
        },
      });
    } catch {
      if (geracao !== geracaoPendencias) return;
      painel.textContent =
        'Não foi possível carregar as pendências. Atualize a lista para tentar novamente.';
    }
  };
  const abrirAgendaPaciente = async (registro: Paciente, daAgendaGeral: boolean) => {
    const geracao = ++geracaoNavegacao;
    try {
      await carregarPrevia(registro.id, geracao);
    } catch {
      if (geracao !== geracaoNavegacao) return;
      elemento(daAgendaGeral ? 'general-agenda-status' : 'workspace-feedback').textContent =
        'Não foi possível carregar a agenda. Tente novamente.';
      return;
    }
    if (geracao !== geracaoNavegacao) return;
    selecionado = registro.id;
    origemAgendaGeral = daAgendaGeral;
    formularioAgenda.reset();
    compromissoEmEdicao = undefined;
    elemento('agenda-form-title').textContent = 'Cadastrar compromisso';
    elemento('agenda-cancel-edit').hidden = true;
    elemento('agenda-feedback').textContent = '';
    elemento('agenda-patient').textContent = registro.name;
    elemento('agenda-back').textContent = daAgendaGeral
      ? 'Voltar à agenda geral'
      : 'Voltar à lista';
    atualizarAgenda();
    exibirTela(telaAgenda);
    elemento('agenda-title').focus();
  };
  const abrirAgendaGeral = async () => {
    const geracao = ++geracaoNavegacao;
    exibirTela(telaAgendaGeral);
    elemento('general-agenda-title').focus();
    const lista = elemento('general-agenda-list');
    lista.replaceChildren();
    elemento('general-agenda-status').textContent = 'Carregando compromissos…';
    try {
      const resposta = await requisitar('/agenda');
      const { appointments } = (await resposta.json()) as {
        appointments: (Pick<Compromisso, 'data' | 'hora' | 'descricao' | 'estado'> & {
          patientId: string;
          patientName: string;
        })[];
      };
      if (geracao !== geracaoNavegacao) return;
      appointments.sort((a, b) => `${a.data} ${a.hora}`.localeCompare(`${b.data} ${b.hora}`));
      elemento('general-agenda-status').textContent = appointments.length
        ? ''
        : 'Nenhum compromisso nesta prévia.';
      for (const item of appointments) {
        const linha = document.createElement('li');
        const resumo = document.createElement('p');
        resumo.textContent = `${item.data} às ${item.hora} · ${item.patientName} · ${item.descricao} · ${item.estado === 'cancelado' ? 'Cancelado' : 'Agendado'}`;
        const abrir = document.createElement('button');
        abrir.type = 'button';
        abrir.className = 'button-secondary';
        abrir.textContent = 'Abrir agenda do paciente';
        abrir.setAttribute('aria-label', `Abrir agenda de ${item.patientName}`);
        abrir.addEventListener(
          'click',
          () => void abrirAgendaPaciente({ id: item.patientId, name: item.patientName }, true),
        );
        linha.append(resumo, abrir);
        lista.append(linha);
      }
    } catch {
      if (geracao === geracaoNavegacao)
        elemento('general-agenda-status').textContent =
          'Não foi possível carregar os compromissos. Volte à lista e tente novamente.';
    }
  };
  elemento('open-general-agenda').addEventListener('click', () => void abrirAgendaGeral());
  elemento('general-agenda-back').addEventListener('click', () => {
    geracaoNavegacao++;
    exibirTela(pacientes);
    elemento('open-general-agenda').focus();
  });
  elemento('documents-back').addEventListener('click', () => {
    if (salvandoDocumento) return;
    const form = elemento('documents-content').querySelector('form');
    if (
      form &&
      formulariosAlterados.has(form) &&
      !window.confirm('Há alterações não guardadas. Deseja descartá-las?')
    )
      return;
    if (form) formulariosAlterados.delete(form);
    exibirTela(pacientes);
    elemento('patients-title').focus();
  });
  elemento('summary-back').addEventListener('click', () => {
    telaResumo.hidden = true;
    pacientes.hidden = false;
    elemento('patients-title').focus();
  });
  const campoAgenda = (nome: string) => elemento<HTMLInputElement>(`agenda-${nome}`);
  const limparAgenda = () => {
    formularioAgenda.reset();
    compromissoEmEdicao = undefined;
    formularioAgenda.querySelector('button[type="submit"]')?.removeAttribute('disabled');
    elemento('agenda-form-title').textContent = 'Cadastrar compromisso';
    elemento('agenda-cancel-edit').hidden = true;
    formulariosAlterados.delete(formularioAgenda);
  };
  const atualizarAgenda = () => {
    const lista = elemento('agenda-list');
    lista.replaceChildren();
    const itens = selecionado ? (agenda.get(selecionado) ?? []) : [];
    elemento('agenda-empty').hidden = itens.length > 0;
    for (const [indice, item] of itens.entries()) {
      const linha = document.createElement('li');
      const resumo = document.createElement('p');
      resumo.textContent = `${item.data} às ${item.hora} · ${item.descricao} · ${item.profissional} · ${item.duracao} min · ${item.local} · Participantes: ${item.participantes} · ${item.estado === 'cancelado' ? 'Cancelado' : 'Agendado'} · Origem: prévia local`;
      linha.append(resumo);
      if (item.estado === 'agendado') {
        const editar = document.createElement('button');
        editar.type = 'button';
        editar.className = 'button-secondary';
        editar.textContent = 'Editar';
        editar.setAttribute('aria-label', `Editar ${item.descricao}`);
        editar.addEventListener('click', () => {
          if (
            formulariosAlterados.has(formularioAgenda) &&
            !window.confirm('Há alterações não guardadas. Deseja descartá-las?')
          )
            return;
          compromissoEmEdicao = indice;
          for (const [nome, valor] of Object.entries({
            description: item.descricao,
            professional: item.profissional,
            date: item.data,
            time: item.hora,
            duration: item.duracao,
            location: item.local,
            participants: item.participantes,
          }))
            campoAgenda(nome).value = String(valor);
          elemento('agenda-form-title').textContent = 'Editar compromisso';
          elemento('agenda-cancel-edit').hidden = false;
          formulariosAlterados.delete(formularioAgenda);
          campoAgenda('description').focus();
        });
        const cancelar = document.createElement('button');
        cancelar.type = 'button';
        cancelar.className = 'button-secondary';
        cancelar.textContent = 'Cancelar compromisso';
        cancelar.setAttribute('aria-label', `Cancelar ${item.descricao}`);
        cancelar.addEventListener('click', async () => {
          if (
            salvandoAgenda ||
            !selecionado ||
            !window.confirm('Cancelar este compromisso fictício?')
          )
            return;
          if (
            formulariosAlterados.has(formularioAgenda) &&
            !window.confirm('Há alterações não guardadas. Deseja descartá-las?')
          )
            return;
          const pacienteId = selecionado;
          const atualizados = itens.map((atual, posicao) =>
            posicao === indice ? { ...atual, estado: 'cancelado' as const } : atual,
          );
          salvandoAgenda = true;
          bloquearFormulario(formularioAgenda, true);
          elemento<HTMLButtonElement>('agenda-back').disabled = true;
          for (const botao of lista.querySelectorAll('button')) botao.disabled = true;
          try {
            await salvarPrevia(pacienteId, 'agenda', atualizados);
            agenda.set(pacienteId, atualizados);
            limparAgenda();
            atualizarAgenda();
            elemento('agenda-feedback').textContent =
              'Cancelamento salvo somente nesta prévia local.';
          } catch {
            elemento('agenda-feedback').textContent =
              'Não foi possível confirmar. Volte à lista e reabra a agenda para conferir.';
          } finally {
            salvandoAgenda = false;
            bloquearFormulario(formularioAgenda, false);
            elemento<HTMLButtonElement>('agenda-back').disabled = false;
            for (const botao of lista.querySelectorAll('button')) botao.disabled = false;
          }
        });
        linha.append(editar, document.createTextNode(' '), cancelar);
      }
      lista.append(linha);
    }
  };
  elemento('agenda-back').addEventListener('click', () => {
    if (
      salvandoAgenda ||
      (formulariosAlterados.has(formularioAgenda) &&
        !window.confirm('Há alterações não guardadas. Deseja descartá-las?'))
    )
      return;
    limparAgenda();
    if (origemAgendaGeral) void abrirAgendaGeral();
    else {
      exibirTela(pacientes);
      elemento('patients-title').focus();
    }
  });
  elemento('agenda-cancel-edit').addEventListener('click', () => {
    if (
      formulariosAlterados.has(formularioAgenda) &&
      !window.confirm('Há alterações não guardadas. Deseja descartá-las?')
    )
      return;
    limparAgenda();
  });
  formularioAgenda.addEventListener('input', () => formulariosAlterados.add(formularioAgenda));
  formularioAgenda.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!selecionado || salvandoAgenda || !formularioAgenda.reportValidity()) return;
    const item: Compromisso = {
      descricao: campoAgenda('description').value.trim(),
      profissional: campoAgenda('professional').value.trim(),
      data: campoAgenda('date').value,
      hora: campoAgenda('time').value,
      duracao: Number(campoAgenda('duration').value),
      local: campoAgenda('location').value.trim(),
      participantes: campoAgenda('participants').value.trim(),
      estado: 'agendado',
    };
    if (!item.descricao || !item.profissional || !item.local || !item.participantes) {
      elemento('agenda-feedback').textContent = 'Preencha todos os campos.';
      return;
    }
    const pacienteId = selecionado;
    const itens = [...(agenda.get(pacienteId) ?? [])];
    const inicio = new Date(`${item.data}T${item.hora}`).getTime();
    const sobreposicao = itens.some(
      (outro, indice) =>
        indice !== compromissoEmEdicao &&
        outro.estado === 'agendado' &&
        inicio < new Date(`${outro.data}T${outro.hora}`).getTime() + outro.duracao * 60000 &&
        new Date(`${outro.data}T${outro.hora}`).getTime() < inicio + item.duracao * 60000,
    );
    if (sobreposicao && !window.confirm('Há sobreposição nesta agenda fictícia. Deseja continuar?'))
      return;
    if (compromissoEmEdicao === undefined) itens.push(item);
    else itens[compromissoEmEdicao] = item;
    salvandoAgenda = true;
    bloquearFormulario(formularioAgenda, true);
    elemento<HTMLButtonElement>('agenda-back').disabled = true;
    for (const botao of elemento('agenda-list').querySelectorAll('button')) botao.disabled = true;
    try {
      await salvarPrevia(pacienteId, 'agenda', itens);
      agenda.set(pacienteId, itens);
      limparAgenda();
      atualizarAgenda();
      elemento('agenda-feedback').textContent = 'Compromisso salvo somente nesta prévia local.';
    } catch {
      elemento('agenda-feedback').textContent =
        'Não foi possível confirmar. Preserve o rascunho e reabra a agenda para conferir antes de tentar novamente.';
    } finally {
      salvandoAgenda = false;
      bloquearFormulario(formularioAgenda, false);
      elemento<HTMLButtonElement>('agenda-back').disabled = false;
      for (const botao of elemento('agenda-list').querySelectorAll('button'))
        botao.disabled = false;
    }
  });
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
      const campos = [
        ['Descrição', 'descricao', 'text', 200],
        ['Responsável', 'responsavel', 'text', 200],
        ['Prazo', 'prazo', 'date', 0],
        ['Prioridade', 'prioridade', 'text', 200],
      ] as const;
      const entradas = campos.map(([rotulo, chave, tipo, limite]) => {
        const label = document.createElement('label');
        label.textContent = rotulo;
        const input = document.createElement('input');
        input.type = tipo;
        input.value = tarefa[chave];
        input.required = true;
        if (limite) input.maxLength = limite;
        label.append(input);
        form.append(label);
        return input;
      });
      const [descricao, responsavel, prazo, prioridade] = entradas;
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
        const dados = {
          descricao: descricao?.value.trim() ?? '',
          responsavel: responsavel?.value.trim() ?? '',
          prazo: prazo?.value ?? '',
          prioridade: prioridade?.value.trim() ?? '',
          estado: estado.value,
          acaoOuJustificativa: campoAcao.value.trim(),
        };
        const resultado = validarTarefaPlano({
          ...dados,
          acaoRealizada: dados.acaoOuJustificativa || undefined,
        });
        if (!dados.descricao || !resultado.valido) {
          feedback.textContent =
            'Preencha tarefa, responsável, prazo e prioridade. Informe a ação realizada ou justificativa para concluir.';
          return;
        }
        if (!selecionado) return;
        const pacienteId = selecionado;
        const atualizada = dados;
        const atualizadas = (tarefas.get(pacienteId) ?? []).map((item) =>
          item === tarefa ? atualizada : item,
        );
        const liberarTela = bloquearTelaTarefas();
        try {
          await salvarPrevia(pacienteId, 'tarefas', atualizadas);
          Object.assign(tarefa, atualizada);
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
        titulo.textContent = tarefa.descricao;
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
  const formulariosDeTarefas = () =>
    [...formulariosAlterados].filter((form) => telaTarefas.contains(form));
  const limparAlteracoesTarefas = () => {
    for (const form of formulariosDeTarefas()) formulariosAlterados.delete(form);
  };
  elemento('tasks-back').addEventListener('click', () => {
    if (
      formulariosDeTarefas().length &&
      !window.confirm('Há alterações não guardadas. Deseja descartá-las?')
    )
      return;
    limparAlteracoesTarefas();
    void carregarPendencias();
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
      formulariosDeTarefas().some((form) => form !== formularioTarefa) &&
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
    limparAlteracoesTarefas();
    formularioTarefa.reset();
    atualizarTarefas();
    elemento('task-feedback').textContent = 'Tarefa fictícia salva nesta demonstração local.';
  });
  const camposRaiz = elemento('anamnese-fields');
  const primeiroCampo = camposRaiz.firstElementChild;
  if (!primeiroCampo) throw new Error('Campo de anamnese ausente');
  const modeloCampo = primeiroCampo.cloneNode(true) as HTMLFieldSetElement;
  const desenharCampos = (respostas: RespostaLocal[]) => {
    camposRaiz.replaceChildren();
    for (const [indice, resposta] of respostas.entries()) {
      const bloco = modeloCampo.cloneNode(true) as HTMLFieldSetElement;
      for (const controle of bloco.querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >('input, textarea, select')) {
        const nome =
          controle.name ||
          (
            {
              'anamnese-state': 'estado',
              'anamnese-value': 'valor',
              'anamnese-source': 'fonte',
              'anamnese-date': 'data',
            } as Record<string, string>
          )[controle.id];
        if (!nome) throw new Error('Campo de anamnese inválido');
        controle.name = nome;
        controle.value = resposta[nome as keyof RespostaLocal];
        if (indice > 0 && controle.id) {
          const antigo = controle.id;
          controle.id = `${antigo}-${indice}`;
          bloco.querySelector(`label[for="${antigo}"]`)?.setAttribute('for', controle.id);
        }
      }
      const remover = document.createElement('button');
      remover.type = 'button';
      remover.textContent = 'Remover campo';
      remover.setAttribute('aria-label', `Remover campo ${resposta.campo || indice + 1}`);
      remover.addEventListener('click', () => {
        bloco.remove();
        anamneseAlterada = true;
        atualizarProgresso();
        elemento('anamnese-feedback').textContent =
          'Campo removido do rascunho. Guarde para confirmar.';
        elemento('anamnese-add').focus();
      });
      bloco.append(remover);
      camposRaiz.append(bloco);
    }
  };
  const lerCampos = (): RespostaLocal[] =>
    Array.from(camposRaiz.querySelectorAll<HTMLFieldSetElement>('fieldset')).map((bloco) => {
      const obter = (nome: string) =>
        bloco.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
          `[name="${nome}"]`,
        )?.value ?? '';
      return {
        secao: obter('secao'),
        campo: obter('campo'),
        estado: obter('estado'),
        valor: obter('valor'),
        fonte: obter('fonte'),
        data: obter('data'),
      };
    });
  const atualizarProgresso = () => {
    const respostas = lerCampos();
    const incompleta = respostas.some((item) => item.estado === 'pendente');
    elemento('anamnese-progress').textContent =
      respostas.length === 0
        ? 'Nenhum campo registrado nesta prévia.'
        : incompleta
          ? 'Anamnese incompleta: há informação pendente.'
          : 'Anamnese sem pendências nesta prévia.';
  };
  elemento('anamnese-add').addEventListener('click', () => {
    const respostas = lerCampos();
    if (respostas.length >= 100) {
      elemento('anamnese-feedback').textContent = 'Limite de 100 campos nesta prévia.';
      return;
    }
    respostas.push({ secao: '', campo: '', estado: 'pendente', valor: '', fonte: '', data: '' });
    desenharCampos(respostas);
    anamneseAlterada = true;
    elemento('anamnese-feedback').textContent = 'Há alterações não guardadas nesta prévia.';
    camposRaiz.lastElementChild?.querySelector<HTMLInputElement>('input')?.focus();
  });
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
    const dados = lerCampos();
    if (
      dados.some(
        (item) =>
          !item.secao.trim() ||
          !item.campo.trim() ||
          !['pendente', 'informado', 'desconhecido', 'nao_se_aplica'].includes(item.estado) ||
          (item.estado !== 'pendente' && (!item.fonte.trim() || !item.data)) ||
          (item.estado === 'informado' && !item.valor.trim()),
      )
    ) {
      elemento('anamnese-feedback').textContent =
        'Confira seção, campo, estado, informação, fonte e data.';
      return;
    }
    const pacienteId = selecionado;
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
  montarBuscaPacientesLocal(elemento('patient-search'), (texto) => {
    buscaPaciente = texto;
    atualizar();
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
    if (salvandoCadastro || !podeDescartar()) return;
    geracaoPendencias++;
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
  elemento('reload-patients').addEventListener('click', () => {
    if (!salvandoCadastro) void carregar();
  });
  const cancelarEdicao = () => {
    editando = undefined;
    formulario.reset();
    formulariosAlterados.delete(formulario);
    elemento('create-title').textContent = 'Novo paciente';
    elemento('create-submit').textContent = 'Cadastrar paciente';
    elemento('cancel-edit').hidden = true;
  };
  formulario.addEventListener('input', () => formulariosAlterados.add(formulario));
  elemento('cancel-edit').addEventListener('click', () => {
    if (salvandoCadastro) return;
    if (
      formulariosAlterados.has(formulario) &&
      !window.confirm('Há alterações não guardadas. Deseja descartá-las?')
    )
      return;
    cancelarEdicao();
    elemento('create-feedback').textContent = '';
  });
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (salvandoCadastro) return;
    const nomeLimpo = nome.value.trim();
    if (!nomeLimpo) {
      elemento('create-feedback').textContent = 'Informe o nome fictício.';
      nome.focus();
      return;
    }
    const cadastroOriginal = editando;
    salvandoCadastro = true;
    geracaoCadastros++;
    bloquearFormulario(formulario, true);
    elemento<HTMLButtonElement>('reload-patients').disabled = true;
    for (const botao of corpo.querySelectorAll<HTMLButtonElement>('.editar-cadastro'))
      botao.disabled = true;
    elemento('create-feedback').textContent = 'Salvando cadastro…';
    try {
      const resposta = await requisitar(
        cadastroOriginal ? `/patients/${cadastroOriginal.id}` : '/patients',
        {
          method: cadastroOriginal ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
          body: JSON.stringify({
            name: nomeLimpo,
            preferredName: preferencia.value.trim(),
            ...(cadastroOriginal ? { revision: cadastroOriginal.revision ?? 0 } : {}),
          }),
        },
      );
      const { patient } = (await resposta.json()) as { patient: Paciente };
      if (cadastroOriginal)
        registros = registros.map((item) => (item.id === patient.id ? patient : item));
      else registros.push(patient);
      cancelarEdicao();
      atualizar();
      elemento('create-feedback').textContent = 'Cadastro fictício salvo nesta demonstração local.';
    } catch (erro) {
      elemento('create-feedback').textContent =
        erro instanceof Error && erro.message === '409'
          ? 'Cadastro alterado em outra aba. Copie seu rascunho, atualize a lista e reabra a edição.'
          : 'Não foi possível confirmar o salvamento. Preserve o rascunho e atualize a lista para conferir.';
    } finally {
      salvandoCadastro = false;
      bloquearFormulario(formulario, false);
      elemento<HTMLButtonElement>('reload-patients').disabled = false;
      for (const botao of corpo.querySelectorAll<HTMLButtonElement>('.editar-cadastro'))
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
