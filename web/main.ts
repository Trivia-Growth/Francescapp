import type {
  sessaoAtualSchema,
  CriarPaciente,
  PacienteBasico,
} from '../packages/contracts/src/index.js';
import { ClienteFFCM, exigeNovoAcesso, FalhaApi, mensagemFalha, resultadoIncerto } from './api.js';
import { lerCadastro } from './cadastro.js';

function elemento<T extends HTMLElement>(id: string): T {
  const encontrado = document.getElementById(id);
  if (!encontrado) throw new Error('Elemento da interface indisponível.');
  return encontrado as T;
}

const api = new ClienteFFCM();
const loginView = elemento('login-view');
const patientsView = elemento('patients-view');
const logoutView = elemento('logout-view');
const revalidacaoStatus = elemento('revalidacao-status');
const loginForm = elemento<HTMLFormElement>('login-form');
const loginFields = elemento<HTMLFieldSetElement>('login-fields');
const loginButton = elemento<HTMLButtonElement>('login-submit');
const emailInput = elemento<HTMLInputElement>('email');
const passwordInput = elemento<HTMLInputElement>('password');
const togglePassword = elemento<HTMLButtonElement>('toggle-password');
const sessionActions = elemento('session-actions');
const logoutButton = elemento<HTMLButtonElement>('logout');
const retryLogout = elemento<HTMLButtonElement>('retry-logout');
const createForm = elemento<HTMLFormElement>('create-form');
const createFields = elemento<HTMLFieldSetElement>('create-fields');
const createButton = elemento<HTMLButtonElement>('create-submit');
const nameInput = elemento<HTMLInputElement>('patient-name');
const preferredInput = elemento<HTMLInputElement>('preferred-name');
const birthInput = elemento<HTMLInputElement>('birth-date');
const reloadButton = elemento<HTMLButtonElement>('reload-patients');
const previousButton = elemento<HTMLButtonElement>('previous-page');
const nextButton = elemento<HTMLButtonElement>('next-page');
const table = elemento<HTMLTableElement>('patients-table');
const tableBody = elemento<HTMLTableSectionElement>('patients-body');
const listLoading = elemento('list-loading');
const listEmpty = elemento('list-empty');
const pagination = elemento('pagination');
const registration = elemento('cadastro');
const newPatientLink = elemento<HTMLAnchorElement>('new-patient-link');

type Sessao = ReturnType<typeof sessaoAtualSchema.parse>;
let sessao: Sessao | null = null;
let revisao = 0;
let consulta = 0;
let loginOcupado = false;
let verificandoSessao = false;
let revalidacaoPendente = false;
let focoAposLoginOculto = false;
let cadastroOcupado = false;
let logoutOcupado = false;
let saidaComCadastroIncerto = false;
let cursores: (string | undefined)[] = [undefined];
let pagina = 0;
let proximoCursor: string | null = null;
type PedidoCadastro = { entrada: CriarPaciente; chave: string };
let cadastroPendente: PedidoCadastro | null = null;
let cadastroEmRevalidacao: { usuarioId: string; pedido: PedidoCadastro } | null = null;
const usuariosComCadastroIncerto = new Set<string>();

function aviso(id: string, texto: string, tom: 'error' | 'success' | 'neutral' = 'neutral') {
  const destino = elemento(id);
  destino.textContent = texto;
  destino.dataset.tone = tom;
}

function apagarPacientes(): void {
  tableBody.replaceChildren();
  table.hidden = true;
  listEmpty.hidden = true;
  pagination.hidden = true;
  listLoading.hidden = true;
  cursores = [undefined];
  pagina = 0;
  proximoCursor = null;
  consulta += 1;
  createForm.reset();
  createFields.disabled = false;
  createButton.disabled = false;
  createButton.textContent = 'Cadastrar paciente';
  nameInput.removeAttribute('aria-invalid');
  elemento('name-error').textContent = '';
  preferredInput.removeAttribute('aria-invalid');
  elemento('preferred-error').textContent = '';
  birthInput.removeAttribute('aria-invalid');
  elemento('birth-error').textContent = '';
  cadastroPendente = null;
  cadastroOcupado = false;
  aviso('create-feedback', '');
  aviso('workspace-feedback', '');
  aviso('list-status', '');
  table.removeAttribute('aria-busy');
  reloadButton.removeAttribute('aria-disabled');
  previousButton.removeAttribute('aria-disabled');
  nextButton.removeAttribute('aria-disabled');
}

function mostrarAcesso(mensagem = '', tom: 'error' | 'success' | 'neutral' = 'neutral') {
  if (sessao && cadastroPendente && !cadastroEmRevalidacao) {
    usuariosComCadastroIncerto.add(sessao.usuario.id);
  }
  api.limpar();
  sessao = null;
  revalidacaoPendente = false;
  focoAposLoginOculto = false;
  revisao += 1;
  apagarPacientes();
  loginForm.reset();
  passwordInput.type = 'password';
  togglePassword.textContent = 'Mostrar senha';
  togglePassword.setAttribute('aria-pressed', 'false');
  patientsView.hidden = true;
  logoutView.hidden = true;
  revalidacaoStatus.hidden = true;
  sessionActions.hidden = true;
  loginView.hidden = false;
  document.title = 'FFCMApp | Acesso';
  aviso('login-feedback', mensagem, tom);
  loginFields.disabled = false;
  loginButton.textContent = 'Entrar';
  elemento('login-title').focus();
}

function acessoPerdido(erro: unknown): boolean {
  if (!exigeNovoAcesso(erro)) return false;
  const alertaCadastro = cadastroPendente
    ? ' Um cadastro ficou sem confirmação. Confirme a situação por canal autorizado antes de cadastrá-lo novamente.'
    : '';
  mostrarAcesso(
    `Seu acesso precisa ser validado novamente. Entre com uma conta autorizada.${alertaCadastro}`,
    'error',
  );
  return true;
}

const perfis = {
  administrador: 'Administrador',
  profissional: 'Profissional',
  familia: 'Família',
};

function aplicarSessao(atual: Sessao): void {
  if (!atual.usuario.ativo) throw new Error('Acesso indisponível.');
  sessao = atual;
  const podeCadastrar =
    atual.usuario.perfil === 'administrador' && atual.capacidades.includes('administrar_cadastro');
  if (cadastroEmRevalidacao) {
    // Nunca restaura dados de um pedido para outra identidade ou sem autorização vigente.
    if (podeCadastrar && cadastroEmRevalidacao.usuarioId === atual.usuario.id) {
      cadastroPendente = cadastroEmRevalidacao.pedido;
      nameInput.value = cadastroPendente.entrada.nome;
      preferredInput.value = cadastroPendente.entrada.nome_preferencia ?? '';
      birthInput.value = cadastroPendente.entrada.data_nascimento ?? '';
      createFields.disabled = true;
      createButton.textContent = 'Confirmar cadastro';
      aviso(
        'create-feedback',
        'Cadastro sem confirmação. Confirme novamente o mesmo pedido.',
        'error',
      );
    } else {
      usuariosComCadastroIncerto.add(cadastroEmRevalidacao.usuarioId);
    }
    cadastroEmRevalidacao = null;
  }
  if (!podeCadastrar) {
    if (cadastroPendente) usuariosComCadastroIncerto.add(atual.usuario.id);
    createForm.reset();
    cadastroPendente = null;
    aviso('create-feedback', '');
  }
  if (podeCadastrar && usuariosComCadastroIncerto.has(atual.usuario.id)) {
    createForm.reset();
    cadastroPendente = null;
    createFields.disabled = true;
    createButton.disabled = true;
    aviso(
      'create-feedback',
      'Um cadastro ficou sem confirmação. Não cadastre novamente antes de confirmar a situação por canal autorizado; a consulta ainda não está disponível no aplicativo.',
      'error',
    );
  }
  registration.hidden = !podeCadastrar;
  newPatientLink.hidden = !podeCadastrar;
  elemento('workspace').classList.toggle('with-registration', podeCadastrar);
  elemento('session-role').textContent = perfis[atual.usuario.perfil];
  elemento('scope-description').textContent = atual.capacidades.includes(
    'consultar_carteira_integral',
  )
    ? 'Consulte os pacientes e mantenha o cadastro organizado.'
    : 'Pacientes disponíveis conforme seus vínculos de acesso.';
  elemento('empty-description').textContent = podeCadastrar
    ? 'Cadastre o primeiro paciente com o nome. Os demais campos são opcionais.'
    : 'Nenhum paciente foi disponibilizado para seu acesso nesta consulta.';
}

async function entrar(evento: SubmitEvent): Promise<void> {
  evento.preventDefault();
  if (loginOcupado) return;
  loginOcupado = true;
  loginFields.disabled = true;
  loginButton.textContent = 'Entrando…';
  aviso('login-feedback', 'Verificando credenciais e autorização…');
  const email = emailInput.value.trim();
  let senha = passwordInput.value;
  loginForm.reset();
  passwordInput.type = 'password';
  togglePassword.textContent = 'Mostrar senha';
  togglePassword.setAttribute('aria-pressed', 'false');
  const versao = revisao;
  try {
    const atual = await api.entrar(email, senha);
    if (versao !== revisao) return;
    aplicarSessao(atual);
    loginView.hidden = true;
    logoutView.hidden = true;
    if (document.hidden) {
      focoAposLoginOculto = true;
      patientsView.hidden = true;
      sessionActions.hidden = true;
      revalidacaoStatus.hidden = false;
      return;
    }
    patientsView.hidden = false;
    sessionActions.hidden = false;
    document.title = 'FFCMApp | Pacientes';
    aviso('login-feedback', '');
    elemento('patients-title').focus();
    await carregarPacientes();
  } catch (erro) {
    if (versao !== revisao) return;
    api.limpar();
    aviso(
      'login-feedback',
      exigeNovoAcesso(erro)
        ? 'Entrada não autorizada. Confira a conta e sua liberação de acesso.'
        : erro instanceof FalhaApi && erro.status === 429
          ? 'Limite de tentativas atingido. Tente novamente em alguns minutos.'
          : mensagemFalha(erro),
      'error',
    );
    loginFields.disabled = false;
    if (!document.hidden && document.activeElement === document.body) emailInput.focus();
  } finally {
    senha = '';
    loginOcupado = false;
    loginFields.disabled = false;
    loginButton.textContent = 'Entrar';
  }
}

function linhaPaciente(paciente: PacienteBasico): HTMLTableRowElement {
  const linha = document.createElement('tr');
  const nome = document.createElement('td');
  nome.textContent = paciente.nome;
  const preferencia = document.createElement('td');
  preferencia.textContent = paciente.nome_preferencia ?? 'Não informado';
  linha.append(nome, preferencia);
  return linha;
}

async function carregarPacientes(): Promise<boolean> {
  if (!sessao) return false;
  const versao = revisao;
  const numeroConsulta = ++consulta;
  const atual = () => versao === revisao && numeroConsulta === consulta && sessao !== null;
  tableBody.replaceChildren();
  table.hidden = true;
  listEmpty.hidden = true;
  listLoading.hidden = false;
  reloadButton.setAttribute('aria-disabled', 'true');
  previousButton.setAttribute('aria-disabled', 'true');
  nextButton.setAttribute('aria-disabled', 'true');
  table.setAttribute('aria-busy', 'true');
  aviso('list-status', 'Consultando pacientes…');
  try {
    const resultado = await api.listarPacientes(cursores[pagina]);
    if (!atual()) return false;
    tableBody.replaceChildren(...resultado.itens.map(linhaPaciente));
    proximoCursor = resultado.proximo_cursor;
    table.hidden = resultado.itens.length === 0;
    listEmpty.hidden = resultado.itens.length !== 0;
    elemento('empty-description').textContent =
      pagina > 0 && resultado.proximo_cursor
        ? 'Nenhum paciente nesta página. Use a página anterior ou a próxima para continuar a consulta.'
        : pagina > 0
          ? 'Nenhum paciente nesta página. Volte à página anterior para continuar a consulta.'
          : resultado.proximo_cursor
            ? 'Nenhum paciente nesta página. Avance para continuar a consulta.'
            : !registration.hidden
              ? 'Cadastre o primeiro paciente com o nome. Os demais campos são opcionais.'
              : 'Nenhum paciente foi disponibilizado para seu acesso nesta consulta.';
    aviso(
      'list-status',
      `${resultado.itens.length} ${resultado.itens.length === 1 ? 'paciente nesta página' : 'pacientes nesta página'}.`,
    );
    elemento('page-number').textContent = `Página ${pagina + 1}`;
    const semAnterior = pagina === 0;
    const semProximo = proximoCursor === null;
    const ocultarPaginacao = semAnterior && semProximo;
    if (ocultarPaginacao && pagination.contains(document.activeElement)) {
      reloadButton.focus();
    } else if (document.activeElement === nextButton && semProximo && !semAnterior) {
      previousButton.disabled = false;
      previousButton.focus();
    } else if (document.activeElement === previousButton && semAnterior && !semProximo) {
      nextButton.disabled = false;
      nextButton.focus();
    }
    previousButton.disabled = semAnterior;
    nextButton.disabled = semProximo;
    pagination.hidden = ocultarPaginacao;
    return true;
  } catch (erro) {
    if (!atual()) return false;
    if (!acessoPerdido(erro)) {
      if (pagina > 0 && erro instanceof FalhaApi && erro.status === 422) {
        if (pagination.contains(document.activeElement)) {
          reloadButton.focus();
        }
        pagination.hidden = true;
        cursores = [undefined];
        pagina = 0;
        proximoCursor = null;
        aviso(
          'list-status',
          'Esta página não está mais disponível. Use “Atualizar lista” para voltar à primeira página.',
          'error',
        );
        return false;
      }
      if (pagina > 0) {
        previousButton.disabled = false;
        if (document.activeElement === nextButton) previousButton.focus();
        nextButton.disabled = true;
        elemento('page-number').textContent = `Página ${pagina + 1}`;
        pagination.hidden = false;
      } else {
        if (pagination.contains(document.activeElement)) {
          reloadButton.focus();
        }
        pagination.hidden = true;
      }
      aviso(
        'list-status',
        `${mensagemFalha(erro)} Use “Atualizar lista” para tentar novamente.`,
        'error',
      );
    }
    return false;
  } finally {
    if (atual()) {
      listLoading.hidden = true;
      reloadButton.removeAttribute('aria-disabled');
      previousButton.removeAttribute('aria-disabled');
      nextButton.removeAttribute('aria-disabled');
      table.removeAttribute('aria-busy');
    }
  }
}

async function cadastrar(evento: SubmitEvent): Promise<void> {
  evento.preventDefault();
  if (
    cadastroOcupado ||
    !sessao ||
    registration.hidden ||
    usuariosComCadastroIncerto.has(sessao.usuario.id)
  )
    return;
  const pedidoJaIncerto = cadastroPendente !== null;
  if (!cadastroPendente) {
    const cadastro = lerCadastro({
      nome: nameInput.value,
      nomePreferencia: preferredInput.value,
      nascimento: birthInput.value,
    });
    if (!cadastro.success) {
      const campos = [
        {
          chave: 'nome',
          input: nameInput,
          erro: 'name-error',
          mensagem: 'Informe o nome com até 200 caracteres.',
        },
        {
          chave: 'nome_preferencia',
          input: preferredInput,
          erro: 'preferred-error',
          mensagem: 'Informe o nome de preferência com até 200 caracteres.',
        },
        {
          chave: 'data_nascimento',
          input: birthInput,
          erro: 'birth-error',
          mensagem: 'Informe uma data de nascimento válida.',
        },
      ];
      let primeiro: HTMLInputElement | undefined;
      for (const campo of campos) {
        const invalido = cadastro.error.issues.some((item) => item.path[0] === campo.chave);
        if (invalido) {
          campo.input.setAttribute('aria-invalid', 'true');
          elemento(campo.erro).textContent = campo.mensagem;
          primeiro ??= campo.input;
        } else {
          campo.input.removeAttribute('aria-invalid');
          elemento(campo.erro).textContent = '';
        }
      }
      primeiro?.focus();
      aviso('create-feedback', 'Confira os campos informados antes de cadastrar.', 'error');
      return;
    }
    cadastroPendente = { entrada: cadastro.data, chave: crypto.randomUUID() };
  }
  const pedido = cadastroPendente;
  const versao = revisao;
  cadastroOcupado = true;
  createFields.disabled = true;
  createButton.disabled = true;
  createButton.textContent = 'Cadastrando…';
  aviso('create-feedback', 'Aguardando confirmação do cadastro…');
  aviso('workspace-feedback', '');
  try {
    await api.criarPaciente(pedido.entrada, pedido.chave);
    if (versao !== revisao) return;
    cadastroPendente = null;
    createForm.reset();
    cursores = [undefined];
    pagina = 0;
    aviso('create-feedback', 'Paciente cadastrado.', 'success');
    const atualizou = await carregarPacientes();
    if (versao !== revisao) return;
    aviso(
      'workspace-feedback',
      atualizou
        ? 'Paciente cadastrado. Lista atualizada.'
        : 'Paciente cadastrado. A lista ainda precisa ser atualizada.',
      'success',
    );
  } catch (erro) {
    if (versao !== revisao || acessoPerdido(erro)) return;
    if (resultadoIncerto(erro)) {
      aviso(
        'create-feedback',
        'Cadastro sem confirmação. Confirme o mesmo pedido antes de sair ou recarregar; isso pode evitar duplicidade.',
        'error',
      );
    } else if (pedidoJaIncerto) {
      aviso(
        'create-feedback',
        'Cadastro sem confirmação. A última tentativa foi recusada; confirme a situação por canal autorizado antes de cadastrar novamente.',
        'error',
      );
    } else {
      cadastroPendente = null;
      aviso('create-feedback', mensagemFalha(erro), 'error');
    }
  } finally {
    if (versao === revisao) {
      cadastroOcupado = false;
      createFields.disabled = cadastroPendente !== null;
      createButton.disabled = false;
      createButton.textContent = cadastroPendente ? 'Confirmar cadastro' : 'Cadastrar paciente';
      if (revalidacaoPendente) {
        revalidacaoPendente = false;
        void revalidarAcesso();
      }
    }
  }
}

async function sair(): Promise<void> {
  if (logoutOcupado) return;
  logoutOcupado = true;
  saidaComCadastroIncerto ||= Boolean(cadastroPendente || cadastroEmRevalidacao);
  if (sessao && saidaComCadastroIncerto) usuariosComCadastroIncerto.add(sessao.usuario.id);
  const alertaCadastro = saidaComCadastroIncerto
    ? ' Um cadastro pode estar sem confirmação; não o recrie antes de consultar sua situação por canal autorizado. A consulta ainda não está disponível no aplicativo.'
    : '';
  cadastroEmRevalidacao = null;
  sessao = null;
  revisao += 1;
  apagarPacientes();
  patientsView.hidden = true;
  loginView.hidden = true;
  sessionActions.hidden = true;
  logoutView.hidden = false;
  revalidacaoStatus.hidden = true;
  document.title = 'FFCMApp | Encerrar acesso';
  retryLogout.hidden = true;
  elemento('logout-title').focus();
  aviso('logout-feedback', 'Encerrando sessão no serviço…');
  try {
    const resultado = await api.sair();
    mostrarAcesso(
      (resultado.pendencia_externa
        ? 'Sessão local encerrada. O encerramento no serviço externo permanece pendente.'
        : 'Sessão encerrada.') + alertaCadastro,
      resultado.pendencia_externa || saidaComCadastroIncerto ? 'error' : 'success',
    );
    saidaComCadastroIncerto = false;
  } catch (erro) {
    if (erro instanceof FalhaApi && erro.codigo === 'renovacao_incerta') {
      mostrarAcesso(
        `Não foi possível confirmar o encerramento no servidor. Para continuar, faça um novo acesso.${alertaCadastro}`,
        'error',
      );
      saidaComCadastroIncerto = false;
      return;
    }
    aviso(
      'logout-feedback',
      `Dados removidos desta tela. Não foi possível confirmar o encerramento no servidor. Tente novamente.${alertaCadastro}`,
      'error',
    );
    retryLogout.hidden = false;
    retryLogout.focus();
  } finally {
    logoutOcupado = false;
  }
}

async function revalidarAcesso(): Promise<void> {
  if (document.hidden || !sessao) return;
  if (verificandoSessao || cadastroOcupado) {
    revalidacaoPendente = true;
    return;
  }
  verificandoSessao = true;
  const versao = revisao;
  try {
    const atual = await api.consultarSessao();
    if (versao !== revisao) return;
    aplicarSessao(atual);
    await carregarPacientes();
    if (versao === revisao && sessao && !document.hidden && !revalidacaoPendente) {
      revalidacaoStatus.hidden = true;
      patientsView.hidden = false;
      sessionActions.hidden = false;
      if (focoAposLoginOculto) {
        focoAposLoginOculto = false;
        document.title = 'FFCMApp | Pacientes';
        elemento('patients-title').focus();
      }
    }
  } catch (erro) {
    if (versao !== revisao) return;
    const alertaCadastro =
      cadastroPendente || (sessao && usuariosComCadastroIncerto.has(sessao.usuario.id))
        ? ' Um cadastro ficou sem confirmação. Antes de repetir, confirme com a administração se já foi salvo.'
        : '';
    if (!exigeNovoAcesso(erro) && cadastroPendente && sessao) {
      cadastroEmRevalidacao = { usuarioId: sessao.usuario.id, pedido: cadastroPendente };
    }
    // Uma revalidação inconclusiva também não conserva a carteira exposta.
    mostrarAcesso(
      (exigeNovoAcesso(erro)
        ? 'Seu acesso precisa ser validado novamente. Entre com uma conta autorizada.'
        : 'Não foi possível revalidar seu acesso. Entre novamente quando o serviço estiver disponível.') +
        alertaCadastro,
      'error',
    );
  } finally {
    verificandoSessao = false;
    if (revalidacaoPendente) {
      revalidacaoPendente = false;
      void revalidarAcesso();
    }
  }
}

loginForm.addEventListener('submit', entrar);
togglePassword.addEventListener('click', () => {
  const mostrar = passwordInput.type === 'password';
  passwordInput.type = mostrar ? 'text' : 'password';
  togglePassword.textContent = mostrar ? 'Ocultar senha' : 'Mostrar senha';
  togglePassword.setAttribute('aria-pressed', String(mostrar));
});
createForm.addEventListener('submit', cadastrar);
logoutButton.addEventListener('click', sair);
retryLogout.addEventListener('click', sair);
reloadButton.addEventListener('click', () => {
  if (reloadButton.getAttribute('aria-disabled') === 'true') return;
  void carregarPacientes();
});
nextButton.addEventListener('click', () => {
  if (!proximoCursor || reloadButton.getAttribute('aria-disabled') === 'true') return;
  cursores = cursores.slice(0, pagina + 1);
  cursores.push(proximoCursor);
  pagina += 1;
  void carregarPacientes();
});
previousButton.addEventListener('click', () => {
  if (pagina === 0 || reloadButton.getAttribute('aria-disabled') === 'true') return;
  pagina -= 1;
  void carregarPacientes();
});
newPatientLink.addEventListener('click', (evento) => {
  evento.preventDefault();
  elemento('create-title').focus();
  registration.scrollIntoView({ block: 'start' });
});
for (const campo of [
  { input: nameInput, chave: 'nome', erro: 'name-error' },
  { input: preferredInput, chave: 'nome_preferencia', erro: 'preferred-error' },
  { input: birthInput, chave: 'data_nascimento', erro: 'birth-error' },
]) {
  campo.input.addEventListener('input', () => {
    if (!campo.input.hasAttribute('aria-invalid')) return;
    const cadastro = lerCadastro({
      nome: nameInput.value,
      nomePreferencia: preferredInput.value,
      nascimento: birthInput.value,
    });
    if (!cadastro.success && cadastro.error.issues.some((item) => item.path[0] === campo.chave))
      return;
    campo.input.removeAttribute('aria-invalid');
    elemento(campo.erro).textContent = '';
  });
}
document.addEventListener('visibilitychange', () => {
  if (sessao) {
    patientsView.hidden = true;
    sessionActions.hidden = true;
    revalidacaoStatus.hidden = false;
  }
  void revalidarAcesso();
});
window.addEventListener('beforeunload', (evento) => {
  if (!cadastroPendente && !cadastroEmRevalidacao) return;
  // Aviso é apenas mitigação: o navegador pode ignorá-lo e não há recuperação
  // após fechamento sem reconciliação autorizada no servidor.
  evento.preventDefault();
  evento.returnValue = '';
});
window.addEventListener('pagehide', () => {
  // Evita restaurar dados protegidos e credenciais pelo back/forward cache.
  if (cadastroEmRevalidacao) usuariosComCadastroIncerto.add(cadastroEmRevalidacao.usuarioId);
  cadastroEmRevalidacao = null;
  mostrarAcesso();
});
loginFields.disabled = false;
