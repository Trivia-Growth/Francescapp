import { criarCicloTarefaCuidado } from './ciclo-tarefa-cuidado.js';
import { montarAgendaIndividual } from './agenda-individual.js';
import { montarContatoPaciente } from './contatos-paciente.js';
import { montarSelecaoProfissional } from './selecao-profissional.js';
import { montarEdicaoPaciente } from './editar-paciente.js';
import type {
  sessaoNativaSchema,
  CriarPaciente,
  PacienteLista,
} from '../packages/contracts/src/index.js';
import { ClienteFFCM, exigeNovoAcesso, FalhaApi, mensagemFalha } from './api.js';
import { lerCadastro } from './cadastro.js';
import { montarAnamnese } from './anamnese.js';
import { criarCicloCadastro } from './ciclo-cadastro.js';
import { montarPlanoCuidado } from './plano-cuidado.js';
import { criarServicoPlanoHttp } from './servico-plano-http.js';
import { criarServicoEdicaoPacienteHttp } from './servico-edicao-paciente-http.js';
import { montarTarefasCuidado } from './tarefas-cuidado.js';
import { criarServicoTarefasHttp } from './servico-tarefas-http.js';
import { correspondeBuscaPacienteLocal } from './busca-pacientes-local.js';
import {
  criarAvatar,
  hashFicha,
  lerRotaFicha,
  montarFicha,
  type Ficha,
  type PacienteFicha,
  type SecaoFicha,
} from './ficha-paciente.js';
import { montarDadosFamiliar } from './secao-dados-familiar.js';
import { montarVisaoCaso } from './visao-caso.js';
import {
  criarCatalogoResponsaveis,
  rotulosSituacao,
  type ResponsavelOpcao,
} from './acompanhamento-caso.js';

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
const familiarForm = elemento<HTMLFormElement>('familiar-login-form');
const familiarFields = elemento<HTMLFieldSetElement>('familiar-login-fields');
const familiarEmail = elemento<HTMLInputElement>('familiar-email');
const familiarSenha = elemento<HTMLInputElement>('familiar-senha');
const familiarBotao = elemento<HTMLButtonElement>('familiar-login-submit');
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
const listaPacientes = elemento<HTMLUListElement>('patients-body');
const listLoading = elemento('list-loading');
const listEmpty = elemento('list-empty');
const pagination = elemento('pagination');
const registration = elemento('cadastro');
const newPatientLink = elemento<HTMLAnchorElement>('new-patient-link');
const listaView = elemento('lista-view');
const fichaView = elemento('ficha-view');
const crumbPaciente = elemento('crumb-paciente');
const buscaCampo = elemento<HTMLInputElement>('busca-pacientes');
const buscaVazia = elemento('busca-vazia');

const descarteCadastro =
  'Há alterações de cadastro não confirmadas. Ao sair, elas serão descartadas e um salvamento incerto não poderá ser confirmado nesta tela. Deseja continuar?';
const descartePlano =
  'Há alterações do plano não confirmadas. Ao sair, elas serão descartadas e um salvamento incerto não poderá ser confirmado nesta tela. Deseja continuar?';
const descarteAnamnese =
  'Há alterações de anamnese não confirmadas. Ao sair, elas serão descartadas e um salvamento incerto não poderá ser confirmado nesta tela. Deseja continuar?';
const descarteTarefa = 'Há dados de tarefa não confirmados. Deseja sair?';
const descarteEquipe =
  'Há um motivo de concessão não confirmado. Ao sair, ele será descartado. Deseja continuar?';

let ficha: Ficha | null = null;
let fichaPaciente: PacienteFicha | null = null;
let fichaAssinatura = '';
let consultaFicha = 0;
let planoAberto: { pacienteId: string; servico: ReturnType<typeof criarServicoPlanoHttp> } | null =
  null;
let edicaoDisponivel = false;
let pacientesDaPagina: PacienteLista[] = [];
let buscaTexto = '';

function identidadeAtual(): { usuario_id: string; session_id: string } | null {
  return sessao ? { usuario_id: sessao.usuario.id, session_id: sessao.session_id } : null;
}

function pendenciaFicha(): { secao: string; mensagem: string } | null {
  return ficha?.pendencia() ?? null;
}

function assinaturaSessao(atual: Sessao): string {
  return [
    atual.usuario.perfil,
    atual.capacidades.includes('administrar_cadastro'),
    atual.capacidades.includes('administrar_concessoes'),
  ].join('|');
}

function registrarRota(id: string, secao: string, empilhar: boolean): void {
  const endereco = `${window.location.pathname}${window.location.search}${hashFicha(id, secao)}`;
  if (empilhar) window.history.pushState(window.history.state, '', endereco);
  else window.history.replaceState(window.history.state, '', endereco);
}

function limparRota(): void {
  if (!window.location.hash) return;
  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${window.location.search}`,
  );
}

function fecharFicha(): void {
  consultaFicha += 1;
  ficha?.desmontar();
  ficha = null;
  fichaPaciente = null;
  planoAberto = null;
  fichaView.hidden = true;
  listaView.hidden = false;
  crumbPaciente.hidden = true;
  crumbPaciente.textContent = '';
}

function voltarParaLista(): void {
  const id = fichaPaciente?.id;
  fecharFicha();
  limparRota();
  aviso('workspace-feedback', '');
  const linha = id ? listaPacientes.querySelector<HTMLElement>(`[data-paciente-id="${id}"]`) : null;
  (linha ?? elemento('patients-title')).focus();
}

function montarSecaoTarefas(
  raiz: HTMLElement,
  pacienteId: string,
  pendente: (valor: boolean) => void,
): () => void {
  const servicoTarefas = criarServicoTarefasHttp(identidadeAtual);
  // Escrita permanece indisponível até existir capability validada no servidor.
  const escritaDisponivel = false;
  const cicloTarefas = escritaDisponivel
    ? criarCicloTarefaCuidado({
        identidadeAtual,
        consultar: () => api.consultarBarreiraTarefa(),
        reservar: async (entrada) => (await api.reservarBarreiraTarefa(entrada)).estado,
        encerrar: async (entrada) => (await api.encerrarBarreiraTarefa(entrada)).estado,
        reconhecer: async (entrada) => (await api.reconhecerBarreiraTarefa(entrada)).estado,
        gravar: async ({
          paciente_id,
          tarefa_id,
          versao_esperada,
          tarefa,
          chave,
          reserva_id,
          epoca,
        }) => {
          const reserva = { reserva_id, geracao_reserva: epoca };
          if (versao_esperada === 0)
            await servicoTarefas.criarTarefa(paciente_id, tarefa_id, chave, tarefa, reserva);
          else
            await servicoTarefas.atualizarTarefa(
              paciente_id,
              tarefa_id,
              versao_esperada,
              chave,
              tarefa,
              reserva,
            );
        },
      })
    : null;
  return montarTarefasCuidado(
    raiz,
    pacienteId,
    {
      consultarTarefas: servicoTarefas.consultarTarefas,
      ...(cicloTarefas
        ? {
            ciclo: cicloTarefas,
            criarTarefa: async (paciente, tarefa, _chave, dados) => {
              await cicloTarefas.gravar(paciente, tarefa, 0, dados);
            },
            atualizarTarefa: async (paciente, tarefa, versao, _chave, dados) => {
              await cicloTarefas.gravar(paciente, tarefa, versao, dados);
            },
          }
        : {}),
    },
    acessoPerdido,
    pendente,
  );
}

function montarSecaoCadastro(
  raiz: HTMLElement,
  pacienteId: string,
  pendente: (valor: boolean) => void,
  listarResponsaveis?: () => Promise<ResponsavelOpcao[]>,
): () => void {
  const estado = { edicao: false, contato: false };
  const sincronizar = () => pendente(estado.edicao || estado.contato);
  const edicaoRaiz = document.createElement('div');
  const contatoRaiz = document.createElement('div');
  contatoRaiz.className = 'ficha-subsecao';
  raiz.replaceChildren(edicaoRaiz, contatoRaiz);
  let desmontarEdicao: (() => void) | null = null;
  if (edicaoDisponivel) {
    desmontarEdicao = montarEdicaoPaciente(
      edicaoRaiz,
      pacienteId,
      {
        ...criarServicoEdicaoPacienteHttp(identidadeAtual),
        ...(listarResponsaveis ? { listarResponsaveis } : {}),
      },
      acessoPerdido,
      (valor) => {
        estado.edicao = valor;
        sincronizar();
      },
    );
  } else {
    const aviso = document.createElement('p');
    aviso.textContent = 'A edição do cadastro ainda não está disponível neste ambiente.';
    edicaoRaiz.append(aviso);
  }
  const desmontarContato = montarContatoPaciente(
    contatoRaiz,
    pacienteId,
    api,
    acessoPerdido,
    (valor) => {
      estado.contato = valor;
      sincronizar();
    },
  );
  return () => {
    desmontarEdicao?.();
    desmontarContato();
  };
}

function secoesDaFicha(paciente: PacienteFicha, atual: Sessao): SecaoFicha[] {
  if (atual.usuario.perfil === 'familia')
    return [
      {
        id: 'dados',
        rotulo: 'Dados do paciente',
        montar: (raiz) => montarDadosFamiliar(raiz, paciente.id, api, acessoPerdido),
      },
    ];
  const administraCadastro =
    atual.usuario.perfil === 'administrador' && atual.capacidades.includes('administrar_cadastro');
  const administraConcessoes =
    atual.usuario.perfil === 'administrador' &&
    atual.capacidades.includes('administrar_concessoes');
  const secoes: SecaoFicha[] = [
    {
      id: 'visao',
      rotulo: 'Visão do caso',
      montar: (raiz) =>
        montarVisaoCaso(
          raiz,
          paciente,
          {
            objetivos: criarServicoPlanoHttp(identidadeAtual),
            anamnese: api,
            ...(administraCadastro && edicaoDisponivel
              ? {
                  situacao: {
                    consultarPaciente: (id: string) => api.consultarPaciente(id),
                    ...(administraConcessoes
                      ? {
                          listarResponsaveis: criarCatalogoResponsaveis((cursor) =>
                            api.listarProfissionais(cursor),
                          ),
                        }
                      : {}),
                  },
                }
              : {}),
            ...(atual.usuario.perfil === 'profissional'
              ? { tarefas: criarServicoTarefasHttp(identidadeAtual) }
              : {}),
          },
          acessoPerdido,
        ),
    },
    {
      id: 'anamnese',
      rotulo: 'Anamnese',
      descarte: descarteAnamnese,
      montar: (raiz, pendente) =>
        montarAnamnese(
          raiz,
          paciente.id,
          api,
          acessoPerdido,
          pendente,
          api
            .disponibilidadeHistoricoAnamnese()
            .then((resultado) => resultado.disponivel)
            .catch(() => false),
        ),
    },
    {
      id: 'plano',
      rotulo: 'Plano de cuidado',
      descarte: descartePlano,
      montar: (raiz, pendente) => {
        const servico = criarServicoPlanoHttp(identidadeAtual);
        planoAberto = { pacienteId: paciente.id, servico };
        const desmontar = montarPlanoCuidado(raiz, paciente.id, servico, acessoPerdido, pendente);
        return () => {
          desmontar();
          planoAberto = null;
        };
      },
    },
  ];
  if (atual.usuario.perfil === 'profissional')
    secoes.push({
      id: 'tarefas',
      rotulo: 'Tarefas',
      descarte: descarteTarefa,
      montar: (raiz, pendente) => montarSecaoTarefas(raiz, paciente.id, pendente),
    });
  if (administraCadastro)
    secoes.push({
      id: 'cadastro',
      rotulo: 'Cadastro',
      descarte: descarteCadastro,
      montar: (raiz, pendente) =>
        montarSecaoCadastro(
          raiz,
          paciente.id,
          pendente,
          administraConcessoes
            ? criarCatalogoResponsaveis((cursor) => api.listarProfissionais(cursor))
            : undefined,
        ),
    });
  if (administraConcessoes)
    secoes.push({
      id: 'equipe',
      rotulo: 'Equipe com acesso',
      descarte: descarteEquipe,
      montar: (raiz, pendente) =>
        montarSelecaoProfissional(raiz, paciente.id, api, acessoPerdido, pendente),
    });
  secoes.push(
    { id: 'diario', rotulo: 'Diário', montar: null },
    { id: 'rede', rotulo: 'Rede de cuidado', montar: null },
  );
  return secoes;
}

function abrirFicha(paciente: PacienteFicha, secao: string | undefined, empilhar: boolean): void {
  const atual = sessao;
  if (!atual) return;
  fecharFicha();
  fichaPaciente = paciente;
  fichaAssinatura = assinaturaSessao(atual);
  aviso('workspace-feedback', '');
  listaView.hidden = true;
  fichaView.hidden = false;
  crumbPaciente.textContent = paciente.nome;
  crumbPaciente.hidden = false;
  let primeira = empilhar;
  ficha = montarFicha({
    raiz: fichaView,
    paciente,
    secoes: secoesDaFicha(paciente, atual),
    ...(secao ? { secaoInicial: secao } : {}),
    confirmar: (mensagem) => window.confirm(mensagem),
    aoSelecionar: (escolhida) => {
      registrarRota(paciente.id, escolhida, primeira);
      primeira = false;
    },
    aoVoltar: voltarParaLista,
  });
  ficha.focarTitulo();
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

let desmontarAgenda: (() => void) | null = null;
let sessaoAgenda: string | null = null;
function fecharAgenda(): void {
  desmontarAgenda?.();
  desmontarAgenda = null;
  sessaoAgenda = null;
  elemento('agenda-individual').hidden = true;
}

function apagarPacientes(): void {
  fecharAgenda();
  fecharFicha();
  listaPacientes.replaceChildren();
  listaPacientes.hidden = true;
  pacientesDaPagina = [];
  buscaTexto = '';
  buscaCampo.value = '';
  elemento('busca').hidden = true;
  buscaVazia.hidden = true;
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
  listaPacientes.removeAttribute('aria-busy');
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
  familiarForm.reset();
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
  const secaoPendente = pendenciaFicha()?.secao;
  const alertaCadastro = cadastroPendente
    ? ' Um cadastro ficou sem confirmação. Confirme a situação por canal autorizado antes de cadastrá-lo novamente.'
    : '';
  const alertaPlano =
    secaoPendente === 'plano'
      ? ' O rascunho do plano foi descartado. Confirme a situação antes de repetir um salvamento.'
      : '';
  const alertaTarefa =
    secaoPendente === 'tarefas'
      ? ' Uma tarefa ficou sem confirmação. Confira a situação antes de tentar criá-la novamente.'
      : '';
  mostrarAcesso(
    `Seu acesso precisa ser validado novamente. Entre com uma conta autorizada.${alertaCadastro}${alertaPlano}${alertaTarefa}`,
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
      sessao.usuario.perfil !== atual.usuario.perfil ||
      atual.usuario.perfil === 'familia')
  )
    fecharFicha();
  else if (ficha && fichaAssinatura !== assinaturaSessao(atual)) {
    fecharFicha();
    aviso('workspace-feedback', 'Seu acesso foi atualizado. Abra a ficha novamente.');
  }
  sessao = atual;
  let acessoGoogle = false;
  try {
    acessoGoogle = sessionStorage.getItem('modo-acesso') === 'google';
  } catch {
    /* acesso indisponível */
  }
  if (atual.usuario.perfil === 'profissional' && acessoGoogle) {
    if (sessaoAgenda !== atual.session_id) {
      fecharAgenda();
      sessaoAgenda = atual.session_id;
      elemento('agenda-individual').hidden = false;
      desmontarAgenda = montarAgendaIndividual(
        elemento('agenda-individual'),
        atual.session_id,
        atual.usuario.id,
        (cursor) => api.listarPacientes(cursor),
      );
    }
  } else fecharAgenda();
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
    if (await carregarPacientes()) await abrirFichaPelaRota();
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

async function entrarFamiliar(evento: SubmitEvent): Promise<void> {
  evento.preventDefault();
  if (loginOcupado) return;
  loginOcupado = true;
  loginFields.disabled = familiarFields.disabled = true;
  familiarBotao.textContent = 'Entrando…';
  aviso('familiar-feedback', 'Verificando credenciais e autorização…');
  const email = familiarEmail.value.trim();
  let senha = familiarSenha.value;
  familiarForm.reset();
  const versao = revisao;
  try {
    const atual = await api.entrarFamiliar(email, senha);
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
    aviso('familiar-feedback', '');
    elemento('patients-title').focus();
    if (await carregarPacientes()) await abrirFichaPelaRota();
  } catch (erro) {
    if (versao !== revisao) return;
    api.limpar();
    aviso(
      'familiar-feedback',
      exigeNovoAcesso(erro)
        ? 'Entrada não autorizada. Confira a conta e sua liberação de acesso.'
        : mensagemFalha(erro),
      'error',
    );
  } finally {
    senha = '';
    loginOcupado = false;
    loginFields.disabled = familiarFields.disabled = false;
    familiarBotao.textContent = 'Entrar';
  }
}

function linhaPaciente(paciente: PacienteLista): HTMLLIElement {
  const item = document.createElement('li');
  const abrir = document.createElement('button');
  abrir.type = 'button';
  abrir.className = 'pessoa';
  abrir.dataset.pacienteId = paciente.id;
  // Só o Administrador recebe a situação; sem o campo, a linha não indica nada.
  const rotuloSituacao =
    paciente.situacao === undefined
      ? null
      : paciente.situacao === null
        ? 'Situação a completar'
        : `Situação: ${rotulosSituacao[paciente.situacao]}`;
  abrir.setAttribute(
    'aria-label',
    rotuloSituacao
      ? `Abrir ficha de ${paciente.nome}. ${rotuloSituacao}.`
      : `Abrir ficha de ${paciente.nome}`,
  );
  const texto = document.createElement('span');
  texto.className = 'pessoa-texto';
  const nome = document.createElement('span');
  nome.className = 'pessoa-nome';
  nome.textContent = paciente.nome;
  const preferencia = document.createElement('span');
  preferencia.className = 'pessoa-preferencia';
  preferencia.textContent = paciente.nome_preferencia
    ? `Preferência: ${paciente.nome_preferencia}`
    : 'Preferência não informada';
  texto.append(nome, preferencia);
  if (rotuloSituacao) {
    const situacao = document.createElement('span');
    situacao.className = 'pessoa-situacao';
    situacao.dataset.situacao = paciente.situacao ?? 'completar';
    situacao.textContent = rotuloSituacao;
    texto.append(situacao);
  }
  const seta = document.createElement('span');
  seta.className = 'pessoa-seta';
  seta.setAttribute('aria-hidden', 'true');
  abrir.append(criarAvatar(paciente.nome), texto, seta);
  abrir.addEventListener('click', () => {
    if (!sessao) return;
    abrirFicha(
      { id: paciente.id, nome: paciente.nome, nome_preferencia: paciente.nome_preferencia },
      undefined,
      true,
    );
  });
  item.append(abrir);
  return item;
}

function pacientesFiltrados(): PacienteLista[] {
  if (!buscaTexto.trim()) return pacientesDaPagina;
  return pacientesDaPagina.filter((paciente) =>
    correspondeBuscaPacienteLocal(
      {
        name: paciente.nome,
        ...(paciente.nome_preferencia ? { preferredName: paciente.nome_preferencia } : {}),
      },
      buscaTexto,
    ),
  );
}

function renderizarLista(): void {
  const itens = pacientesFiltrados();
  listaPacientes.replaceChildren(...itens.map(linhaPaciente));
  listaPacientes.hidden = itens.length === 0;
  elemento('busca').hidden = pacientesDaPagina.length === 0;
  buscaVazia.hidden = !(pacientesDaPagina.length > 0 && itens.length === 0);
}

async function abrirFichaPelaRota(): Promise<void> {
  const rota = lerRotaFicha(window.location.hash);
  const atualSessao = sessao;
  if (!rota || !atualSessao || ficha) return;
  const versao = revisao;
  const numero = ++consultaFicha;
  const atual = () => versao === revisao && numero === consultaFicha && !ficha && sessao !== null;
  try {
    // Só o Administrador e a Família têm rota para consultar um paciente fora da página
    // carregada; negar a Profissional não pode ser confundido com perda de acesso.
    const perfil = atualSessao.usuario.perfil;
    const paciente =
      pacientesDaPagina.find((item) => item.id === rota.id) ??
      (perfil === 'familia'
        ? await api.consultarPacienteFamiliar(rota.id)
        : perfil === 'administrador'
          ? await api.consultarPaciente(rota.id)
          : null);
    if (!atual()) return;
    if (!paciente) {
      limparRota();
      aviso(
        'workspace-feedback',
        'Não foi possível reabrir a ficha. Escolha o paciente na lista.',
        'error',
      );
      return;
    }
    if (paciente.id !== rota.id) throw new Error('Paciente retornado não corresponde à consulta.');
    abrirFicha(
      { id: paciente.id, nome: paciente.nome, nome_preferencia: paciente.nome_preferencia },
      rota.secao,
      false,
    );
  } catch (erro) {
    if (!atual() || acessoPerdido(erro)) return;
    limparRota();
    aviso(
      'workspace-feedback',
      `${mensagemFalha(erro)} Escolha o paciente na lista para abrir a ficha.`,
      'error',
    );
  }
}

async function carregarPacientes(): Promise<boolean> {
  if (!sessao) return false;
  const versao = revisao;
  const numeroConsulta = ++consulta;
  const atual = () => versao === revisao && numeroConsulta === consulta && sessao !== null;
  listaPacientes.hidden = true;
  buscaVazia.hidden = true;
  listEmpty.hidden = true;
  listLoading.hidden = false;
  reloadButton.setAttribute('aria-disabled', 'true');
  previousButton.setAttribute('aria-disabled', 'true');
  nextButton.setAttribute('aria-disabled', 'true');
  listaPacientes.setAttribute('aria-busy', 'true');
  aviso('list-status', 'Consultando pacientes…');
  try {
    const [resultado, disponibilidade] = await Promise.all([
      api.listarPacientes(cursores[pagina]),
      sessao.usuario.perfil === 'administrador' &&
      sessao.capacidades.includes('administrar_cadastro')
        ? api.disponibilidadeEdicao().catch(() => ({ disponivel: false }))
        : Promise.resolve({ disponivel: false }),
    ]);
    if (!atual()) return false;
    edicaoDisponivel = disponibilidade.disponivel;
    pacientesDaPagina = resultado.itens;
    renderizarLista();
    proximoCursor = resultado.proximo_cursor;
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
      listaPacientes.removeAttribute('aria-busy');
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
  const pendencia = pendenciaFicha();
  if (logoutOcupado || (pendencia && !window.confirm(pendencia.mensagem))) return;
  limparRota();
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
          const rascunhoDescartado = pendenciaFicha()?.secao === 'plano';
          ficha?.selecionar('visao', { confirmar: false });
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
      ficha?.remontarSecao();
      if (focoAposLoginOculto) {
        focoAposLoginOculto = false;
        document.title = 'FFCMApp | Pacientes';
        elemento(ficha ? 'ficha-title' : 'patients-title').focus();
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
familiarForm.addEventListener('submit', entrarFamiliar);
familiarFields.disabled = false;
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
buscaCampo.addEventListener('input', () => {
  buscaTexto = buscaCampo.value;
  renderizarLista();
  if (buscaTexto.trim())
    aviso(
      'list-status',
      `${pacientesFiltrados().length} de ${pacientesDaPagina.length} pacientes desta página correspondem à busca.`,
    );
  else
    aviso(
      'list-status',
      `${pacientesDaPagina.length} ${pacientesDaPagina.length === 1 ? 'paciente nesta página' : 'pacientes nesta página'}.`,
    );
});
window.addEventListener('popstate', () => {
  if (!sessao) return;
  const rota = lerRotaFicha(window.location.hash);
  if (rota) {
    if (!ficha) void abrirFichaPelaRota();
    return;
  }
  if (!ficha || !fichaPaciente) return;
  const pendencia = pendenciaFicha();
  if (pendencia && !window.confirm(pendencia.mensagem)) {
    registrarRota(fichaPaciente.id, ficha.secaoAtual(), true);
    return;
  }
  voltarParaLista();
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
  // A visão do caso reúne dados de vários serviços: não fica no DOM com a aba oculta.
  if (document.hidden && ficha?.secaoAtual() === 'visao') ficha.limparSecao();
  if (sessao) {
    if (fichaView.contains(document.activeElement)) focoAposLoginOculto = true;
    patientsView.hidden = true;
    sessionActions.hidden = true;
    revalidacaoStatus.hidden = false;
  }
  void revalidarAcesso();
});
window.addEventListener('beforeunload', (evento) => {
  if (!cadastroPendente && !cadastroEmRevalidacao && !pendenciaFicha()) return;
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
    if (await carregarPacientes()) await abrirFichaPelaRota();
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
