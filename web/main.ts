import { montarEdicaoPaciente } from './editar-paciente.js';
import type {
  sessaoNativaSchema,
  CriarPaciente,
  PacienteBasico,
} from '../packages/contracts/src/index.js';
import { ClienteFFCM, exigeNovoAcesso, FalhaApi, mensagemFalha } from './api.js';
import { lerCadastro } from './cadastro.js';
import { montarAnamnese } from './anamnese.js';
import { criarCicloCadastro } from './ciclo-cadastro.js';
import { montarPlanoCuidado } from './plano-cuidado.js';
import { criarServicoPlanoHttp } from './servico-plano-http.js';
import { criarServicoEdicaoPacienteHttp } from './servico-edicao-paciente-http.js';

function elemento<T extends HTMLElement>(id: string): T {
  const encontrado = document.getElementById(id);
  if (!encontrado) throw new Error('Elemento da interface indisponível.');
  return encontrado as T;
}

const api = new ClienteFFCM();
const urlInicial = new URL(window.location.href);
let retornoInvalido = false;
const retornosFluxo = urlInicial.searchParams.getAll('fluxo');
if (retornosFluxo.length) {
  let estadoConfirmado = false;
  try {
    const esperado = sessionStorage.getItem('fluxo-google');
    retornoInvalido =
      retornosFluxo.length !== 1 ||
      !esperado ||
      !/^[A-Za-z0-9_-]{22}$/.test(esperado) ||
      retornosFluxo[0] !== esperado;
    const modo = retornoInvalido ? 'bloqueada' : 'google';
    sessionStorage.setItem('modo-acesso', modo);
    estadoConfirmado = sessionStorage.getItem('modo-acesso') === modo;
    if (!estadoConfirmado) retornoInvalido = true;
  } catch {
    retornoInvalido = true;
  }
  if (estadoConfirmado) {
    urlInicial.searchParams.delete('fluxo');
    window.history.replaceState(
      window.history.state,
      '',
      `${urlInicial.pathname}${urlInicial.search}${urlInicial.hash}`,
    );
  }
}
const falhaGoogle =
  urlInicial.pathname === '/' && urlInicial.searchParams.get('acesso') === 'indisponivel';
if (falhaGoogle) {
  urlInicial.searchParams.delete('acesso');
  window.history.replaceState(
    window.history.state,
    '',
    `${urlInicial.pathname}${urlInicial.search}${urlInicial.hash}`,
  );
}
const loginView = elemento('login-view');
const patientsView = elemento('patients-view');
const logoutView = elemento('logout-view');
const revalidacaoStatus = elemento('revalidacao-status');
const loginForm = elemento<HTMLFormElement>('login-form');
const googleForm = elemento<HTMLFormElement>('google-login-form');
googleForm.addEventListener('submit', (evento) => {
  try {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const fluxo = btoa(String.fromCharCode(...bytes))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '');
    sessionStorage.setItem('modo-acesso', 'bloqueada');
    sessionStorage.setItem('fluxo-google', fluxo);
    if (sessionStorage.getItem('fluxo-google') !== fluxo) throw new Error();
    elemento<HTMLInputElement>('google-fluxo').value = fluxo;
  } catch {
    evento.preventDefault();
    aviso(
      'login-feedback',
      'Não foi possível iniciar a entrada com Google. Tente novamente.',
      'error',
    );
  }
});
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
const edicaoPanel = elemento('edicao-panel');
const edicaoRaiz = elemento('edicao-raiz');
let desmontarEdicao: (() => void) | null = null;
let edicaoPendente = false;
function confirmarDescarteEdicao(): boolean {
  return (
    !edicaoPendente ||
    window.confirm(
      'Há alterações de cadastro não confirmadas. Ao sair, elas serão descartadas e um salvamento incerto não poderá ser confirmado nesta tela. Deseja continuar?',
    )
  );
}
function fecharEdicao(): void {
  desmontarEdicao?.();
  desmontarEdicao = null;
  edicaoPendente = false;
  edicaoPanel.hidden = true;
}
const anamnesePanel = elemento('anamnese-panel');
const anamneseRaiz = elemento('anamnese-raiz');
const anamneseTitulo = elemento('anamnese-paciente');
const fecharAnamneseBotao = elemento<HTMLButtonElement>('fechar-anamnese');
let desmontarAnamnese: (() => void) | null = null;
let anamnesePendente = false;
const planoPanel = elemento('plano-panel');
const planoRaiz = elemento('plano-raiz');
const planoTitulo = elemento('plano-paciente');
const fecharPlanoBotao = elemento<HTMLButtonElement>('fechar-plano');
let desmontarPlano: (() => void) | null = null;
let planoPendente = false;
let acaoPacienteAnterior: HTMLButtonElement | null = null;
let planoAberto: { pacienteId: string; servico: ReturnType<typeof criarServicoPlanoHttp> } | null =
  null;

function confirmarDescartePlano(): boolean {
  return (
    !planoPendente ||
    window.confirm(
      'Há alterações do plano não confirmadas. Ao sair, elas serão descartadas e um salvamento incerto não poderá ser confirmado nesta tela. Deseja continuar?',
    )
  );
}

function fecharPlano(): void {
  desmontarPlano?.();
  desmontarPlano = null;
  planoAberto = null;
  planoPendente = false;
  planoPanel.hidden = true;
  planoTitulo.textContent = '';
}

function confirmarDescarteAnamnese(): boolean {
  return (
    !anamnesePendente ||
    window.confirm(
      'Há alterações de anamnese não confirmadas. Ao sair, elas serão descartadas e um salvamento incerto não poderá ser confirmado nesta tela. Deseja continuar?',
    )
  );
}

function fecharAnamnese(): void {
  desmontarAnamnese?.();
  desmontarAnamnese = null;
  anamnesePendente = false;
  anamnesePanel.hidden = true;
  anamneseTitulo.textContent = '';
}

type Sessao = ReturnType<typeof sessaoNativaSchema.parse>;
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
let ciclo: ReturnType<typeof criarCicloCadastro> | null = null;
let cadastroLiberado = false;
const usuariosCadastroSemConfirmacao = new Set<string>();
const recuperarCadastro = document.createElement('button');
recuperarCadastro.type = 'button';
recuperarCadastro.hidden = true;
registration.append(recuperarCadastro);

async function consultarCadastro(): Promise<void> {
  const atual = ciclo;
  if (!atual) return;
  cadastroLiberado = false;
  createFields.disabled = true;
  createButton.disabled = true;
  if (document.activeElement === recuperarCadastro) elemento('create-title').focus();
  recuperarCadastro.hidden = true;
  try {
    const situacao = await atual.consultar();
    if (ciclo !== atual) return;
    if (situacao.resultado_pendente) {
      const confirmado = situacao.resultado_pendente.resultado === 'confirmada';
      aviso(
        'create-feedback',
        confirmado
          ? 'Cadastro anterior confirmado. Consulte a lista antes de cadastrar novamente.'
          : 'Cadastro anterior cancelado.',
        'neutral',
      );
      recuperarCadastro.textContent = 'Reconhecer resultado';
      recuperarCadastro.dataset.acao = 'reconhecer';
    } else {
      aviso(
        'create-feedback',
        'Para liberar o cadastro, confirme o encerramento de tentativas anteriores. Isso também afeta outras abas da sua conta.',
      );
      recuperarCadastro.textContent = 'Confirmar encerramento';
      recuperarCadastro.dataset.acao = 'encerrar';
    }
    recuperarCadastro.hidden = false;
  } catch (erro) {
    if (ciclo !== atual || acessoPerdido(erro)) return;
    aviso(
      'create-feedback',
      'Não foi possível consultar a situação do cadastro. Tente novamente.',
      'error',
    );
    recuperarCadastro.textContent = 'Consultar situação';
    recuperarCadastro.dataset.acao = 'consultar';
    recuperarCadastro.hidden = false;
  }
}

recuperarCadastro.addEventListener('click', async () => {
  const atual = ciclo;
  if (!atual) return;
  const focoNaRecuperacao = document.activeElement === recuperarCadastro;
  const tituloCadastro = elemento('create-title');
  if (focoNaRecuperacao) tituloCadastro.focus();
  recuperarCadastro.disabled = true;
  let confirmada = false;
  try {
    if (recuperarCadastro.dataset.acao === 'consultar') {
      await consultarCadastro();
      return;
    }
    if (recuperarCadastro.dataset.acao === 'reconhecer') await atual.reconhecer();
    else await atual.encerrar();
    confirmada = true;
    const situacao = await atual.consultar();
    if (ciclo !== atual) return;
    if (situacao.reserva || situacao.resultado_pendente) {
      await consultarCadastro();
      return;
    }
    atual.liberar();
    if (sessao) usuariosCadastroSemConfirmacao.delete(sessao.usuario.id);
    cadastroLiberado = true;
    createFields.disabled = false;
    createButton.disabled = false;
    recuperarCadastro.hidden = true;
    aviso('create-feedback', 'Cadastro disponível.', 'success');
  } catch (erro) {
    if (ciclo !== atual || acessoPerdido(erro)) return;
    if (confirmada) {
      recuperarCadastro.dataset.acao = 'consultar';
      recuperarCadastro.textContent = 'Consultar situação';
    }
    aviso('create-feedback', 'Não foi possível confirmar a operação. Tente novamente.', 'error');
    recuperarCadastro.hidden = false;
  } finally {
    recuperarCadastro.disabled = false;
    if (focoNaRecuperacao && document.activeElement === tituloCadastro) {
      if (recuperarCadastro.hidden) createButton.focus();
      else recuperarCadastro.focus();
    }
  }
});

function aviso(id: string, texto: string, tom: 'error' | 'success' | 'neutral' = 'neutral') {
  const destino = elemento(id);
  destino.textContent = texto;
  destino.dataset.tone = tom;
}

function apagarPacientes(): void {
  fecharAnamnese();
  fecharPlano();
  fecharEdicao();
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
  ciclo = null;
  cadastroLiberado = false;
  recuperarCadastro.hidden = true;
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
  const alertaPlano = planoPendente
    ? ' O rascunho do plano foi descartado. Confirme a situação antes de repetir um salvamento.'
    : '';
  mostrarAcesso(
    `Seu acesso precisa ser validado novamente. Entre com uma conta autorizada.${alertaCadastro}${alertaPlano}`,
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
  if (
    sessao &&
    (sessao.session_id !== atual.session_id ||
      sessao.usuario.id !== atual.usuario.id ||
      atual.usuario.perfil === 'familia')
  ) {
    fecharAnamnese();
    fecharPlano();
    fecharEdicao();
  }
  if (
    atual.usuario.perfil !== 'administrador' ||
    !atual.capacidades.includes('administrar_cadastro')
  )
    fecharEdicao();
  sessao = atual;
  elemento('anamnese-coluna').hidden = atual.usuario.perfil === 'familia';
  const podeCadastrar =
    atual.usuario.perfil === 'administrador' && atual.capacidades.includes('administrar_cadastro');
  if (podeCadastrar && !ciclo) {
    ciclo = criarCicloCadastro({
      identidadeAtual: () =>
        sessao ? { usuario_id: sessao.usuario.id, session_id: sessao.session_id } : null,
      consultar: () => api.consultarBarreira(),
      reservar: async (entrada) => (await api.reservarBarreira(entrada)).estado,
      criar: ({ entrada, chave, reserva_id, geracao_reserva }) =>
        api.criarPaciente(entrada, chave, { reserva_id, geracao_reserva }),
      encerrar: async (entrada) => (await api.encerrarBarreira(entrada)).estado,
      reconhecer: async (entrada) => (await api.reconhecerBarreira(entrada)).estado,
    });
    void consultarCadastro();
  } else if (!podeCadastrar) {
    ciclo = null;
    cadastroLiberado = false;
    recuperarCadastro.hidden = true;
  }
  if (cadastroEmRevalidacao) {
    // A reconciliação no servidor substitui a repetição de dados em memória.
    cadastroEmRevalidacao = null;
  }
  if (!podeCadastrar) {
    if (cadastroPendente) usuariosComCadastroIncerto.add(atual.usuario.id);
    createForm.reset();
    cadastroPendente = null;
    aviso('create-feedback', '');
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

function atendimentoJaAberto(): boolean {
  const titulo = !anamnesePanel.hidden
    ? 'anamnese-title'
    : !planoPanel.hidden
      ? 'plano-title'
      : !edicaoPanel.hidden
        ? 'edicao-title'
        : null;
  if (!titulo) return false;
  aviso('workspace-feedback', 'Feche o atendimento aberto antes de selecionar outro.');
  elemento(titulo).focus();
  return true;
}

function linhaPaciente(paciente: PacienteBasico): HTMLTableRowElement {
  const linha = document.createElement('tr');
  const nome = document.createElement('td');
  nome.textContent = paciente.nome;
  const preferencia = document.createElement('td');
  preferencia.textContent = paciente.nome_preferencia ?? 'Não informado';
  linha.append(nome, preferencia);
  if (sessao && sessao.usuario.perfil !== 'familia') {
    const acao = document.createElement('td');
    const abrir = document.createElement('button');
    abrir.type = 'button';
    abrir.className = 'button-secondary';
    abrir.textContent = 'Abrir anamnese';
    abrir.setAttribute('aria-label', `Abrir anamnese de ${paciente.nome}`);
    abrir.addEventListener('click', () => {
      if (!sessao || sessao.usuario.perfil === 'familia' || atendimentoJaAberto()) return;
      aviso('workspace-feedback', '');
      acaoPacienteAnterior = abrir;
      anamneseTitulo.textContent = paciente.nome;
      anamnesePanel.hidden = false;
      desmontarAnamnese = montarAnamnese(
        anamneseRaiz,
        paciente.id,
        api,
        acessoPerdido,
        (pendente) => {
          anamnesePendente = pendente;
        },
      );
      elemento('anamnese-title').focus();
    });
    const abrirPlano = document.createElement('button');
    abrirPlano.type = 'button';
    abrirPlano.className = 'button-secondary';
    abrirPlano.textContent = 'Abrir plano de cuidado';
    abrirPlano.setAttribute('aria-label', `Abrir plano de cuidado de ${paciente.nome}`);
    abrirPlano.addEventListener('click', () => {
      if (!sessao || sessao.usuario.perfil === 'familia' || atendimentoJaAberto()) return;
      aviso('workspace-feedback', '');
      acaoPacienteAnterior = abrirPlano;
      planoTitulo.textContent = paciente.nome;
      planoPanel.hidden = false;
      const servico = criarServicoPlanoHttp(() =>
        sessao ? { usuario_id: sessao.usuario.id, session_id: sessao.session_id } : null,
      );
      planoAberto = { pacienteId: paciente.id, servico };
      desmontarPlano = montarPlanoCuidado(
        planoRaiz,
        paciente.id,
        servico,
        acessoPerdido,
        (pendente) => {
          planoPendente = pendente;
        },
      );
      elemento('plano-title').focus();
    });
    acao.append(abrir, abrirPlano);
    // A interface fica preparada, mas não deve anunciar rotas ainda inexistentes.
    const edicaoPacienteDisponivel = false;
    if (
      edicaoPacienteDisponivel &&
      sessao.usuario.perfil === 'administrador' &&
      sessao.capacidades.includes('administrar_cadastro')
    ) {
      const editar = document.createElement('button');
      editar.type = 'button';
      editar.className = 'button-secondary';
      editar.textContent = 'Editar cadastro';
      editar.setAttribute('aria-label', `Editar cadastro de ${paciente.nome}`);
      editar.addEventListener('click', () => {
        if (
          !sessao ||
          sessao.usuario.perfil !== 'administrador' ||
          !sessao.capacidades.includes('administrar_cadastro') ||
          !edicaoPanel.hidden ||
          !anamnesePanel.hidden ||
          !planoPanel.hidden
        )
          return;
        edicaoPanel.hidden = false;
        desmontarEdicao = montarEdicaoPaciente(
          edicaoRaiz,
          paciente.id,
          criarServicoEdicaoPacienteHttp(() =>
            sessao ? { usuario_id: sessao.usuario.id, session_id: sessao.session_id } : null,
          ),
          acessoPerdido,
          (pendente) => {
            edicaoPendente = pendente;
          },
        );
        elemento('edicao-title').focus();
      });
      acao.append(editar);
    }
    linha.append(acao);
  }
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
  if (cadastroOcupado || !sessao || registration.hidden || !cadastroLiberado || !ciclo) return;
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
    cadastroLiberado = false;
    usuariosCadastroSemConfirmacao.add(sessao.usuario.id);
    await ciclo.criar(pedido.entrada);
    if (versao !== revisao) return;
    if (sessao) usuariosCadastroSemConfirmacao.delete(sessao.usuario.id);
    cadastroPendente = null;
    createForm.reset();
    cursores = [undefined];
    pagina = 0;
    aviso('create-feedback', 'Paciente cadastrado.', 'success');
    void consultarCadastro();
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
    cadastroPendente = null;
    void consultarCadastro();
    aviso(
      'create-feedback',
      'Cadastro sem confirmação. Consulte a situação antes de tentar novamente.',
      'error',
    );
  } finally {
    if (versao === revisao) {
      cadastroOcupado = false;
      createFields.disabled = !cadastroLiberado;
      createButton.disabled = !cadastroLiberado;
      createButton.textContent = 'Cadastrar paciente';
      if (revalidacaoPendente) {
        revalidacaoPendente = false;
        void revalidarAcesso();
      }
    }
  }
}

async function sair(): Promise<void> {
  if (
    logoutOcupado ||
    !confirmarDescarteAnamnese() ||
    !confirmarDescartePlano() ||
    !confirmarDescarteEdicao()
  )
    return;
  logoutOcupado = true;
  ciclo = null;
  cadastroLiberado = false;
  recuperarCadastro.hidden = true;
  saidaComCadastroIncerto ||= Boolean(
    (sessao && usuariosCadastroSemConfirmacao.has(sessao.usuario.id)) ||
      cadastroPendente ||
      cadastroEmRevalidacao,
  );
  if (sessao && saidaComCadastroIncerto) usuariosComCadastroIncerto.add(sessao.usuario.id);
  const alertaCadastro = saidaComCadastroIncerto
    ? ' Um cadastro pode estar sem confirmação; não o recrie antes de consultar sua situação no aplicativo ou por canal autorizado.'
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
    const plano = planoAberto;
    if (plano) {
      try {
        await plano.servico.consultarObjetivos(plano.pacienteId);
      } catch (erro) {
        if (versao !== revisao) return;
        if (acessoPerdido(erro)) return;
        if (planoAberto === plano) {
          const rascunhoDescartado = planoPendente;
          fecharPlano();
          aviso(
            'workspace-feedback',
            rascunhoDescartado
              ? 'Não foi possível confirmar acesso ao plano. O rascunho foi descartado; confirme a situação antes de repetir um salvamento.'
              : 'Não foi possível confirmar acesso ao plano. Abra o plano novamente quando o serviço estiver disponível.',
            'error',
          );
        }
      }
    }
    if (versao !== revisao) return;
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
elemento<HTMLButtonElement>('fechar-edicao').addEventListener('click', () => {
  if (!confirmarDescarteEdicao()) return;
  fecharEdicao();
  void carregarPacientes();
  elemento('patients-title').focus();
});
fecharAnamneseBotao.addEventListener('click', () => {
  if (!confirmarDescarteAnamnese()) return;
  fecharAnamnese();
  aviso('workspace-feedback', '');
  if (acaoPacienteAnterior?.isConnected && !table.hidden) acaoPacienteAnterior.focus();
  else elemento('patients-title').focus();
  acaoPacienteAnterior = null;
});
fecharPlanoBotao.addEventListener('click', () => {
  if (!confirmarDescartePlano()) return;
  fecharPlano();
  aviso('workspace-feedback', '');
  if (acaoPacienteAnterior?.isConnected && !table.hidden) acaoPacienteAnterior.focus();
  else elemento('patients-title').focus();
  acaoPacienteAnterior = null;
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
  if (
    !cadastroPendente &&
    !cadastroEmRevalidacao &&
    !anamnesePendente &&
    !planoPendente &&
    !edicaoPendente
  )
    return;
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

async function restaurarSessao(): Promise<void> {
  if (sessao || loginOcupado || logoutOcupado || !logoutView.hidden) return;
  if (retornoInvalido) {
    mostrarAcesso('Não foi possível entrar com Google. Tente novamente.', 'error');
    return;
  }
  const versao = revisao;
  loginOcupado = true;
  loginFields.disabled = true;
  loginView.hidden = true;
  revalidacaoStatus.hidden = false;
  try {
    const atual = await api.consultarSessao();
    if (versao !== revisao) return;
    aplicarSessao(atual);
    if (falhaGoogle) {
      aviso(
        'workspace-feedback',
        'Não foi possível concluir a entrada com Google. Sua sessão anterior continua ativa.',
        'error',
      );
    }
    if (document.hidden) {
      focoAposLoginOculto = true;
      return;
    }
    revalidacaoStatus.hidden = true;
    patientsView.hidden = false;
    sessionActions.hidden = false;
    document.title = 'FFCMApp | Pacientes';
    await carregarPacientes();
  } catch (erro) {
    if (versao !== revisao) return;
    mostrarAcesso(
      erro instanceof FalhaApi && erro.status === 401
        ? falhaGoogle
          ? 'Não foi possível entrar com Google. Tente novamente.'
          : ''
        : exigeNovoAcesso(erro)
          ? 'Sua conta não possui acesso autorizado. Confira a liberação com a administração.'
          : 'Não foi possível verificar seu acesso. Tente novamente quando o serviço estiver disponível.',
      'error',
    );
  } finally {
    loginOcupado = false;
    loginFields.disabled = false;
  }
}

window.addEventListener('pageshow', (evento) => {
  if (evento.persisted) void restaurarSessao();
});
void restaurarSessao();
