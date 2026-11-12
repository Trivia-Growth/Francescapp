import type { Anamnese, PacienteEdicao } from '../packages/contracts/src/index.js';
import {
  descreverResponsavel,
  rotulosSituacao,
  type ResponsavelOpcao,
} from './acompanhamento-caso.js';
import {
  avisoSinalOperacional,
  rotulosEstadoSinal,
  rotulosTipoPendencia,
  type SinalOperacional,
} from '../packages/contracts/src/pendencia.js';
import { exigeNovoAcesso, mensagemFalha } from './api.js';
import { dataDeInstante } from './datas.js';
import { esqueletoCarregando } from './esqueleto.js';
import type { PacienteFicha } from './ficha-paciente.js';
import type { ObjetivoAtual, Pagina, ServicoPlanoCuidado } from './plano-cuidado.js';
import type { RegistroTarefaCuidado as RegistroTarefa } from '../packages/contracts/src/tarefa-cuidado.js';
import type { ServicoTarefasCuidado } from './tarefas-cuidado.js';

/** Fontes consultadas pela visão. Fonte ausente significa que o perfil não a lê: o bloco nem aparece. */
export type FontesVisaoCaso = {
  objetivos?: Pick<ServicoPlanoCuidado, 'consultarObjetivos'>;
  tarefas?: Pick<ServicoTarefasCuidado, 'consultarTarefas'>;
  anamnese?: { consultarAnamnese(pacienteId: string): Promise<Anamnese | null> };
  /** Só o Administrador: situação e responsável vêm da leitura de edição, que o servidor nega aos demais. */
  situacao?: {
    consultarPaciente(pacienteId: string): Promise<PacienteEdicao>;
    listarResponsaveis?: () => Promise<ResponsavelOpcao[]>;
  };
  /** FR-006: pendências, próxima revisão e data da última mudança do caso. As três vinham
   * anunciadas como indisponíveis; agora têm fonte real no sinal operacional do caso. */
  pendencias?: { consultar(pacienteId: string): Promise<SinalOperacional> };
};

const LIMITE_TAREFAS = 8;
const OBJETIVOS_ENCERRADOS = new Set(['atingido', 'encerrado']);
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
      corpo.replaceChildren(esqueletoCarregando(2, true), elemento('p', 'Carregando…', 'sr-only'));
      consultar().then(
        (dados) => {
          if (!ativa || geracoes.get(id) !== numero) return;
          corpo.removeAttribute('aria-busy');
          corpo.replaceChildren();
          const { aviso, atualizadoEm } = desenhar(dados, corpo);
          if (aviso) corpo.append(elemento('p', aviso, 'visao-aviso'));
          // Sem data conhecida o bloco não diz nada: repetir "indisponível" em cada
          // bloco faz a tela principal do caso parecer um relatório de falhas.
          const data = dataDeInstante(atualizadoEm);
          if (data) corpo.append(elemento('p', `Atualizado em ${data}.`, 'visao-data'));
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
  );
  blocos.push(identificacao.secao);

  const { objetivos, tarefas, anamnese, situacao, pendencias } = fontes;
  if (pendencias)
    blocos.push(
      bloco<SinalOperacional>(
        'pendencias',
        'Pendências e próxima revisão',
        () => pendencias.consultar(paciente.id),
        (sinal, corpo) => {
          const destaque = elemento('p', rotulosEstadoSinal[sinal.estado], 'visao-destaque');
          destaque.dataset.estado = sinal.estado;
          corpo.append(destaque, elemento('p', avisoSinalOperacional, 'visao-aviso'));
          const abertas = sinal.pendencias.filter((item) => item.estado !== 'resolvida');
          const linhas = [
            ...(sinal.acordo?.proxima_revisao_em
              ? [`Próxima revisão: ${dataCivil(sinal.acordo.proxima_revisao_em)}`]
              : []),
            ...abertas.map(
              (item) =>
                `${rotulosTipoPendencia[item.tipo]}: ${item.motivo}${
                  item.estado === 'aberta' ? '' : ` (${item.estado})`
                }`,
            ),
          ];
          if (linhas.length) corpo.append(lista(linhas));
          else
            corpo.append(
              elemento(
                'p',
                sinal.estado === 'informacao_insuficiente'
                  ? 'Periodicidade do acompanhamento ainda não acordada: não há como apurar pendências.'
                  : 'Nenhuma pendência operacional em aberto.',
              ),
            );
          // "Mudanças recentes" de FR-006: a data da última gravação em qualquer fatia do
          // caso. Mostra quando o caso mudou, sem repetir o conteúdo que já tem tela própria.
          return sinal.ultima_atualizacao_em ? { atualizadoEm: sinal.ultima_atualizacao_em } : {};
        },
      ),
    );
  if (situacao)
    blocos.push(
      bloco<{ edicao: PacienteEdicao; opcoes: ResponsavelOpcao[] }>(
        'situacao',
        'Situação e responsável',
        async () => {
          const edicao = await situacao.consultarPaciente(paciente.id);
          if (edicao.id.toLowerCase() !== paciente.id.toLowerCase()) throw new Error();
          let opcoes: ResponsavelOpcao[] = [];
          if (situacao.listarResponsaveis)
            try {
              opcoes = await situacao.listarResponsaveis();
            } catch (erro) {
              // Sem a lista da equipe o responsável aparece sem identificação, mas a situação não se perde.
              if (exigeNovoAcesso(erro)) throw erro;
            }
          return { edicao, opcoes };
        },
        ({ edicao, opcoes }, corpo) => {
          const atual = edicao.acompanhamento[0];
          if (!atual) {
            corpo.append(
              elemento('p', 'A completar: situação do caso e responsável ainda não indicados.'),
            );
            return {};
          }
          corpo.append(
            lista([
              `Situação: ${atual.situacao ? rotulosSituacao[atual.situacao] : 'a completar'}`,
              `Responsável: ${descreverResponsavel(atual, opcoes)}`,
            ]),
          );
          return { atualizadoEm: atual.criado_em };
        },
      ),
    );
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

  // Bloco sem fonte não aparece: a visão mostra o que o perfil lê, e nunca anuncia
  // o que falta nem inventa valor de exemplo para atenção, agenda ou próxima revisão.
  raiz.replaceChildren(elemento('h2', 'Visão do caso'), ...blocos);

  return () => {
    ativa = false;
    for (const id of geracoes.keys()) geracoes.set(id, (geracoes.get(id) ?? 0) + 1);
    raiz.replaceChildren();
  };
}
