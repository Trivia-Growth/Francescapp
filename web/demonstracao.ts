/// <reference types="vite/client" />

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
    }
    tabela.hidden = registros.length === 0;
    vazio.hidden = registros.length !== 0;
    elemento('list-status').textContent = `${registros.length} pacientes fictícios nesta lista.`;
  };
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
