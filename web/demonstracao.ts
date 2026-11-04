/// <reference types="vite/client" />

import { localizarPendencias, type RespostaAnamnese } from '../packages/cadastro/src/anamnese';

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
      linha.insertCell().append(abrir);
    }
    tabela.hidden = registros.length === 0;
    vazio.hidden = registros.length !== 0;
    elemento('list-status').textContent = `${registros.length} pacientes fictícios nesta lista.`;
  };
  const atualizarProgresso = () => {
    let resposta: RespostaAnamnese;
    if (estado.value === 'informado') {
      resposta = {
        campo: 'exemplo',
        estado: 'informado',
        valor: valor.value,
        fonte: fonte.value,
        data: data.value,
      };
    } else if (estado.value === 'desconhecido' || estado.value === 'nao_se_aplica') {
      resposta = { campo: 'exemplo', estado: estado.value, fonte: fonte.value, data: data.value };
    } else {
      resposta = { campo: 'exemplo', estado: 'pendente' };
    }
    const incompleta =
      localizarPendencias([{ id: 'exemplo', camposEsperados: ['exemplo'], respostas: [resposta] }])
        .length > 0;
    elemento('anamnese-progress').textContent = incompleta
      ? 'Seção incompleta: há informação pendente.'
      : 'Seção sem pendências nesta prévia.';
  };
  const podeDescartar = () =>
    !anamneseAlterada || window.confirm('Há alterações não guardadas. Deseja descartá-las?');
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
