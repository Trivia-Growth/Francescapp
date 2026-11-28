import { createElement, createRef, type ReactElement } from 'react';
import { criarServicoAcessosHttp } from './servico-acessos-http.js';
import { montarLoginInterno } from './login-interno.js';
import { iniciarAcao } from './esqueleto.js';
import { criarCicloTarefaCuidado } from './ciclo-tarefa-cuidado.js';
import { montarAgendaIndividual } from './agenda-individual.js';
import { montarContatoPaciente } from './contatos-paciente.js';
import { montarEdicaoPaciente } from './editar-paciente.js';
import type {
  sessaoNativaSchema,
  CriarPaciente,
  PacienteLista,
} from '../packages/contracts/src/index.js';
import { ClienteFFCM, exigeNovoAcesso, FalhaApi, mensagemFalha, semPermissao } from './api.js';
import { lerCadastro } from './cadastro.js';
import { montarCamposCasoNovo } from './campos-caso-novo.js';
import { criarCicloCadastro } from './ciclo-cadastro.js';
import { criarServicoPlanoHttp } from './servico-plano-http.js';
import {
  criarServicoEstadoEmocionalHttp,
  criarServicoModeloFormularioHttp,
  criarServicoPapelDeclaradoHttp,
} from './servico-catalogo-administrado-http.js';
import { criarServicoEdicaoPacienteHttp } from './servico-edicao-paciente-http.js';
import { montarTarefasCuidado } from './tarefas-cuidado.js';
import { criarServicoTarefasHttp } from './servico-tarefas-http.js';
import { montarTarefasComDisponibilidade } from './integracao-tarefas-disponibilidade.js';
import { correspondeBuscaPacienteLocal } from './busca-pacientes-local.js';
import {
  hashFicha,
  lerRotaFicha,
  type Ficha,
  type PacienteFicha,
  type SecaoFicha,
} from './ficha-paciente.js';
import { secaoInicialDaFicha, TelaFicha } from './ficha.js';
import { criarServicoSaudeHttp } from './servico-saude-http.js';
import { criarServicoEncaminhamentosHttp } from './servico-encaminhamentos-http.js';
import { criarServicoOrientacoesHttp } from './servico-orientacoes-http.js';
import { criarServicoDocumentoPacienteHttp } from './servico-documento-paciente-http.js';
import { documentoRedeCuidadoSchema } from '../packages/contracts/src/rede-cuidado.js';
import { documentoContextoCuidadoSchema } from '../packages/contracts/src/contexto-cuidado.js';
import { criarServicoPlanoCriseHttp } from './servico-plano-crise-http.js';
import { criarServicoHabilitacaoPlanoCriseHttp } from './servico-habilitacao-plano-crise-http.js';
import { criarServicoSubstituicaoCmHttp } from './servico-substituicao-cm-http.js';
import { criarServicoFinanceiroHttp } from './servico-financeiro-http.js';
import { criarAudienciaFinanceira } from './financeiro-audiencia.js';
import { montarTurnoComExecucao } from './turno-execucao-integracao.js';
import { montarExecucaoTurno } from './turno-execucao.js';
import { montarRelatoriosTurno } from './turno-execucao-relatorios.js';
import { criarServicoTurnoExecucaoHttp } from './servico-turno-execucao-http.js';
import { criarServicoFichaPlantaoHttp } from './servico-ficha-plantao-http.js';
import { criarServicoTurnoHttp } from './servico-turno-http.js';
import './turno-proprio.css';
import './turno-execucao.css';
import { montarConversaoDiario } from './conversao-diario.js';
import { criarServicoConversaoDiarioHttp } from './servico-conversao-diario-http.js';
import type { ConversaoEmTarefa } from './diario.js';
import { consultarDisponibilidadeDiario, criarServicoDiarioHttp } from './servico-diario-http.js';
import { botao } from './ponte/botao-imperativo.js';
import { criarServicoLinhaTempoHttp } from './servico-linha-tempo-http.js';
import { criarServicoExportacaoHttp } from './servico-exportacao-http.js';
import { criarServicoPreautorizacoesHttp } from './servico-preautorizacoes-http.js';
import {
  consultarDisponibilidadeDocumentos,
  criarServicoDocumentosHttp,
} from './servico-documentos-http.js';
import { criarServicoPendenciasHttp } from './servico-pendencias-http.js';
import { limparAparelho, montarEstadoDeRede, registrarCascaOffline } from './casca-offline.js';
import { criarServicoAvisosHttp } from './servico-avisos-http.js';
import { criarServicoAuditoriaHttp } from './servico-auditoria-http.js';
import { criarServicoRegrasAtendimentoHttp } from './servico-regras-atendimento-http.js';
import { gravarRota, iniciarCasca, lerRota } from './casca-react.js';
import type { DestinoCasca } from './navegacao-casca.js';
import { criarServicoSolicitacaoTitularHttp } from './servico-solicitacao-titular-http.js';
import { criarServicoSegredosIntegracoesHttp } from './servico-segredos-integracoes-http.js';
import { montarFiltrosCarteira } from './filtros-carteira.js';
import { entradaTranscricaoAudio } from './transcricao-audio.js';
import { criarServicoTranscricaoHttp } from './servico-transcricao-http.js';
import { confirmar } from './confirmacao.js';
import type { FiltrosCarteira } from '../packages/contracts/src/cadastro.js';
import { criarCatalogoResponsaveis, type ResponsavelOpcao } from './acompanhamento-caso.js';

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
/** Entrou no Google, mas aquela conta não tem acesso liberado. Distinto de `indisponivel`,
 * que é falha do serviço: aqui repetir não resolve, e a tela precisa dizer isso. */
const semAutorizacaoGoogle =
  urlInicial.pathname === '/' && urlInicial.searchParams.get('acesso') === 'sem_autorizacao';
if (falhaGoogle || semAutorizacaoGoogle) {
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
revalidacaoStatus.classList.add('revalidacao-loading');
const loginForm = elemento<HTMLFormElement>('login-form');
const familiarForm = elemento<HTMLFormElement>('familiar-login-form');
const familiarFields = elemento<HTMLFieldSetElement>('familiar-login-fields');
const familiarEmail = elemento<HTMLInputElement>('familiar-email');
const familiarSenha = elemento<HTMLInputElement>('familiar-senha');
const familiarBotao = elemento<HTMLButtonElement>('familiar-login-submit');
const googleForm = elemento<HTMLFormElement>('google-login-form');
googleForm.addEventListener('submit', (evento) => {
  if (loginOcupado) {
    evento.preventDefault();
    return;
  }
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
const loginInterno = montarLoginInterno(
  elemento('acesso-interno'),
  api,
  async (atual) => {
    aplicarSessao(atual);
    loginView.hidden = true;
    logoutView.hidden = true;
    if (document.hidden) {
      focoAposLoginOculto = true;
      patientsView.hidden = true;
      casca.atualizarNavegacao({ visivel: false });
      revalidacaoStatus.hidden = false;
      return;
    }
    patientsView.hidden = false;
    casca.atualizarNavegacao({ visivel: true });
    document.title = 'FFCMApp | Pacientes';
    if (await carregarPacientes()) await abrirFichaPelaRota();
    navegarPelaRota();
    focarDestinoDaCasca();
  },
  {
    podeIniciar: () => !loginOcupado,
    ocupacao: (valor) => {
      loginOcupado = valor;
      loginFields.disabled = familiarFields.disabled = valor;
      const botaoGoogle = googleForm.querySelector<HTMLButtonElement>('button[type=submit]');
      if (botaoGoogle) botaoGoogle.disabled = valor;
    },
  },
);
const retryLogout = elemento<HTMLButtonElement>('retry-logout');
const createForm = elemento<HTMLFormElement>('create-form');
const createFields = elemento<HTMLFieldSetElement>('create-fields');
const createButton = elemento<HTMLButtonElement>('create-submit');
const nameInput = elemento<HTMLInputElement>('patient-name');
const preferredInput = elemento<HTMLInputElement>('preferred-name');
// Um catálogo de equipe por sessão de Administrador; falha de consulta não fica guardada.
let catalogoCasoNovo: (() => Promise<ResponsavelOpcao[]>) | null = null;
let equipeCasoNovoPara: string | null = null;
const casoNovo = montarCamposCasoNovo(
  {
    contatos: elemento('contacts-list'),
    adicionar: elemento<HTMLButtonElement>('add-contact'),
    erroContatos: elemento('contacts-error'),
    nascimento: elemento('birth-date-controle'),
    situacao: elemento('case-status-controle'),
    responsavel: elemento('case-manager-controle'),
    estadoResponsavel: elemento('manager-state'),
    tentarNovamente: elemento<HTMLButtonElement>('manager-retry'),
  },
  () => (catalogoCasoNovo ? catalogoCasoNovo() : Promise.reject(new Error('Sem sessão'))),
);
export function desmontarCamposDeCadastro(): void {
  casoNovo.desmontar();
  fecharFicha();
  casca.encerrar();
}
const {
  nascimento: birthInput,
  situacao: situacaoInput,
  responsavel: responsavelInput,
} = casoNovo.campos;

function marcarInvalidezCadastro(input: HTMLInputElement | HTMLSelectElement, invalido: boolean) {
  const id = input.id;
  if (id === 'birth-date' || id === 'case-status' || id === 'case-manager') {
    casoNovo.marcarInvalido(id, invalido);
  } else if (invalido) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

function lerFormularioCadastro() {
  return lerCadastro({
    nome: nameInput.value,
    nomePreferencia: preferredInput.value,
    nascimento: birthInput.value,
    contatos: casoNovo.contatos(),
    situacao: casoNovo.situacao(),
    responsavelId: casoNovo.responsavelId(),
  });
}
function reiniciarFormularioCadastro(): void {
  createForm.reset();
  casoNovo.reiniciar();
}
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
const homeView = elemento('home-view');
const fichaView = elemento('ficha-view');
const buscaCampo = elemento<HTMLInputElement>('busca-pacientes');
const buscaVazia = elemento('busca-vazia');

// A navegação mantém os mesmos links e seu estado de autorização nas duas larguras.
let revisaoAvisos = 0;

function fecharGavetaLateral(): void {
  casca.fecharGaveta();
}

const descarteCadastro =
  'Há alterações de cadastro não confirmadas. Ao sair, elas serão descartadas e um salvamento incerto não poderá ser confirmado nesta tela. Deseja continuar?';
const descartePlano =
  'Há alterações do plano não confirmadas. Ao sair, elas serão descartadas e um salvamento incerto não poderá ser confirmado nesta tela. Deseja continuar?';
const descarteAnamnese =
  'Há alterações de anamnese não confirmadas. Ao sair, elas serão descartadas e um salvamento incerto não poderá ser confirmado nesta tela. Deseja continuar?';
const descarteTarefa = 'Há dados de tarefa não confirmados. Deseja sair?';
const descarteEquipe =
  'Há um motivo de concessão não confirmado. Ao sair, ele será descartado. Deseja continuar?';
const descarteSaude =
  'Há alterações do histórico de saúde não confirmadas. Ao sair, elas serão descartadas e um salvamento incerto não poderá ser confirmado nesta tela. Deseja continuar?';
const descarteCrise =
  'Há alterações do plano de crise não confirmadas. Ao sair, elas serão descartadas e um salvamento incerto não poderá ser confirmado nesta tela. Deseja continuar?';
const descarteDiario =
  'Há um registro do diário não confirmado. Ao sair, ele será descartado. Deseja continuar?';

/** Cada seção já descreve o que se perde ao sair; o que mudou foi onde a pergunta aparece.
 *  A frase final "Deseja continuar?" sai do texto porque os dois botões agora dizem, cada
 *  um, o que acontece ao serem escolhidos. */
function confirmarSaidaDaSecao(mensagem: string): Promise<boolean> {
  return confirmar({
    titulo: 'Sair e descartar o que ainda não foi confirmado?',
    detalhe: mensagem.replace(/\s*Deseja (continuar|sair)\?\s*$/, ''),
    acao: 'Sair e descartar',
    cancelar: 'Continuar nesta seção',
  });
}

// As áreas do diário vêm da configuração em banco (FR-009); enquanto a consulta não
// responde, a tela monta sem sugestão de área em vez de esperar. A consulta só sai quando
// alguém abre o diário: na tela de acesso não há sessão nem motivo para pedi-la.
let areasDiario: readonly string[] = [];
let areasDiarioPedidas = false;
function pedirAreasDoDiario(): void {
  if (areasDiarioPedidas) return;
  areasDiarioPedidas = true;
  void consultarDisponibilidadeDiario()
    .then(({ areas }) => {
      areasDiario = areas;
    })
    .catch(() => {
      areasDiario = [];
    });
}

// Mesmo desenho para as categorias de documento (FR-029): configuradas pela equipe, pedidas
// só quando alguém abre a aba.
let categoriasDocumento: readonly string[] = [];
let categoriasDocumentoPedidas = false;
function pedirCategoriasDeDocumento(): void {
  if (categoriasDocumentoPedidas) return;
  categoriasDocumentoPedidas = true;
  void consultarDisponibilidadeDocumentos()
    .then(({ categorias }) => {
      categoriasDocumento = categorias;
    })
    .catch(() => {
      categoriasDocumento = [];
    });
}

let ficha: Ficha | null = null;
let fichaPaciente: PacienteFicha | null = null;
let fichaAssinatura = '';
let consultaFicha = 0;
let planoAberto: { pacienteId: string; servico: ReturnType<typeof criarServicoPlanoHttp> } | null =
  null;
let edicaoDisponivel = false;
/** FR-037: sondagem da fatia de substituição temporária. Falsa por padrão; com a flag
 * desligada a seção é desenhada em estado honesto de indisponibilidade, não com erro. */
let substituicaoCmDisponivel = false;
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
  gravarRota(hashFicha(id, secao), empilhar ? 'push' : 'replace');
}

/** Troca o fragmento sem empilhar histórico. O endereço sem fragmento é a home, então sair
 * da ficha para a lista precisa dizer `#carteira`: limpar o fragmento levaria à home. */
function trocarRota(hash: string): void {
  const destino = hash === '#home' ? '' : hash;
  if (window.location.hash !== destino) gravarRota(destino, 'replace');
}

function fecharFicha(): void {
  consultaFicha += 1;
  ficha?.desmontar();
  casca.fecharVista('ficha');
  ficha = null;
  fichaPaciente = null;
  planoAberto = null;
  fichaView.hidden = true;
  listaView.hidden = false;
  casca.atualizarNavegacao({ pessoa: '' });
}

function voltarParaLista(): void {
  const id = fichaPaciente?.id;
  fecharFicha();
  fecharHome();
  marcarNavegacao('carteira');
  trocarRota('#carteira');
  aviso('workspace-feedback', '');
  const linha = id ? listaPacientes.querySelector<HTMLElement>(`[data-paciente-id="${id}"]`) : null;
  if (linha) linha.focus();
  else focarTituloCasca();
}

function montarConversaoDaFicha(
  raiz: HTMLElement,
  pacienteId: string,
  origem: Parameters<typeof montarConversaoDiario>[2],
  pendente: (valor: boolean) => void,
  aoConcluir: () => void,
): ReturnType<typeof montarConversaoDiario> {
  const identidade = identidadeAtual();
  try {
    if (
      !identidade ||
      sessao?.usuario.perfil !== 'profissional' ||
      !['google', 'interno'].includes(sessionStorage.getItem('modo-acesso') ?? '')
    )
      return { desmontar: () => {}, invalidarOrigem: () => {} };
  } catch {
    return { desmontar: () => {}, invalidarOrigem: () => {} };
  }
  if (!identidade) return { desmontar: () => {}, invalidarOrigem: () => {} };
  let ativa = true;
  const identidadeDaConversao = () => {
    const atual = identidadeAtual();
    return ativa &&
      sessao?.usuario.perfil === 'profissional' &&
      fichaPaciente?.id === pacienteId &&
      atual?.usuario_id === identidade.usuario_id &&
      atual.session_id === identidade.session_id
      ? atual
      : null;
  };
  const servico = criarServicoConversaoDiarioHttp(identidadeDaConversao);
  const tarefas = criarServicoTarefasHttp(identidadeDaConversao);
  return montarConversaoDiario(
    raiz,
    pacienteId,
    origem,
    {
      atual: () => identidadeDaConversao() !== null,
      acessoPerdido,
      consultar: () => servico.consultar(pacienteId, origem.diario_registro_id),
      converter: (entrada, chave) =>
        servico.converter(pacienteId, origem.diario_registro_id, entrada, chave),
      contexto: async () => {
        const [capacidade, diario] = await Promise.all([
          tarefas.consultarDisponibilidade(pacienteId),
          consultarDisponibilidadeDiario(),
        ]);
        return {
          escrita_disponivel: capacidade.escrita_disponivel && diario.disponivel,
          areas: diario.areas,
        };
      },
      criarCiclo: (gravar) =>
        criarCicloTarefaCuidado({
          identidadeAtual: identidadeDaConversao,
          consultar: () => api.consultarBarreiraTarefa(),
          reservar: async (entrada) => (await api.reservarBarreiraTarefa(entrada)).estado,
          encerrar: async (entrada) => (await api.encerrarBarreiraTarefa(entrada)).estado,
          reconhecer: async (entrada) => (await api.reconhecerBarreiraTarefa(entrada)).estado,
          gravar,
        }),
      desmontar: () => {
        ativa = false;
        servico.desmontar();
      },
    },
    pendente,
    aoConcluir,
  );
}

function montarSecaoTarefas(
  raiz: HTMLElement,
  pacienteId: string,
  pendente: (valor: boolean) => void,
): () => void {
  const servicoTarefas = criarServicoTarefasHttp(identidadeAtual);
  return montarTarefasComDisponibilidade(raiz, pacienteId, {
    identidadeAtual,
    casoAtual: () => fichaPaciente?.id ?? null,
    consultarDisponibilidade: servicoTarefas.consultarDisponibilidade,
    acessoPerdido,
    montar: (destino, escritaDisponivel, identidadeDaSecao) => {
      const cicloTarefas = escritaDisponivel
        ? criarCicloTarefaCuidado({
            identidadeAtual: identidadeDaSecao,
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
        destino,
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
    },
  });
}

/** Sondagem da fatia de substituição (FR-037). Falha fechada: qualquer erro vira
 * indisponível, nunca erro de carregamento na ficha. */
async function sondarSubstituicaoCm(): Promise<{ disponivel: boolean }> {
  try {
    return await criarServicoSubstituicaoCmHttp(identidadeAtual).disponibilidade();
  } catch {
    return { disponivel: false };
  }
}

/** `null` quando a fatia está desligada ou a sessão não serve: a seção é desenhada em estado
 * honesto de indisponibilidade em vez de falhar ao carregar. */
function servicoSubstituicaoCm(): ReturnType<typeof criarServicoSubstituicaoCmHttp> | null {
  if (!substituicaoCmDisponivel) return null;
  try {
    return criarServicoSubstituicaoCmHttp(identidadeAtual);
  } catch {
    return null;
  }
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
        // Chave sempre presente para quem administra o cadastro: com a fatia desligada vai
        // `null`, e a seção aparece dizendo que ainda não está disponível. Visibilidade não é
        // autorização — o servidor e o banco continuam decidindo cada operação.
        substituicao: servicoSubstituicaoCm(),
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

function montarSecaoExecucaoTurno(
  raiz: HTMLElement,
  pacienteId: string,
  atual: Sessao,
  pendente: (valor: boolean) => void,
  comTurno: boolean,
): () => void {
  const identidade = identidadeAtual();
  let ativa = true;
  const identidadeDaSecao = () => {
    const corrente = identidadeAtual();
    return ativa &&
      identidade &&
      corrente &&
      fichaPaciente?.id === pacienteId &&
      corrente.usuario_id === identidade.usuario_id &&
      corrente.session_id === identidade.session_id
      ? corrente
      : null;
  };
  const servico = criarServicoTurnoExecucaoHttp(pacienteId, identidadeDaSecao);
  const tarefas = criarServicoTarefasHttp(identidadeDaSecao);
  const conversao = {
    consultar: (registroId: string) =>
      servico.consultarConversaoOcorrencia({ registro_id: registroId }),
    contexto: async () => {
      const [capacidade, diario] = await Promise.all([
        tarefas.consultarDisponibilidade(pacienteId),
        consultarDisponibilidadeDiario(),
      ]);
      return {
        escrita_disponivel: capacidade.escrita_disponivel && diario.disponivel,
        areas: diario.areas,
      };
    },
    criarCiclo: (gravar: Parameters<typeof criarCicloTarefaCuidado>[0]['gravar']) =>
      criarCicloTarefaCuidado({
        identidadeAtual: identidadeDaSecao,
        consultar: () => api.consultarBarreiraTarefa(),
        reservar: async (entrada) => (await api.reservarBarreiraTarefa(entrada)).estado,
        encerrar: async (entrada) => (await api.encerrarBarreiraTarefa(entrada)).estado,
        reconhecer: async (entrada) => (await api.reconhecerBarreiraTarefa(entrada)).estado,
        gravar,
      }),
  };
  const opcoes = {
    usuarioId: atual.usuario.id,
    administrador: atual.usuario.perfil === 'administrador',
    acessoPerdido: (erro?: unknown) => acessoPerdido(erro ?? new FalhaApi('nao_autenticado', 401)),
    alteracaoPendente: pendente,
    conversao,
    // FR-073/FR-078/FR-079. Criados sob demanda: a seção da ficha não faz pedido nenhum
    // antes de ser aberta. Esconder a seção não autoriza nada — servidor e banco decidem.
    criarServicosFicha: () => ({
      ficha: criarServicoFichaPlantaoHttp(identidadeDaSecao),
      modelo: criarServicoModeloFormularioHttp(identidadeDaSecao, 'ficha_plantao'),
      papeis: criarServicoPapelDeclaradoHttp(identidadeDaSecao),
    }),
  };
  const desmontar = comTurno
    ? montarTurnoComExecucao(
        raiz,
        pacienteId,
        criarServicoTurnoHttp(identidadeDaSecao),
        servico,
        opcoes,
      )
    : montarExecucaoTurno(raiz, pacienteId, null, servico, opcoes);
  return () => {
    ativa = false;
    desmontar();
    servico.desmontar();
  };
}

function secoesDaFicha(paciente: PacienteFicha, atual: Sessao): SecaoFicha[] {
  const acessoPerdidoDocumentos = (erro: unknown) => {
    if (sessao?.session_id === atual.session_id && sessao.usuario.id === atual.usuario.id)
      acessoPerdido(erro);
  };
  if (atual.usuario.perfil === 'familia')
    return [
      {
        id: 'dados',
        rotulo: 'Dados do paciente',
        compor: async () =>
          createElement((await import('./secao-dados-familiar.js')).TelaDadosFamiliar, {
            pacienteId: paciente.id,
            servico: api,
            acessoPerdido,
          }),
      },
      {
        id: 'diario',
        rotulo: 'Diário',
        descarte: descarteDiario,
        compor: async (pendente) => {
          pedirAreasDoDiario();
          // Sem entrada por áudio aqui de propósito: `transcricao-audio-relato` ainda não
          // tem o planejamento fechado nem cobre sessão familiar — família digita o relato.
          return createElement((await import('./diario.js')).TelaDiario, {
            pacienteId: paciente.id,
            usuarioId: atual.usuario.id,
            servico: criarServicoDiarioHttp(identidadeAtual),
            obterAreas: () => areasDiario,
            acessoPerdido,
            alteracaoPendente: pendente,
            ehFamilia: true,
          });
        },
      },
      {
        id: 'relatorios-turno',
        rotulo: 'Relatórios do cuidado',
        montar: async (raiz, pendente) => {
          const servico = criarServicoTurnoExecucaoHttp(paciente.id, identidadeAtual);
          const desmontar = montarRelatoriosTurno(raiz, servico, {
            familia: true,
            acessoPerdido,
            alteracaoPendente: pendente,
          });
          return () => {
            desmontar();
            servico.desmontar();
          };
        },
      },
      {
        id: 'plano',
        rotulo: 'Plano de cuidado',
        compor: async (pendente) =>
          // Família só lê (banco filtra por `visibilidade='publica'`, migration
          // `20261124110000`); por isso não entra em `planoAberto` nem no mecanismo de
          // reconfirmação de acesso do rascunho do colaborador (que leva a `'visao'`, seção
          // que a família não tem) — família não grava, não tem rascunho nem reserva a perder.
          createElement((await import('./plano-cuidado.js')).TelaPlanoCuidado, {
            pacienteId: paciente.id,
            servico: criarServicoPlanoHttp(identidadeAtual),
            acessoPerdido,
            alteracaoPendente: pendente,
            ehFamilia: true,
            nomeDoUsuario: () => undefined,
          }),
      },
      {
        id: 'documentos',
        rotulo: 'Documentos',
        compor: async (pendente) =>
          // Família só lê (banco filtra por `audiencia='equipe_e_familia'`, migration
          // `20261124120000`); nunca anexa, então as categorias (só usadas pelo formulário de
          // envio) não precisam ser pedidas.
          createElement((await import('./documentos-caso.js')).TelaDocumentosCaso, {
            pacienteId: paciente.id,
            servico: criarServicoDocumentosHttp(identidadeAtual),
            obterCategorias: () => [],
            acessoPerdido: acessoPerdidoDocumentos,
            alteracaoPendente: pendente,
            ehFamilia: true,
          }),
      },
      {
        id: 'orientacoes',
        rotulo: 'Orientações',
        compor: async () =>
          // A audiência é filtrada no servidor. A Família recebe somente leitura.
          createElement((await import('./orientacoes.js')).TelaOrientacoes, {
            pacienteId: paciente.id,
            servico: criarServicoOrientacoesHttp(identidadeAtual),
            acessoPerdido,
            ehFamilia: true,
          }),
      },
    ];
  const administraCadastro =
    atual.usuario.perfil === 'administrador' && atual.capacidades.includes('administrar_cadastro');
  const administraConcessoes =
    atual.usuario.perfil === 'administrador' &&
    atual.capacidades.includes('administrar_concessoes');
  // Um catálogo por ficha: a Visão e o Cadastro compartilham a equipe já consultada.
  const catalogoResponsaveis = administraConcessoes
    ? criarCatalogoResponsaveis((cursor) => api.listarProfissionais(cursor))
    : undefined;
  const secoes: SecaoFicha[] = [
    {
      id: 'visao',
      rotulo: 'Visão do caso',
      compor: async () =>
        createElement((await import('./visao-caso.js')).TelaVisaoCaso, {
          paciente,
          fontes: {
            objetivos: criarServicoPlanoHttp(identidadeAtual),
            anamnese: {
              consultarAnamnese: (id) => api.consultarAnamnese(id),
              confirmarRecusaIsolada:
                atual.usuario.perfil === 'administrador' &&
                atual.capacidades.includes('consultar_carteira_integral')
                  ? async () => {
                      const confirmada = await api.consultarSessao();
                      return (
                        confirmada.session_id === atual.session_id &&
                        confirmada.usuario.id === atual.usuario.id &&
                        confirmada.usuario.perfil === 'administrador' &&
                        confirmada.capacidades.includes('consultar_carteira_integral')
                      );
                    }
                  : undefined,
            },
            ...(administraCadastro && edicaoDisponivel
              ? {
                  situacao: {
                    consultarPaciente: (id: string) => api.consultarPaciente(id),
                    ...(catalogoResponsaveis ? { listarResponsaveis: catalogoResponsaveis } : {}),
                  },
                }
              : {}),
            ...(atual.usuario.perfil === 'profissional'
              ? { tarefas: criarServicoTarefasHttp(identidadeAtual) }
              : {}),
            pendencias: criarServicoPendenciasHttp(identidadeAtual),
          },
          acessoPerdido,
        }),
    },
    {
      id: 'linha-tempo',
      rotulo: 'Linha do tempo',
      compor: async () =>
        createElement((await import('./linha-tempo.js')).TelaLinhaTempo, {
          pacienteId: paciente.id,
          servico: criarServicoLinhaTempoHttp(identidadeAtual),
          acessoPerdido,
        }),
    },
    {
      id: 'anamnese',
      rotulo: 'Anamnese',
      descarte: descarteAnamnese,
      compor: async (pendente) => {
        // Uma consulta só serve as duas coisas: se o histórico está ligado e o roteiro
        // sugerido (FR-003), que vem do catálogo em banco e é editável na administração.
        const disponibilidade = api.disponibilidadeHistoricoAnamnese();
        /* A consulta parte ANTES da importação dinâmica de propósito: as duas correm
           juntas, e a seção abre mais cedo. O preço é uma janela em que a promessa existe
           e ninguém a escuta — os tratadores de verdade só são anexados nos argumentos
           abaixo, depois do `await`. Se ela falhar nessa janela, vira rejeição não
           tratada, que derruba o processo sem quebrar asserção nenhuma. Medido em
           26/11/2026 no portão de ativação.
           Este `catch` vazio não engole erro: ele apenas marca a promessa como escutada.
           Quem decide o que fazer com a falha continua sendo o `.catch` de cada argumento,
           que devolve `false` e lista vazia. */
        disponibilidade.catch(() => undefined);
        return createElement((await import('./anamnese.js')).TelaAnamnese, {
          pacienteId: paciente.id,
          servico: api,
          acessoPerdido,
          alteracaoPendente: pendente,
          historicoHabilitado: disponibilidade
            .then((resultado) => resultado.disponivel)
            .catch(() => false),
          roteiroSugerido: disponibilidade
            .then((resultado) => resultado.roteiro ?? [])
            .catch(() => []),
        });
      },
    },
    {
      id: 'saude',
      rotulo: 'Saúde',
      descarte: descarteSaude,
      compor: async (pendente) =>
        createElement((await import('./saude.js')).TelaSaude, {
          pacienteId: paciente.id,
          servico: criarServicoSaudeHttp(identidadeAtual),
          acessoPerdido,
          alteracaoPendente: pendente,
        }),
    },
    {
      id: 'plano',
      rotulo: 'Plano de cuidado',
      descarte: descartePlano,
      compor: async (pendente) => {
        const aberto = { pacienteId: paciente.id, servico: criarServicoPlanoHttp(identidadeAtual) };
        return createElement((await import('./plano-cuidado.js')).TelaPlanoCuidado, {
          pacienteId: aberto.pacienteId,
          servico: aberto.servico,
          acessoPerdido,
          alteracaoPendente: pendente,
          ehFamilia: false,
          nomeDoUsuario: nomeDoUsuarioNaEquipe.consultar,
          acompanharRevalidacao: () => {
            planoAberto = aberto;
            return () => {
              if (planoAberto === aberto) planoAberto = null;
            };
          },
        });
      },
    },
    {
      id: 'crise',
      rotulo: 'Plano de crise',
      descarte: descarteCrise,
      compor: async (pendente) =>
        createElement((await import('./plano-crise.js')).TelaPlanoCrise, {
          pacienteId: paciente.id,
          servico: criarServicoPlanoCriseHttp(identidadeAtual),
          acessoPerdido,
          alteracaoPendente: pendente,
        }),
    },
  ];
  if (atual.usuario.perfil === 'profissional')
    secoes.push({
      id: 'tarefas',
      rotulo: 'Tarefas',
      descarte: descarteTarefa,
      montar: async (raiz, pendente) => montarSecaoTarefas(raiz, paciente.id, pendente),
    });
  if (atual.usuario.perfil === 'profissional')
    secoes.push({
      id: 'meu-turno',
      rotulo: 'Meu turno',
      // Visibilidade organiza a ficha; autorização continua no servidor e banco.
      montar: async (raiz, pendente) =>
        montarSecaoExecucaoTurno(raiz, paciente.id, atual, pendente, true),
    });
  if (atual.usuario.perfil === 'administrador')
    secoes.push({
      id: 'execucao-cuidado',
      rotulo: 'Execução e relatórios',
      montar: async (raiz, pendente) =>
        montarSecaoExecucaoTurno(raiz, paciente.id, atual, pendente, false),
    });
  secoes.push({
    id: 'escala-turnos',
    rotulo: 'Escala de turnos',
    compor: async (pendente) =>
      createElement((await import('./escala-turno.js')).TelaEscalaTurno, {
        pacienteId: paciente.id,
        servico: criarServicoTurnoHttp(identidadeAtual),
        opcoes: {
          acessoPerdido: () => acessoPerdido(new FalhaApi('nao_autenticado', 401)),
          alteracaoPendente: pendente,
        },
      }),
  });
  if (administraCadastro)
    secoes.push({
      id: 'cadastro',
      rotulo: 'Cadastro',
      descarte: descarteCadastro,
      montar: async (raiz, pendente) =>
        montarSecaoCadastro(raiz, paciente.id, pendente, catalogoResponsaveis),
    });
  if (administraConcessoes)
    secoes.push({
      id: 'equipe',
      rotulo: 'Equipe com acesso',
      descarte: descarteEquipe,
      compor: async (pendente) =>
        createElement((await import('./selecao-profissional.js')).TelaSelecaoProfissional, {
          pacienteId: paciente.id,
          api,
          acessoPerdido,
          alteracaoPendente: pendente,
        }),
    });
  if (administraCadastro)
    secoes.push({
      id: 'exportacao',
      rotulo: 'Exportação',
      compor: async (pendente) =>
        createElement((await import('./exportacao.js')).TelaExportacao, {
          pacienteId: paciente.id,
          servico: criarServicoExportacaoHttp(identidadeAtual),
          acessoPerdido,
          alteracaoPendente: pendente,
          pacienteRotulo: paciente.nome_preferencia ?? paciente.nome,
        }),
    });
  if (administraConcessoes)
    secoes.push({
      id: 'acesso-familia',
      rotulo: 'Acesso da família',
      compor: async () =>
        createElement(
          (await import('./preautorizacoes-familiares.js')).TelaPreautorizacoesFamiliares,
          {
            pacienteId: paciente.id,
            servico: criarServicoPreautorizacoesHttp(identidadeAtual),
            acessoPerdido,
          },
        ),
    });
  secoes.push(
    {
      id: 'pendencias',
      rotulo: 'Pendências',
      compor: async () =>
        createElement((await import('./pendencias-caso.js')).TelaPendenciasCaso, {
          pacienteId: paciente.id,
          servico: criarServicoPendenciasHttp(identidadeAtual),
          acessoPerdido,
          listarResponsaveis: catalogoResponsaveis,
          // Decisão 0.5: a pendência do plantão aparece ao lado das derivadas, com origem visível.
          listarPendenciasEscritas: () =>
            criarServicoFichaPlantaoHttp(identidadeAtual).listarPendencias(paciente.id),
        }),
    },
    {
      id: 'encaminhamentos',
      rotulo: 'Encaminhamentos',
      compor: async () =>
        createElement((await import('./encaminhamentos.js')).TelaEncaminhamentos, {
          pacienteId: paciente.id,
          servico: criarServicoEncaminhamentosHttp(identidadeAtual),
          acessoPerdido,
        }),
    },
    {
      id: 'orientacoes',
      rotulo: 'Orientações',
      compor: async () =>
        createElement((await import('./orientacoes.js')).TelaOrientacoes, {
          pacienteId: paciente.id,
          servico: criarServicoOrientacoesHttp(identidadeAtual),
          acessoPerdido,
          ehFamilia: false,
        }),
    },
  );
  secoes.push(
    {
      id: 'contexto',
      rotulo: 'Rotina e recursos',
      compor: async (pendente) =>
        createElement((await import('./contexto-cuidado.js')).TelaContextoCuidado, {
          pacienteId: paciente.id,
          servico: criarServicoDocumentoPacienteHttp(
            identidadeAtual,
            'contexto-cuidado',
            documentoContextoCuidadoSchema,
            'elementos',
          ),
          acessoPerdido,
          alteracaoPendente: pendente,
          objetivosIniciais: [],
          consultarObjetivos: async (pacienteId, cursor) => {
            const pagina = await criarServicoPlanoHttp(identidadeAtual).consultarObjetivos(
              pacienteId,
              cursor,
            );
            return {
              itens: pagina.itens.map((registro) => ({
                id: registro.objetivo_id,
                titulo: registro.objetivo.descricao,
              })),
              proximo_cursor: pagina.proximo_cursor,
            };
          },
        }),
    },
    {
      id: 'rede',
      rotulo: 'Rede de cuidado',
      compor: async (pendente) =>
        createElement((await import('./rede-cuidado.js')).TelaRedeCuidado, {
          pacienteId: paciente.id,
          servico: criarServicoDocumentoPacienteHttp(
            identidadeAtual,
            'rede-cuidado',
            documentoRedeCuidadoSchema,
            'pessoas',
          ),
          acessoPerdido,
          alteracaoPendente: pendente,
        }),
    },
  );
  secoes.push({
    id: 'documentos',
    rotulo: 'Documentos',
    compor: async (pendente) => {
      const { TelaDocumentosCaso } = await import('./documentos-caso.js');
      pedirCategoriasDeDocumento();
      return createElement(TelaDocumentosCaso, {
        pacienteId: paciente.id,
        servico: criarServicoDocumentosHttp(identidadeAtual),
        obterCategorias: () => categoriasDocumento,
        acessoPerdido: acessoPerdidoDocumentos,
        alteracaoPendente: pendente,
        ehFamilia: false,
      });
    },
  });
  secoes.push({
    id: 'diario',
    rotulo: 'Diário',
    descarte: descarteDiario,
    compor: async (pendente) => {
      pedirAreasDoDiario();
      const converterEmTarefa: ConversaoEmTarefa | undefined =
        atual.usuario.perfil === 'profissional'
          ? (destino, origem, alteracao, concluido) =>
              montarConversaoDaFicha(destino, paciente.id, origem, alteracao, concluido)
          : undefined;
      return createElement((await import('./diario.js')).TelaDiario, {
        pacienteId: paciente.id,
        usuarioId: atual.usuario.id,
        servico: criarServicoDiarioHttp(identidadeAtual),
        obterAreas: () => areasDiario,
        acessoPerdido,
        alteracaoPendente: pendente,
        ...(converterEmTarefa ? { converterEmTarefa } : {}),
        montarEntradaPorAudio: entradaTranscricaoAudio(
          paciente.id,
          () => criarServicoTranscricaoHttp(identidadeAtual),
          acessoPerdido,
        ),
        ehFamilia: false,
      });
    },
  });
  return secoes;
}

/** Faixa principal da ficha (decisão de design 3): Visão do caso, Diário, Plano de
 * cuidado e Pendências. O restante fica em "Mais seções", sem mudar quais seções cada
 * perfil acessa. A decisão também prevê Linha do tempo como alternativa para um perfil
 * sem Diário; nenhum existe hoje (ver comentário abaixo), então essa parte não foi
 * escrita ainda — adicionar quando o caso existir.
 *
 * A decisão é sobre a ficha de 17 seções (Administrador/Profissional); família não tem
 * "Visão do caso" e sua lista é curta (hoje: Dados do paciente, Diário). Sem "visao" como
 * âncora, o par "faixa primária + Mais seções" não faz sentido para essa lista — por isso
 * exige "visao" para ativar a divisão, e `ficha-paciente.ts` já cai na faixa única quando
 * nenhum id de `primarias` bate com nada (ver sua robustez para id obsoleto). */
function destinosPrimarios(secoes: SecaoFicha[]): string[] {
  const disponiveis = new Set(secoes.map((secao) => secao.id));
  if (!disponiveis.has('visao')) return [];
  const primarios: string[] = ['visao'];
  // A decisão de design prevê Linha do tempo como alternativa quando o perfil não tiver
  // Diário; `secoesDaFicha` inclui Diário sem condição para todo perfil não família hoje,
  // então esse caso não existe ainda — adicionar o `else` só quando existir (YAGNI).
  if (disponiveis.has('diario')) primarios.push('diario');
  if (disponiveis.has('plano')) primarios.push('plano');
  if (disponiveis.has('pendencias')) primarios.push('pendencias');
  return primarios;
}

function abrirFicha(paciente: PacienteFicha, secao: string | undefined, empilhar: boolean): void {
  const atual = sessao;
  if (!atual) return;
  fecharFicha();
  fecharHome();
  marcarNavegacao('carteira');
  fichaPaciente = paciente;
  fichaAssinatura = assinaturaSessao(atual);
  aviso('workspace-feedback', '');
  listaView.hidden = true;
  fichaView.hidden = false;
  casca.atualizarNavegacao({ pessoa: paciente.nome, busca: null });
  let primeira = empilhar;
  const secoesAtual = secoesDaFicha(paciente, atual);
  const comando = createRef<Ficha>();
  casca.desenhar({
    tipo: 'ficha',
    destino: fichaView,
    chave: paciente.id,
    aoTentarNovamente: () => abrirFicha(paciente, ficha?.secaoAtual() || secao, false),
    tela: createElement(TelaFicha, {
      comando,
      paciente,
      secoes: secoesAtual,
      primarias: destinosPrimarios(secoesAtual),
      nivelTitulo: 2,
      confirmar: confirmarSaidaDaSecao,
      aoSelecionar: (escolhida) => {
        registrarRota(paciente.id, escolhida, primeira);
        primeira = false;
      },
      aoVoltar: voltarParaLista,
    }),
  });
  ficha = comando.current;
  const inicial = secaoInicialDaFicha(secoesAtual, secao);
  if (inicial) void ficha?.selecionar(inicial, { confirmar: false });
  ficha?.focarTitulo();
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
/** FR-026: recorte pedido ao servidor. Mudar o recorte invalida o cursor, porque ele
 * aponta para uma posição da lista anterior — por isso a paginação sempre volta ao começo. */
let filtrosCarteira: FiltrosCarteira = {};
let filtrosMontadosPara: string | null = null;
let desmontarFiltros: (() => void) | null = null;
/* Geração da barra de filtros, no mesmo idioma de `consulta` e `consultaFicha`.
   `filtrosMontadosPara` guarda uma ASSINATURA — `${id}|${administrador}|${disponivel}` —
   e assinatura é valor, não identidade: perder o acesso e entrar de novo com a MESMA
   conta reproduz a mesma string. Uma consulta de responsáveis disparada antes da queda
   resolvia depois da volta, comparava string com string, passava, e desenhava usando o
   fechamento da montagem ANTIGA. Nascia uma segunda ilha na mesma raiz, e a desmontagem
   corrente só conhecia a dela — ABA clássico: o valor voltou, a identidade não.
   A desmontagem também sobe para o módulo: enquanto era local a cada invocação, cada
   chamada abria um rastreamento novo e perdia a ilha da anterior. */
let geracaoFiltros = 0;
let desmontarBarraAtual: (() => void) | null = null;
type PedidoCadastro = { entrada: CriarPaciente; chave: string };
let cadastroPendente: PedidoCadastro | null = null;
let cadastroEmRevalidacao: { usuarioId: string; pedido: PedidoCadastro } | null = null;
const usuariosComCadastroIncerto = new Set<string>();
let ciclo: ReturnType<typeof criarCicloCadastro> | null = null;
let cadastroLiberado = false;
const usuariosCadastroSemConfirmacao = new Set<string>();
// Uma faixa de ação só. Antes este botão era filho de `#cadastro`, depois do formulário:
// no computador aparecia como uma SEGUNDA barra logo abaixo de "Cadastrar paciente", e as
// duas competiam pela mesma decisão. Ele entra agora na própria faixa do rodapé, antes da
// ação principal, como alternativa — que é o que ele é: enquanto o cadastro anterior não
// for conferido, "Cadastrar paciente" fica desabilitado e este é o único caminho adiante.
// Não sobe para o corpo porque o corpo rola: a ação que destrava o formulário não pode
// depender de alguém rolar até ela. A explicação continua em `#create-feedback`, no corpo,
// e o botão aponta para ela por `aria-describedby`.
const recuperarCadastro = botao({ rotulo: '', peso: 'secundario' });
recuperarCadastro.setAttribute('aria-describedby', 'create-feedback');
recuperarCadastro.hidden = true;
elemento('cadastro-acoes').insertBefore(recuperarCadastro, createButton);

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
          ? 'O cadastro enviado antes foi salvo. Confira a lista antes de cadastrar outro.'
          : 'O cadastro enviado antes não foi salvo.',
        'neutral',
      );
      recuperarCadastro.textContent = 'Entendi, liberar o cadastro';
      recuperarCadastro.dataset.acao = 'reconhecer';
    } else {
      aviso(
        'create-feedback',
        'Há um cadastro em andamento nesta conta. Conclua a conferência para liberar um novo; isso encerra o que estiver aberto em outras abas.',
      );
      recuperarCadastro.textContent = 'Conferir e liberar';
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
  casca.atualizarLista([]);
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
  reiniciarFormularioCadastro();
  equipeCasoNovoPara = null;
  catalogoCasoNovo = null;
  casoNovo.cancelarCarga();
  // Sair precisa levar junto tudo que a sessão trouxe para a tela: a barra de filtros
  // mostra nomes da equipe e os painéis de administração mostram registros institucionais.
  // O catálogo em memória não é limpo aqui porque é indexado pelo usuário: outra conta
  // reconstrói o seu, e a mesma conta revalidando não repete a consulta da equipe.
  filtrosMontadosPara = null;
  filtrosCarteira = {};
  desmontarFiltros?.();
  desmontarFiltros = null;
  /* Sem `replaceChildren` aqui: a ilha é dona dos próprios nós e os retira ao desmontar.
     Apagá-los por fora era uma corrida — medido em 26/11/2026, `unmount()` nem sempre
     termina no mesmo quadro, e o React lançava `NotFoundError` ao procurar nós que esta
     linha já havia removido. A barra fica escondida de qualquer forma. */
  elemento('filtros-carteira').hidden = true;
  fecharAdministracao();
  fecharRegras();
  fecharHome();
  casca.atualizarNavegacao({ administracao: false, avisos: null, visivel: false });
  marcarNavegacao('home');
  createFields.disabled = false;
  createButton.disabled = false;
  createButton.textContent = 'Cadastrar paciente';
  nameInput.removeAttribute('aria-invalid');
  elemento('name-error').textContent = '';
  preferredInput.removeAttribute('aria-invalid');
  elemento('preferred-error').textContent = '';
  marcarInvalidezCadastro(birthInput, false);
  elemento('birth-error').textContent = '';
  marcarInvalidezCadastro(situacaoInput, false);
  elemento('status-error').textContent = '';
  marcarInvalidezCadastro(responsavelInput, false);
  elemento('manager-error').textContent = '';
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
  audienciaFinanceira.esquecer();
  sessao = null;
  revalidacaoPendente = false;
  focoAposLoginOculto = false;
  revisao += 1;
  apagarPacientes();
  fecharGavetaLateral();
  loginForm.reset();
  familiarForm.reset();
  loginInterno.limpar();
  passwordInput.type = 'password';
  togglePassword.textContent = 'Mostrar senha';
  patientsView.hidden = true;
  logoutView.hidden = true;
  revalidacaoStatus.hidden = true;
  casca.atualizarNavegacao({ visivel: false });
  loginView.hidden = false;
  document.title = 'FFCMApp | Acesso';
  aviso('login-feedback', mensagem, tom);
  // Sai do endereço da ficha ao voltar para o acesso. Sem isto o fragmento sobrevive, e a
  // entrada seguinte cai de volta na MESMA seção que acabou de recusar — recusa, expulsa,
  // entra, recusa: um laço do qual só se escapa editando a barra de endereços.
  //
  // Observado em 24/11/2026 no navegador, contra a produção: um profissional abriu a aba
  // "Plano de crise", que o próprio menu oferece, sem estar habilitado para ela. Foi expulso
  // para o acesso com `#paciente/<id>/crise` ainda no endereço, e cada nova entrada repetiu a
  // expulsão. Limpar o fragmento não conserta a recusa — conserta a armadilha.
  if (lerRotaFicha(window.location.hash))
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${window.location.search}`,
    );
  loginFields.disabled = false;
  loginButton.textContent = 'Entrar';
  elemento('login-title').focus();
}

/**
 * Decide o que fazer quando uma leitura é recusada. Devolve `true` quando tratou — e quem
 * chamou já limpou o conteúdo antes de chegar aqui, que é o comportamento a preservar.
 *
 * `sem_permissao` NÃO derruba a sessão. Até 24/11/2026 derrubava, e isso foi reproduzido no
 * navegador contra a produção: um profissional clicou em "Plano de crise", aba que o próprio
 * menu da ficha oferece, sem estar habilitado para ela; o servidor recusou corretamente e o
 * aplicativo o mandou para a tela de acesso dizendo que a sessão precisava ser validada de
 * novo. O mesmo acontecia ao administrador em Administração › Acessos. Quem lia a tela
 * concluía que o login havia quebrado; o que faltava era permissão.
 *
 * Perder a sessão de verdade continua coberto: aí o servidor responde 401.
 */
function acessoPerdido(erro: unknown): boolean {
  if (semPermissao(erro)) {
    /* Dado clínico não pode continuar visível depois de uma recusa. Mas o tamanho do que
       sai da tela precisa corresponder ao tamanho da recusa.
       Até 25/11/2026 qualquer 403 fechava a ficha inteira. Consequência medida: o
       Administrador que abrisse uma aba não liberada era devolvido à lista, e não
       conseguia alcançar "Equipe com acesso" do mesmo caso — a ficha fechava antes.
       A recusa quase sempre é da ÁREA, não do caso. `visao` é a exceção, porque é a
       leitura do caso em si: negá-la é negar o caso, e aí a ficha fecha mesmo. Para as
       demais, `limparSecao()` apaga o conteúdo carregado E invalida as respostas
       pendentes daquela seção, que é a garantia que importa; a moldura da ficha fica, e a
       pessoa troca de aba. */
    const secao = ficha?.secaoAtual();
    if (ficha && secao !== undefined && secao !== 'visao') {
      ficha.limparSecao();
      aviso(
        'workspace-feedback',
        'Esta área não está liberada para o seu acesso. Sua sessão continua ativa, e as demais áreas deste caso seguem disponíveis.',
        'error',
      );
      return true;
    }
    fecharFicha();
    aviso(
      'workspace-feedback',
      'Esta área não está liberada para o seu acesso. Sua sessão continua ativa. Fale com a administração se precisar dela.',
      'error',
    );
    return true;
  }
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
const funcoesConta = { ...perfis, familia: 'Familiar', case_manager: 'Case Manager' };

let catalogoEquipePara: string | null = null;
let catalogoEquipe: (() => Promise<ResponsavelOpcao[]>) | null = null;

/** Uma consulta de equipe por usuário. O cadastro já mantém um catálogo com cache; os
 * filtros da carteira e as telas de administração reaproveitam esse mesmo catálogo em vez
 * de cada um pedir a sua cópia da lista. */
function catalogoDaEquipe(atual: Sessao): (() => Promise<ResponsavelOpcao[]>) | null {
  if (!atual.capacidades.includes('administrar_concessoes')) return null;
  if (catalogoEquipePara !== atual.usuario.id) {
    catalogoEquipePara = atual.usuario.id;
    catalogoEquipe = criarCatalogoResponsaveis((cursor) => api.listarProfissionais(cursor));
  }
  return catalogoEquipe;
}

/** FR-026. O recorte por responsável e por situação só é oferecido a quem o servidor
 * autoriza a lê-los; a recusa real continua no banco, esconder o controle é conveniência. */
function montarFiltrosDaCarteira(atual: Sessao): void {
  const raiz = elemento('filtros-carteira');
  const administrador =
    atual.usuario.perfil === 'administrador' &&
    atual.capacidades.includes('administrar_concessoes');
  const disponivel = atual.usuario.perfil !== 'familia';
  const assinatura = `${atual.usuario.id}|${administrador}|${disponivel}`;
  if (filtrosMontadosPara === assinatura) return;
  filtrosMontadosPara = assinatura;
  geracaoFiltros += 1;
  desmontarFiltros?.();
  desmontarFiltros = null;
  if (!disponivel) {
    raiz.replaceChildren();
    raiz.hidden = true;
    filtrosCarteira = {};
    return;
  }
  const trocar = (escolhidos: FiltrosCarteira) => {
    filtrosCarteira = escolhidos;
    // Cursor sempre volta ao início: ele aponta para a lista de antes do recorte.
    cursores = [undefined];
    pagina = 0;
    proximoCursor = null;
    void carregarPacientes();
  };
  /* `desenhar` é chamada DUAS vezes na mesma raiz — uma sem a equipe e outra quando a
     lista de responsáveis chega. A montagem anterior precisa ser desfeita de verdade, não
     só ter os filhos apagados: a raiz React continua viva depois de `replaceChildren()`, e
     quando o React vai remover os próprios nós eles já saíram. */
  const desenhar = (responsaveis?: readonly ResponsavelOpcao[]) => {
    desmontarBarraAtual?.();
    desmontarBarraAtual = montarFiltrosCarteira(
      raiz,
      {
        administrador,
        ...(responsaveis ? { responsaveis } : {}),
        ...(Object.keys(filtrosCarteira).length ? { inicial: filtrosCarteira } : {}),
      },
      trocar,
    );
  };
  desenhar();
  raiz.hidden = false;
  // A lista da equipe só é consultada quando alguém mexe nos filtros: pintar a barra não
  // justifica percorrer a equipe inteira, e revalidar o acesso não repete a consulta.
  // Até lá o filtro de responsável existe com a opção "sem responsável indicado".
  const catalogo = administrador ? catalogoDaEquipe(atual) : null;
  const geracao = geracaoFiltros;
  const carregarResponsaveis = () => {
    raiz.removeEventListener('focusin', carregarResponsaveis);
    void catalogo?.()
      .then((responsaveis) => {
        // Geração, não assinatura: a string volta a ser igual depois de um novo acesso
        // da mesma conta, a identidade da montagem não.
        if (geracao === geracaoFiltros) desenhar(responsaveis);
      })
      .catch(() => {
        /* a barra continua útil sem a lista de responsáveis */
      });
  };
  if (catalogo) raiz.addEventListener('focusin', carregarResponsaveis);
  desmontarFiltros = () => {
    /* Encerrar também INVALIDA o que está em voo. Sem esta linha a consulta de
       responsáveis disparada antes da queda resolvia depois dela, passava na guarda —
       porque a geração só avançava ao montar, nunca ao desmontar — e desenhava uma ilha
       nova numa barra que já tinha sido encerrada. `desmontarFiltros` já era nulo nesse
       ponto, então nada mais alcançava essa ilha, e o `replaceChildren` seguinte
       encontrava uma raiz React viva. Era a origem dos 3 `NotFoundError` restantes. */
    geracaoFiltros += 1;
    raiz.removeEventListener('focusin', carregarResponsaveis);
    // Desmontar a ilha ANTES de esvaziar. Até 26/11/2026 esta função só apagava os
    // filhos, e a raiz React ficava órfã — era a origem do `NotFoundError` que derrubava
    // o portão de ativação sem quebrar uma única asserção.
    desmontarBarraAtual?.();
    desmontarBarraAtual = null;
    raiz.replaceChildren();
  };
}

type AreaAdministracao = {
  id: string;
  rotulo: string;
  disponivel: (atual: Sessao) => boolean;
  /* Promete a desmontagem porque o módulo da área chega por importação dinâmica: o código
     de cada tela de Administração só desce quando alguém abre aquela tela. Medido em
     26/11/2026: as 13 telas pesam ~67 kB comprimidos, e quem não administra nunca as
     abre — era peso na primeira carga de todo mundo, inclusive no celular da família. */
  carregar: () => Promise<ReactElement | ((raiz: HTMLElement) => () => void)>;
};

const nomeDoUsuarioNaEquipe = (() => {
  let nomes = new Map<string, string>();
  return {
    carregar(atual: Sessao): void {
      const catalogo = catalogoDaEquipe(atual);
      if (!catalogo) return;
      void catalogo()
        .then((lista) => {
          nomes = new Map(lista.map((item) => [item.usuario_id, item.rotulo]));
        })
        .catch(() => {
          /* sem a equipe carregada, a tela mostra o identificador */
        });
    },
    consultar: (usuarioId: string) => nomes.get(usuarioId),
  };
})();

const audienciaFinanceira = criarAudienciaFinanceira(
  async () => criarServicoFinanceiroHttp(identidadeAtual).consultarAudiencia(),
  () => {
    const atual = sessao;
    if (!atual) return;
    casca.atualizarNavegacao({ administracao: areasDisponiveis(atual).length > 0 });
    // Audiência revogada com o Financeiro já aberto: o painel e os dados saem da tela.
    descartarAreaNaoPermitida(areasDisponiveis(atual));
  },
);

const areasAdministracao: AreaAdministracao[] = [
  {
    id: 'plano-cuidado',
    rotulo: 'Plano de cuidado',
    disponivel: (atual) => atual.usuario.perfil === 'administrador',
    carregar: async () =>
      createElement((await import('./campo-extra-plano-administracao.js')).TelaAdministracaoPlano, {
        servico: criarServicoPlanoHttp(identidadeAtual),
        acessoPerdido,
        consultarEquipe: async () => {
          if (!sessao) throw new FalhaApi('nao_autenticado', 401);
          const catalogo = catalogoDaEquipe(sessao);
          if (!catalogo) throw new Error('Catálogo da equipe indisponível.');
          return catalogo();
        },
      }),
  },
  {
    // FR-078. O servidor e o banco decidem a cada escrita.
    id: 'modelo-ficha-plantao',
    rotulo: 'Ficha de plantão — modelo',
    disponivel: (atual) => atual.usuario.perfil === 'administrador',
    carregar: async () =>
      createElement(
        (await import('./modelo-ficha-plantao-administracao.js')).TelaModeloFichaPlantao,
        {
          servico: criarServicoModeloFormularioHttp(identidadeAtual, 'ficha_plantao'),
          acessoPerdido,
        },
      ),
  },
  {
    // FR-079. Rótulo de registro; não participa de nenhuma decisão de acesso.
    id: 'papel-declarado',
    rotulo: 'Papéis declarados',
    disponivel: (atual) => atual.usuario.perfil === 'administrador',
    carregar: async () =>
      createElement((await import('./papel-declarado-administracao.js')).TelaPapelDeclarado, {
        servico: criarServicoPapelDeclaradoHttp(identidadeAtual),
        acessoPerdido,
      }),
  },
  {
    // FR-076/FR-081. Vocabulário de observação, sem nota nem escala.
    id: 'estado-emocional',
    rotulo: 'Estado emocional observado',
    disponivel: (atual) => atual.usuario.perfil === 'administrador',
    carregar: async () =>
      (await import('./estado-emocional-administracao.js')).criarTelaEstadoEmocional(
        criarServicoEstadoEmocionalHttp(identidadeAtual),
        acessoPerdido,
      ),
  },
  {
    id: 'acessos',
    rotulo: 'Acessos',
    disponivel: (atual) =>
      atual.usuario.perfil === 'administrador' &&
      atual.capacidades.includes('administrar_concessoes'),
    carregar: async () =>
      createElement((await import('./acessos-administracao.js')).TelaAcessos, {
        servico: criarServicoAcessosHttp(identidadeAtual),
        opcoes: { identidadeAtual, acessoPerdido },
      }),
  },
  {
    id: 'integracoes',
    rotulo: 'Credenciais das integrações',
    disponivel: (atual) => atual.usuario.perfil === 'administrador',
    carregar: async () =>
      createElement((await import('./segredos-integracoes.js')).TelaSegredosIntegracoes, {
        servico: criarServicoSegredosIntegracoesHttp(identidadeAtual),
        nomeDoUsuario: nomeDoUsuarioNaEquipe.consultar,
      }),
  },
  {
    id: 'configuracao',
    rotulo: 'Configuração',
    disponivel: (atual) => atual.usuario.perfil === 'administrador',
    carregar: async () => {
      const [{ TelaConfiguracaoSistema }, { criarServicoConfiguracaoSistemaHttp }] =
        await Promise.all([
          import('./configuracao-sistema.js'),
          import('./servico-configuracao-sistema-http.js'),
        ]);
      return createElement(TelaConfiguracaoSistema, {
        servico: criarServicoConfiguracaoSistemaHttp(identidadeAtual),
        nomeDoUsuario: nomeDoUsuarioNaEquipe.consultar,
      });
    },
  },
  {
    id: 'equipe',
    rotulo: 'Equipe',
    disponivel: (atual) =>
      atual.usuario.perfil === 'administrador' &&
      atual.capacidades.includes('administrar_concessoes'),
    carregar: async () =>
      createElement((await import('./concessao-equipe.js')).TelaConcessaoEquipe, { api }),
  },
  {
    id: 'convidar-equipe',
    rotulo: 'Convidar alguém',
    disponivel: (atual) =>
      atual.usuario.perfil === 'administrador' &&
      atual.capacidades.includes('administrar_concessoes'),
    carregar: async () =>
      createElement((await import('./convidar-equipe.js')).TelaConvidarEquipe, { api }),
  },
  {
    id: 'plano-de-crise',
    rotulo: 'Quem aprova plano de crise',
    disponivel: (atual) =>
      atual.usuario.perfil === 'administrador' &&
      atual.capacidades.includes('administrar_concessoes'),
    carregar: async () =>
      createElement((await import('./habilitacao-plano-crise.js')).TelaHabilitacaoPlanoCrise, {
        servico: criarServicoHabilitacaoPlanoCriseHttp(identidadeAtual),
      }),
  },
  {
    // FR-068. A audiência financeira depende de concessão e não decorre do vínculo com caso.
    id: 'financeiro-concessao',
    rotulo: 'Quem vê o financeiro',
    disponivel: (atual) =>
      atual.usuario.perfil === 'administrador' &&
      atual.capacidades.includes('administrar_concessoes'),
    carregar: async () =>
      createElement(
        (await import('./financeiro-concessao-administracao.js')).TelaFinanceiroConcessao,
        { servico: criarServicoFinanceiroHttp(identidadeAtual) },
      ),
  },
  {
    id: 'financeiro',
    rotulo: 'Financeiro',
    disponivel: (atual) =>
      atual.usuario.perfil !== 'familia' && audienciaFinanceira.permitidaPara(atual.session_id),
    carregar: async () =>
      createElement((await import('./financeiro.js')).TelaFinanceiro, {
        servico: criarServicoFinanceiroHttp(identidadeAtual),
      }),
  },
  {
    id: 'auditoria',
    rotulo: 'Auditoria',
    disponivel: (atual) => atual.capacidades.includes('consultar_auditoria'),
    carregar: async () =>
      createElement((await import('./auditoria.js')).TelaAuditoria, {
        servico: criarServicoAuditoriaHttp(identidadeAtual),
        opcoes: {
          nomeDoUsuario: nomeDoUsuarioNaEquipe.consultar,
          // A carteira e a auditoria autorizam cada consulta no servidor.
          listarCasos: async () =>
            (await api.listarPacientes()).itens.map((item) => ({
              id: item.id,
              nome: item.nome_preferencia ?? item.nome,
            })),
        },
      }),
  },
  {
    id: 'solicitacoes',
    rotulo: 'Solicitações do titular',
    disponivel: (atual) => atual.usuario.perfil === 'administrador',
    carregar: async () =>
      createElement((await import('./solicitacoes-titular.js')).TelaSolicitacoesTitular, {
        servico: criarServicoSolicitacaoTitularHttp(identidadeAtual),
        opcoes: {},
      }),
  },
];

function areasDisponiveis(atual: Sessao): AreaAdministracao[] {
  if (atual.usuario.perfil === 'familia') return [];
  return areasAdministracao.filter((area) => area.disponivel(atual));
}

let painelAdministracao: { area: string; desmontar: () => void } | null = null;
let vistaReact: 'home' | 'regras' | null = null;

/** A área aberta que já não consta entre as permitidas é desmontada e a pessoa volta à
 * Carteira, no mesmo passo em que a autorização muda. */
function descartarAreaNaoPermitida(permitidas: AreaAdministracao[]): void {
  if (!painelAdministracao || permitidas.some((area) => area.id === painelAdministracao?.area))
    return;
  fecharAdministracao();
  trocarRota('#carteira');
  mostrarCarteira();
}

function fecharAdministracao(): void {
  painelAdministracao?.desmontar();
  painelAdministracao = null;
  elemento('administracao-conteudo').removeAttribute('aria-busy');
  elemento('administracao-view').hidden = true;
}

function fecharRegras(): void {
  if (vistaReact === 'regras') {
    casca.desenhar(null);
    vistaReact = null;
  }
  elemento('regras-view').hidden = true;
}

function fecharHome(): void {
  if (vistaReact === 'home') {
    casca.desenhar(null);
    vistaReact = null;
  }
  homeView.hidden = true;
}

let destinoCasca: DestinoCasca = 'home';

function marcarNavegacao(destino: DestinoCasca, area = ''): void {
  destinoCasca = destino;
  casca.atualizarNavegacao({
    destino,
    area,
    busca:
      destino === 'carteira' && !fichaPaciente && pacientesDaPagina.length > 0 ? buscaTexto : null,
  });
}

function mostrarCarteira(): void {
  fecharAdministracao();
  fecharRegras();
  fecharHome();
  listaView.hidden = false;
  marcarNavegacao('carteira');
}

/** Porta de entrada do profissional. Monta sobre a mesma consulta da carteira, então o
 * recorte por acesso é o do servidor; a tela não soma nada que ele não tenha devolvido. */
function mostrarHome(): void {
  if (!sessao) return;
  fecharFicha();
  if (sessao.usuario.perfil === 'familia') {
    mostrarCarteira();
    return;
  }
  fecharAdministracao();
  fecharRegras();
  listaView.hidden = true;
  homeView.hidden = false;
  marcarNavegacao('home');
  if (vistaReact === 'home') return;
  vistaReact = 'home';
  casca.desenhar({
    tipo: 'home',
    destino: homeView,
    servico: { listar: (filtros) => api.listarPacientes(undefined, filtros) },
    acessoPerdido,
  });
}

function mostrarAdministracao(areaId: string): void {
  const atual = sessao;
  if (!atual) return;
  const disponiveis = areasDisponiveis(atual);
  const area = disponiveis.find((item) => item.id === areaId) ?? disponiveis[0];
  if (!area) {
    // Sem nenhuma área autorizada a administração não existe para esta conta.
    trocarRota('#carteira');
    fecharFicha();
    mostrarCarteira();
    focarDestinoDaCasca();
    return;
  }
  fecharFicha();
  fecharRegras();
  fecharHome();
  listaView.hidden = true;
  const vista = elemento('administracao-view');
  vista.hidden = false;
  marcarNavegacao('administracao', area.rotulo);
  // A faixa de abas só é reconstruída quando o conjunto autorizado muda. Reconstruí-la a
  // cada troca descartava os elementos sob o cursor e o foco, e a faixa inteira piscava
  // junto com o painel: trocar de aba parecia recarregar a página.
  const abas = elemento('administracao-abas');
  const assinatura = disponiveis.map((item) => item.id).join('|');
  if (abas.dataset.areas !== assinatura) {
    abas.dataset.areas = assinatura;
    abas.replaceChildren(
      ...disponiveis.map((item) => {
        const link = document.createElement('a');
        link.className = 'administracao-aba';
        link.href = `#administracao/${item.id}`;
        link.textContent = item.rotulo;
        return link;
      }),
    );
  }
  for (const link of abas.querySelectorAll<HTMLAnchorElement>('a.administracao-aba')) {
    if (link.hash === `#administracao/${area.id}`) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (painelAdministracao?.area === area.id) return;
  // A equipe só é consultada pelas telas que trocam identificador por nome.
  if (['configuracao', 'integracoes', 'auditoria'].includes(area.id))
    nomeDoUsuarioNaEquipe.carregar(atual);
  painelAdministracao?.desmontar();
  const conteudo = elemento('administracao-conteudo');
  conteudo.setAttribute('aria-busy', 'true');
  const emCarregamento = { area: area.id, desmontar: () => {} };
  painelAdministracao = emCarregamento;
  void area.carregar().then(
    (tela) => {
      // Confere o destino e a autorização antes da primeira montagem, inclusive
      // quando o usuário saiu e voltou à mesma área enquanto o módulo carregava.
      if (painelAdministracao !== emCarregamento || !sessao) return;
      if (!area.disponivel(sessao)) {
        fecharAdministracao();
        trocarRota('#carteira');
        mostrarCarteira();
        focarDestinoDaCasca();
        return;
      }
      if (typeof tela === 'function') {
        emCarregamento.desmontar = tela(conteudo);
      } else {
        casca.desenhar({
          tipo: 'administracao',
          destino: conteudo,
          chave: area.id,
          tela,
          aoTentarNovamente: () => {
            if (painelAdministracao !== emCarregamento) return;
            fecharAdministracao();
            mostrarAdministracao(area.id);
            focarDestinoDaCasca();
          },
        });
        emCarregamento.desmontar = () => casca.desenhar(null);
      }
      conteudo.removeAttribute('aria-busy');
    },
    (erro: unknown) => {
      if (painelAdministracao !== emCarregamento || acessoPerdido(erro)) return;
      conteudo.removeAttribute('aria-busy');
      painelAdministracao = null;
      aviso('workspace-feedback', `${mensagemFalha(erro)} Tente abrir a área de novo.`, 'error');
    },
  );
}

function mostrarRegras(): void {
  if (!sessao) return;
  fecharFicha();
  fecharAdministracao();
  fecharHome();
  listaView.hidden = true;
  elemento('regras-view').hidden = false;
  marcarNavegacao('regras');
  if (vistaReact === 'regras') return;
  vistaReact = 'regras';
  casca.desenhar({
    tipo: 'regras',
    destino: elemento('regras-conteudo'),
    servico: criarServicoRegrasAtendimentoHttp(identidadeAtual),
  });
  document.getElementById('titulo-casca')?.focus();
}

/** `#home` é a rota inicial, então o endereço sem fragmento é dela: entrar na aplicação
 * não deveria exigir um fragmento para chegar à primeira tela. */
function irPara(hash: string): void {
  gravarRota(hash, 'push');
  navegarPelaRota();
  focarDestinoDaCasca();
}

function focarTituloCasca(): void {
  document.getElementById('titulo-casca')?.focus();
}

function focarDestinoDaCasca(): void {
  if (!fichaView.hidden || (!listaView.hidden && listaView.contains(document.activeElement)))
    return;
  focarTituloCasca();
}

function navegarPelaRota(): void {
  if (!sessao) return;
  const rota = lerRota();
  switch (rota.tipo) {
    case 'ficha':
      fecharAdministracao();
      fecharRegras();
      if (ficha && fichaPaciente?.id !== rota.ficha.id) fecharFicha();
      if (!ficha) void abrirFichaPelaRota();
      else if (ficha.secaoAtual() !== rota.ficha.secao) {
        const aberta = ficha;
        void aberta.selecionar(rota.ficha.secao, { confirmar: false }).then((selecionada) => {
          if (!selecionada && ficha === aberta)
            registrarRota(rota.ficha.id, aberta.secaoAtual(), false);
        });
      }
      return;
    case 'administracao':
      mostrarAdministracao(rota.area);
      return;
    case 'regras':
      mostrarRegras();
      return;
    case 'home':
      mostrarHome();
      return;
    case 'carteira':
      if (ficha && fichaPaciente) voltarParaLista();
      else mostrarCarteira();
  }
}

/** Sair da ficha por um link do menu precisa respeitar a mesma confirmação do botão
 * voltar: o rascunho não confirmado se perde do mesmo jeito. */
async function sairDaFichaPermitido(): Promise<boolean> {
  const pendencia = pendenciaFicha();
  if (!pendencia) return true;
  return confirmarSaidaDaSecao(pendencia.mensagem);
}

/** Retorna se a sessão, usuário ou perfil mudou. */
function aplicarSessao(atual: Sessao): boolean {
  if (!atual.usuario.ativo) throw new Error('Acesso indisponível.');
  const trocouIdentidade = Boolean(
    sessao &&
      (sessao.session_id !== atual.session_id ||
        sessao.usuario.id !== atual.usuario.id ||
        sessao.usuario.perfil !== atual.usuario.perfil),
  );
  if (trocouIdentidade) {
    // A troca de identidade descarta as telas e os dados da sessão anterior antes de
    // montar o destino para a nova conta.
    fecharFicha();
    fecharHome();
    fecharAdministracao();
    fecharRegras();
  } else if (ficha && fichaAssinatura !== assinaturaSessao(atual)) {
    fecharFicha();
    aviso('workspace-feedback', 'Seu acesso foi atualizado. Abra a ficha novamente.');
  }
  sessao = atual;
  // Com o Financeiro aberto, cada revalidação confere a audiência de novo: ela é concessão
  // e pode ser revogada sem mudar a sessão.
  audienciaFinanceira.sondar(
    { session_id: atual.session_id, perfil: atual.usuario.perfil },
    painelAdministracao?.area === 'financeiro',
  );
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
    reiniciarFormularioCadastro();
    cadastroPendente = null;
    aviso('create-feedback', '');
  }
  if (podeCadastrar) {
    if (equipeCasoNovoPara !== atual.usuario.id) {
      equipeCasoNovoPara = atual.usuario.id;
      catalogoCasoNovo = catalogoDaEquipe(atual);
      if (catalogoCasoNovo) void casoNovo.carregarResponsaveis();
      else
        casoNovo.equipeIndisponivel(
          'Seu acesso não permite listar a equipe, então o responsável não pode ser indicado e o cadastro não pode ser enviado.',
        );
    }
  } else {
    equipeCasoNovoPara = null;
    catalogoCasoNovo = null;
    casoNovo.cancelarCarga();
  }
  montarFiltrosDaCarteira(atual);
  // A home é da equipe. A família entra pela própria lista, que já é o recorte dela, e o
  // sinal operacional não é vocabulário que a família tenha combinado.
  const temHome = atual.usuario.perfil !== 'familia';

  if (!temHome && vistaReact === 'home') {
    fecharHome();
    mostrarCarteira();
  }
  const areasPermitidas = areasDisponiveis(atual);
  const temAdministracao = areasPermitidas.length > 0;
  casca.atualizarNavegacao({
    home: temHome,
    administracao: temAdministracao,
    perfil: atual.usuario.funcao
      ? funcoesConta[atual.usuario.funcao]
      : perfis[atual.usuario.perfil],
    avisos: temHome
      ? {
          identidade: [atual.usuario.id, atual.session_id, atual.usuario.perfil].join('|'),
          revisao: ++revisaoAvisos,
          servico: criarServicoAvisosHttp(identidadeAtual),
        }
      : null,
  });
  descartarAreaNaoPermitida(areasPermitidas);
  registration.hidden = !podeCadastrar;
  newPatientLink.hidden = !podeCadastrar;
  elemento('workspace').classList.toggle('with-registration', podeCadastrar);
  elemento('scope-description').textContent = atual.capacidades.includes(
    'consultar_carteira_integral',
  )
    ? 'Consulte os pacientes e mantenha o cadastro organizado.'
    : 'Pacientes disponíveis conforme seus vínculos de acesso.';
  elemento('empty-description').textContent = podeCadastrar
    ? 'Cadastre o primeiro paciente informando todos os campos exigidos.'
    : 'Nenhum paciente foi disponibilizado para seu acesso nesta consulta.';
  return trocouIdentidade;
}

async function entrar(evento: SubmitEvent): Promise<void> {
  evento.preventDefault();
  if (loginOcupado) return;
  loginOcupado = true;
  loginFields.disabled = true;
  const finalizar = iniciarAcao(loginButton);
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
      casca.atualizarNavegacao({ visivel: false });
      revalidacaoStatus.hidden = false;
      return;
    }
    patientsView.hidden = false;
    casca.atualizarNavegacao({ visivel: true });
    document.title = 'FFCMApp | Pacientes';
    aviso('login-feedback', '');
    if (await carregarPacientes()) await abrirFichaPelaRota();
    navegarPelaRota();
    focarDestinoDaCasca();
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
    finalizar();
  }
}

async function entrarFamiliar(evento: SubmitEvent): Promise<void> {
  evento.preventDefault();
  if (loginOcupado) return;
  loginOcupado = true;
  loginFields.disabled = familiarFields.disabled = true;
  const finalizar = iniciarAcao(familiarBotao);
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
      casca.atualizarNavegacao({ visivel: false });
      revalidacaoStatus.hidden = false;
      return;
    }
    patientsView.hidden = false;
    casca.atualizarNavegacao({ visivel: true });
    document.title = 'FFCMApp | Pacientes';
    aviso('familiar-feedback', '');
    if (await carregarPacientes()) await abrirFichaPelaRota();
    navegarPelaRota();
    focarDestinoDaCasca();
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
    finalizar();
  }
}

function abrirPacienteDaCarteira(paciente: PacienteLista): void {
  if (!sessao) return;
  abrirFicha(
    {
      id: paciente.id,
      nome: paciente.nome,
      nome_preferencia: paciente.nome_preferencia,
      ...(paciente.situacao === undefined ? {} : { situacao: paciente.situacao }),
    },
    undefined,
    true,
  );
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
  casca.atualizarLista(itens);
  listaPacientes.hidden = itens.length === 0;
  elemento('busca').hidden = pacientesDaPagina.length === 0;
  buscaVazia.hidden = !(pacientesDaPagina.length > 0 && itens.length === 0);
  if (destinoCasca === 'carteira' && !fichaPaciente)
    casca.atualizarNavegacao({ busca: pacientesDaPagina.length > 0 ? buscaTexto : null });
}

async function abrirFichaPelaRota(): Promise<void> {
  const fragmento = window.location.hash;
  const rota = lerRotaFicha(fragmento);
  const atualSessao = sessao;
  if (!rota || !atualSessao || ficha) return;
  const versao = revisao;
  const numero = ++consultaFicha;
  const atual = () =>
    versao === revisao &&
    numero === consultaFicha &&
    window.location.hash === fragmento &&
    !ficha &&
    sessao !== null;
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
      trocarRota('#carteira');
      mostrarCarteira();
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
    trocarRota('#carteira');
    mostrarCarteira();
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
    const administraCadastroAgora =
      sessao.usuario.perfil === 'administrador' &&
      sessao.capacidades.includes('administrar_cadastro');
    const [resultado, disponibilidade, disponibilidadeSubstituicao] = await Promise.all([
      api.listarPacientes(cursores[pagina], filtrosCarteira),
      administraCadastroAgora
        ? api.disponibilidadeEdicao().catch(() => ({ disponivel: false }))
        : Promise.resolve({ disponivel: false }),
      administraCadastroAgora
        ? sondarSubstituicaoCm()
        : Promise.resolve({ disponivel: false as boolean }),
    ]);
    if (!atual()) return false;
    edicaoDisponivel = disponibilidade.disponivel;
    substituicaoCmDisponivel = disponibilidadeSubstituicao.disponivel;
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
              ? 'Cadastre o primeiro paciente informando todos os campos exigidos.'
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
    const cadastro = lerFormularioCadastro();
    if (!cadastro.success) {
      const campos: {
        chave: string;
        input: HTMLInputElement | HTMLSelectElement;
        erro: string;
        mensagem: string;
      }[] = [
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
          mensagem: 'Informe uma data de nascimento válida, que não seja futura.',
        },
        {
          chave: 'situacao',
          input: situacaoInput,
          erro: 'status-error',
          mensagem: 'Escolha a situação do caso.',
        },
        {
          chave: 'responsavel_id',
          input: responsavelInput,
          erro: 'manager-error',
          mensagem: 'Escolha quem acompanha o caso.',
        },
      ];
      let primeiro: HTMLElement | undefined;
      for (const campo of campos) {
        const invalido = cadastro.error.issues.some((item) => item.path[0] === campo.chave);
        marcarInvalidezCadastro(campo.input, invalido);
        if (invalido) {
          elemento(campo.erro).textContent = campo.mensagem;
          primeiro ??= campo.input;
        } else {
          elemento(campo.erro).textContent = '';
        }
      }
      const contato = casoNovo.marcarContatos(
        cadastro.error.issues.some((item) => item.path[0] === 'contatos'),
      );
      primeiro ??= contato;
      primeiro?.focus();
      aviso('create-feedback', 'Confira os campos informados antes de cadastrar.', 'error');
      return;
    }
    casoNovo.marcarContatos(false);
    if (!casoNovo.equipeDisponivel()) {
      aviso(
        'create-feedback',
        'A equipe ainda não está disponível para indicar o responsável. O cadastro não foi enviado.',
        'error',
      );
      return;
    }
    cadastroPendente = { entrada: cadastro.data, chave: crypto.randomUUID() };
  }
  const pedido = cadastroPendente;
  const versao = revisao;
  cadastroOcupado = true;
  createFields.disabled = true;
  createButton.disabled = true;
  const finalizar = iniciarAcao(createButton);
  aviso('create-feedback', 'Aguardando confirmação do cadastro…');
  aviso('workspace-feedback', '');
  try {
    cadastroLiberado = false;
    usuariosCadastroSemConfirmacao.add(sessao.usuario.id);
    await ciclo.criar(pedido.entrada);
    if (versao !== revisao) return;
    if (sessao) usuariosCadastroSemConfirmacao.delete(sessao.usuario.id);
    cadastroPendente = null;
    reiniciarFormularioCadastro();
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
    finalizar();
    if (versao === revisao) {
      cadastroOcupado = false;
      createFields.disabled = !cadastroLiberado;
      createButton.disabled = !cadastroLiberado;
      if (revalidacaoPendente) {
        revalidacaoPendente = false;
        void revalidarAcesso();
      }
    }
  }
}

async function sair(): Promise<void> {
  const pendencia = pendenciaFicha();
  if (logoutOcupado) return;
  if (pendencia && !(await confirmarSaidaDaSecao(pendencia.mensagem))) return;
  if (logoutOcupado) return;
  trocarRota('#home');
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
  audienciaFinanceira.esquecer();
  sessao = null;
  revisao += 1;
  apagarPacientes();
  patientsView.hidden = true;
  loginView.hidden = true;
  casca.atualizarNavegacao({ visivel: false });
  logoutView.hidden = false;
  logoutView.classList.add('logout-loading');
  revalidacaoStatus.hidden = true;
  document.title = 'FFCMApp | Encerrar acesso';
  retryLogout.hidden = true;
  elemento('logout-title').focus();
  aviso('logout-feedback', 'Encerrando sessão no serviço…');
  try {
    const resultado = await api.sair();
    // Só depois do encerramento confirmado: `api.sair()` e a nova tentativa dependem das marcas
    // de sessão. Sem `await` de propósito — a parte síncrona (armazenamentos) já terminou aqui, e
    // os caches não podem atrasar a tela de saída.
    void limparAparelho();
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
    logoutView.classList.remove('logout-loading');
    logoutOcupado = false;
  }
}

async function revalidarAcesso(): Promise<void> {
  fecharGavetaLateral();
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
    // Sessão/perfil trocados fecham a home e a ficha (ver `aplicarSessao`), mas não as
    // remontam sozinhos: sem rotear de novo aqui, a tela ficaria em branco até o usuário
    // clicar em algum destino, em vez de mostrar o conteúdo certo para quem está na aba agora.
    if (aplicarSessao(atual)) navegarPelaRota();
    // A carteira pode estar paginada ou filtrada; só a consulta direta comprova vínculo.
    const fichaRevalidada = ficha;
    const pacienteRevalidado = fichaPaciente;
    if (atual.usuario.perfil === 'familia' && fichaRevalidada && pacienteRevalidado) {
      const confirmado = await api.consultarPacienteFamiliar(pacienteRevalidado.id);
      if (confirmado.id !== pacienteRevalidado.id)
        throw new Error('Paciente retornado não corresponde à consulta.');
      if (
        versao !== revisao ||
        ficha !== fichaRevalidada ||
        fichaPaciente !== pacienteRevalidado ||
        !sessao ||
        assinaturaSessao(sessao) !== assinaturaSessao(atual)
      )
        return;
    }
    const plano = planoAberto;
    let planoNegado = false;
    if (plano) {
      try {
        await plano.servico.consultarObjetivos(plano.pacienteId);
      } catch (erro) {
        if (versao !== revisao) return;
        if (semPermissao(erro)) {
          if (planoAberto === plano) {
            acessoPerdido(erro);
            planoNegado = true;
          }
        } else if (acessoPerdido(erro)) {
          return;
        } else if (planoAberto === plano) {
          const rascunhoDescartado = pendenciaFicha()?.secao === 'plano';
          void ficha?.selecionar('visao', { confirmar: false });
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
      casca.atualizarNavegacao({ visivel: true });
      // A área recusada já foi limpa. Reexiba a ficha e o aviso sem reabrir o plano.
      if (!planoNegado || ficha !== fichaRevalidada || ficha?.secaoAtual() !== 'plano')
        ficha?.remontarSecao();
      if (focoAposLoginOculto) {
        focoAposLoginOculto = false;
        document.title = 'FFCMApp | Pacientes';
        if (ficha) ficha.focarTitulo();
        else focarTituloCasca();
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
togglePassword.addEventListener('click', () => {
  const mostrar = passwordInput.type === 'password';
  passwordInput.type = mostrar ? 'text' : 'password';
  togglePassword.textContent = mostrar ? 'Ocultar senha' : 'Mostrar senha';
});
createForm.addEventListener('submit', cadastrar);
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
function buscarNaCarteira(texto: string): void {
  buscaTexto = texto;
  buscaCampo.value = texto;
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
}
buscaCampo.addEventListener('input', () => buscarNaCarteira(buscaCampo.value));
function aoHistorico(): void {
  if (!sessao) return;
  const rota = lerRota();
  const fichaAtual = ficha;
  const pacienteId = fichaPaciente?.id;
  const secao = fichaAtual?.secaoAtual();
  const pendencia = fichaAtual?.pendencia();
  const mudouSecao =
    rota.tipo !== 'ficha' || rota.ficha.id !== pacienteId || rota.ficha.secao !== secao;
  if (mudouSecao && fichaAtual && pacienteId && secao && pendencia) {
    const destino = window.location.href;
    void (async () => {
      const podeSair = await confirmarSaidaDaSecao(pendencia.mensagem);
      if (ficha !== fichaAtual || window.location.href !== destino) return;
      if (!podeSair) {
        registrarRota(pacienteId, secao, true);
        return;
      }
      fecharGavetaLateral();
      navegarPelaRota();
      focarDestinoDaCasca();
    })();
    return;
  }
  fecharGavetaLateral();
  navegarPelaRota();
  focarDestinoDaCasca();
}
function seguirDestino(destino: string): void {
  const pendencia = pendenciaFicha();
  if (!pendencia) {
    fecharGavetaLateral();
    irPara(destino);
    return;
  }
  void (async () => {
    if (!(await confirmarSaidaDaSecao(pendencia.mensagem))) return;
    fecharGavetaLateral();
    irPara(destino);
  })();
}
elemento('administracao-abas').addEventListener('click', (evento) => {
  const alvo = (evento.target as HTMLElement | null)?.closest('a.administracao-aba');
  if (!(alvo instanceof HTMLAnchorElement)) return;
  evento.preventDefault();
  irPara(new URL(alvo.href).hash);
});
newPatientLink.addEventListener('click', (evento) => {
  evento.preventDefault();
  elemento('create-title').focus();
  registration.scrollIntoView({ block: 'start' });
});
const camposComErro: {
  input: HTMLInputElement | HTMLSelectElement;
  chave: string;
  erro: string;
}[] = [
  { input: nameInput, chave: 'nome', erro: 'name-error' },
  { input: preferredInput, chave: 'nome_preferencia', erro: 'preferred-error' },
  { input: birthInput, chave: 'data_nascimento', erro: 'birth-error' },
  { input: situacaoInput, chave: 'situacao', erro: 'status-error' },
  {
    input: responsavelInput,
    chave: 'responsavel_id',
    erro: 'manager-error',
  },
];
for (const campo of camposComErro) {
  campo.input.addEventListener('input', () => {
    if (!campo.input.hasAttribute('aria-invalid')) return;
    const cadastro = lerFormularioCadastro();
    if (!cadastro.success && cadastro.error.issues.some((item) => item.path[0] === campo.chave))
      return;
    marcarInvalidezCadastro(campo.input, false);
    elemento(campo.erro).textContent = '';
  });
}
// Os contatos são linhas dinâmicas: corrigir uma delas limpa a marca de erro sem esperar novo envio.
for (const evento of ['input', 'change'])
  elemento('contacts-list').addEventListener(evento, () => {
    if (!elemento('contacts-error').textContent) return;
    const cadastro = lerFormularioCadastro();
    casoNovo.marcarContatos(
      !cadastro.success && cadastro.error.issues.some((item) => item.path[0] === 'contatos'),
    );
  });
document.addEventListener('visibilitychange', () => {
  fecharGavetaLateral();
  if (sessao) {
    if (fichaView.contains(document.activeElement)) focoAposLoginOculto = true;
    patientsView.hidden = true;
    casca.atualizarNavegacao({ visivel: false });
    revalidacaoStatus.hidden = false;
  }
  // Leituras familiares precisam consultar novamente a audiência de cada conteúdo.
  // O Diário preserva o editor e invalida suas próprias leituras ao ocultar.
  if (
    document.hidden &&
    ficha &&
    (ficha.secaoAtual() === 'visao' ||
      (sessao?.usuario.perfil === 'familia' && ficha.secaoAtual() !== 'diario'))
  )
    ficha.limparSecao();
  void revalidarAcesso();
});
window.addEventListener('beforeunload', (evento) => {
  if (!cadastroPendente && !cadastroEmRevalidacao && !pendenciaFicha()) return;
  // Aviso é apenas mitigação: o navegador pode ignorá-lo e não há recuperação
  // após fechamento sem reconciliação autorizada no servidor.
  evento.preventDefault();
  evento.returnValue = '';
});
window.addEventListener('pagehide', (evento) => {
  // Evita restaurar dados protegidos e credenciais pelo back/forward cache.
  if (cadastroEmRevalidacao) usuariosComCadastroIncerto.add(cadastroEmRevalidacao.usuarioId);
  cadastroEmRevalidacao = null;
  mostrarAcesso();
  if (!evento.persisted) desmontarCamposDeCadastro();
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
    if (falhaGoogle || semAutorizacaoGoogle) {
      aviso(
        'workspace-feedback',
        semAutorizacaoGoogle
          ? 'A conta Google escolhida não tem acesso liberado. Sua sessão anterior continua ativa.'
          : 'Não foi possível concluir a entrada com Google. Sua sessão anterior continua ativa.',
        'error',
      );
    }
    if (document.hidden) {
      focoAposLoginOculto = true;
      return;
    }
    revalidacaoStatus.hidden = true;
    patientsView.hidden = false;
    casca.atualizarNavegacao({ visivel: true });
    document.title = 'FFCMApp | Pacientes';
    if (await carregarPacientes()) await abrirFichaPelaRota();
    navegarPelaRota();
    focarDestinoDaCasca();
  } catch (erro) {
    if (versao !== revisao) return;
    mostrarAcesso(
      erro instanceof FalhaApi && erro.status === 401
        ? semAutorizacaoGoogle
          ? 'A conta Google escolhida não tem acesso liberado neste sistema. Confira se você entrou com a conta da organização e fale com a administração.'
          : falhaGoogle
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

// Casca offline (FR-071). O aviso de falta de rede é estado da casca; nenhuma área mostra dado
// anterior porque nenhuma resposta de API é guardada no aparelho. O registro do worker não
// bloqueia nada: sem suporte ou com falha, o produto segue igual pelo navegador.
montarEstadoDeRede(elemento('estado-rede'));
void registrarCascaOffline();

const casca = iniciarCasca(
  elemento('raiz-react'),
  aoHistorico,
  {
    barra: elemento('casca-barra'),
    lateral: elemento('casca-lateral'),
    aoNavegar: seguirDestino,
    aoSair: () => void sair(),
    aoBuscar: buscarNaCarteira,
  },
  { raiz: listaPacientes, abrir: abrirPacienteDaCarteira },
);
void restaurarSessao();
