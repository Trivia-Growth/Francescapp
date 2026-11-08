import type { Anamnese } from '../packages/contracts/src/index.js';
import { exigeNovoAcesso, mensagemFalha } from './api.js';
import type { PacienteFicha } from './ficha-paciente.js';
import type { ObjetivoAtual, Pagina, ServicoPlanoCuidado } from './plano-cuidado.js';
import type { RegistroTarefaCuidado as RegistroTarefa } from '../packages/contracts/src/tarefa-cuidado.js';
import type { ServicoTarefasCuidado } from './tarefas-cuidado.js';

/** Fontes consultadas pela visão. Fonte ausente significa que o perfil não a lê: o bloco nem aparece. */
export type FontesVisaoCaso = {
  objetivos?: Pick<ServicoPlanoCuidado, 'consultarObjetivos'>;
  tarefas?: Pick<ServicoTarefasCuidado, 'consultarTarefas'>;
  anamnese?: { consultarAnamnese(pacienteId: string): Promise<Anamnese | null> };
};

const LIMITE_TAREFAS = 8;
const OBJETIVOS_ENCERRADOS = new Set(['atingido', 'encerrado']);
const formatadorData = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

function dataDeInstante(iso: string | undefined): string | null {
  if (!iso) return null;
  const instante = new Date(iso);
  return Number.isNaN(instante.getTime()) ? null : formatadorData.format(instante);
}

function dataCivil(valor: string): string {
  const [ano, mes, dia] = valor.split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
}

function maisRecente(instantes: (string | undefined)[]): string | undefined {
  return instantes
    .filter((valor): valor is string => Boolean(dataDeInstante(valor)))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
}

type Corpo = { aviso?: string; atualizadoEm?: string };

/** Compõe o caso a partir dos serviços que já existem; cada bloco carrega, falha e tenta de novo sozinho. */
export function montarVisaoCaso(
  raiz: HTMLElement,
  paciente: PacienteFicha,
  fontes: FontesVisaoCaso,
  acessoPerdido: (erro: unknown) => boolean,
): () => void {
  let ativa = true;
  const geracoes = new Map<string, number>();
  const elemento = <K extends keyof HTMLElementTagNameMap>(
    tipo: K,
    texto?: string,
    classe?: string,
  ) => {
    const el = document.createElement(tipo);
    if (texto !== undefined) el.textContent = texto;
    if (classe) el.className = classe;
    return el;
  };
  const lista = (itens: string[]) => {
    const ul = elemento('ul', undefined, 'visao-lista');
    for (const item of itens) ul.append(elemento('li', item));
    return ul;
  };
  const blocoBase = (id: string, titulo: string) => {
    const secao = elemento('section', undefined, 'visao-bloco');
    secao.dataset.bloco = id;
    const cabecalho = elemento('h3', titulo);
    const corpo = elemento('div', undefined, 'visao-corpo');
    secao.append(cabecalho, corpo);
    return { secao, corpo };
  };

  function bloco<T>(
    id: string,
    titulo: string,
    consultar: () => Promise<T>,
    desenhar: (dados: T, corpo: HTMLElement) => Corpo,
  ): HTMLElement {
    const { secao, corpo } = blocoBase(id, titulo);
    const carregar = (): void => {
      const numero = (geracoes.get(id) ?? 0) + 1;
      geracoes.set(id, numero);
      corpo.setAttribute('aria-busy', 'true');
      corpo.replaceChildren(elemento('p', 'Carregando…', 'visao-estado'));
      consultar().then(
        (dados) => {
          if (!ativa || geracoes.get(id) !== numero) return;
          corpo.removeAttribute('aria-busy');
          corpo.replaceChildren();
          const { aviso, atualizadoEm } = desenhar(dados, corpo);
          if (aviso) corpo.append(elemento('p', aviso, 'visao-aviso'));
          corpo.append(
            elemento(
              'p',
              dataDeInstante(atualizadoEm)
                ? `Atualizado em ${dataDeInstante(atualizadoEm)}.`
                : 'Data da última atualização indisponível.',
              'visao-data',
            ),
          );
        },
        (erro: unknown) => {
          if (!ativa || geracoes.get(id) !== numero) return;
          if (exigeNovoAcesso(erro)) {
            ativa = false;
            raiz.replaceChildren();
            acessoPerdido(erro);
            return;
          }
          corpo.removeAttribute('aria-busy');
          const falha = elemento(
            'p',
            `${mensagemFalha(erro)} Este bloco não foi carregado.`,
            'visao-estado',
          );
          falha.dataset.tone = 'error';
          const tentar = elemento('button', 'Tentar novamente', 'button-secondary');
          tentar.type = 'button';
          tentar.addEventListener('click', carregar);
          corpo.replaceChildren(falha, tentar);
        },
      );
    };
    carregar();
    return secao;
  }

  const blocos: HTMLElement[] = [];

  const identificacao = blocoBase('identificacao', 'Identificação');
  identificacao.corpo.append(
    elemento('p', paciente.nome, 'visao-destaque'),
    elemento(
      'p',
      paciente.nome_preferencia
        ? `Nome de preferência: ${paciente.nome_preferencia}`
        : 'Nome de preferência não informado.',
    ),
    elemento('p', 'Data da última atualização indisponível.', 'visao-data'),
  );
  blocos.push(identificacao.secao);

  const { objetivos, tarefas, anamnese } = fontes;
  if (objetivos)
    blocos.push(
      bloco<Pagina<ObjetivoAtual & { data?: string }>>(
        'objetivos',
        'Objetivos ativos',
        () => objetivos.consultarObjetivos(paciente.id),
        (pagina, corpo) => {
          const ativos = pagina.itens.filter(
            ({ objetivo }) => !OBJETIVOS_ENCERRADOS.has(objetivo.estado),
          );
          if (!ativos.length) corpo.append(elemento('p', 'Nenhum objetivo ativo nesta consulta.'));
          else
            corpo.append(
              lista(
                ativos.map(
                  ({ objetivo }) =>
                    `${objetivo.descricao} · ${objetivo.estado} · Revisão prevista: ${dataCivil(objetivo.dataRevisao)}`,
                ),
              ),
            );
          return {
            ...(pagina.proximo_cursor
              ? {
                  aviso:
                    'Há mais objetivos no Plano de cuidado; esta visão mostra só os primeiros.',
                }
              : {}),
            ...(maisRecente(pagina.itens.map((item) => item.data))
              ? { atualizadoEm: maisRecente(pagina.itens.map((item) => item.data)) as string }
              : {}),
          };
        },
      ),
    );
  if (tarefas)
    blocos.push(
      bloco<RegistroTarefa[]>(
        'tarefas',
        'Tarefas pendentes',
        () => tarefas.consultarTarefas(paciente.id),
        (registros, corpo) => {
          const abertas = registros
            .filter(
              ({ tarefa }) => tarefa.estado === 'pendente' || tarefa.estado === 'em_andamento',
            )
            .sort((a, b) => a.tarefa.prazo.localeCompare(b.tarefa.prazo));
          if (!abertas.length) corpo.append(elemento('p', 'Nenhuma tarefa em aberto.'));
          else
            corpo.append(
              lista(
                abertas
                  .slice(0, LIMITE_TAREFAS)
                  .map(
                    ({ tarefa }) =>
                      `${tarefa.descricao} · ${tarefa.responsavel} · Prazo: ${dataCivil(tarefa.prazo)}`,
                  ),
              ),
            );
          const recente = maisRecente(registros.map((registro) => registro.data));
          return {
            ...(abertas.length > LIMITE_TAREFAS
              ? { aviso: `Há mais ${abertas.length - LIMITE_TAREFAS} tarefas na seção Tarefas.` }
              : {}),
            ...(recente ? { atualizadoEm: recente } : {}),
          };
        },
      ),
    );
  if (anamnese)
    blocos.push(
      bloco<Anamnese | null>(
        'anamnese',
        'Anamnese',
        () => anamnese.consultarAnamnese(paciente.id),
        (registro, corpo) => {
          if (!registro) {
            corpo.append(elemento('p', 'Nenhuma anamnese registrada ainda.'));
            return {};
          }
          const incompletas = registro.secoes
            .filter((secao) =>
              secao.camposEsperados.some((campo) => {
                const resposta = secao.respostas.find((item) => item.campo === campo);
                return !resposta || resposta.estado === 'pendente';
              }),
            )
            .map((secao) => secao.id);
          corpo.append(
            incompletas.length
              ? elemento('p', 'Seções com pendências:')
              : elemento('p', 'Nenhuma pendência identificada nos campos informados.'),
          );
          if (incompletas.length) corpo.append(lista(incompletas));
          return registro.criado_em ? { atualizadoEm: registro.criado_em } : {};
        },
      ),
    );

  const indisponiveis = blocoBase('indisponivel', 'Ainda sem fonte nesta versão');
  indisponiveis.corpo.append(
    lista([
      'Situação do caso e responsável: indisponíveis nesta versão',
      'Mudanças recentes: indisponíveis nesta versão',
      'Atenção sinalizada por profissional: indisponível nesta versão',
      'Agenda: indisponível nesta versão',
      'Próxima revisão: indisponível nesta versão',
    ]),
  );
  blocos.push(indisponiveis.secao);

  raiz.replaceChildren(elemento('h2', 'Visão do caso'), ...blocos);

  return () => {
    ativa = false;
    for (const id of geracoes.keys()) geracoes.set(id, (geracoes.get(id) ?? 0) + 1);
    raiz.replaceChildren();
  };
}
