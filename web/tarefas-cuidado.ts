import type {
  RegistroTarefaCuidado,
  TarefaCuidado,
} from '../packages/contracts/src/tarefa-cuidado.ts';
import { confirmar, confirmarDescarte } from './confirmacao.js';
import type { criarCicloTarefaCuidado } from './ciclo-tarefa-cuidado.js';
import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.ts';
import { esqueletoCarregando, iniciarAcao } from './esqueleto.js';
import { botao, estadoVazio } from './ui/basicos.js';

type RegistroTarefa = RegistroTarefaCuidado;
export type ServicoTarefasCuidado = {
  consultarTarefas(pacienteId: string): Promise<RegistroTarefa[]>;
  ciclo?: ReturnType<typeof criarCicloTarefaCuidado>;
  atualizarTarefa?(
    pacienteId: string,
    tarefaId: string,
    versao: number,
    chave: string,
    tarefa: TarefaCuidado,
  ): Promise<void>;
  criarTarefa?(
    pacienteId: string,
    tarefaId: string,
    chave: string,
    tarefa: TarefaCuidado,
  ): Promise<void>;
};

/** Consulta vinculada ao paciente; o servidor determina o acesso. */
export function montarTarefasCuidado(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoTarefasCuidado,
  acessoPerdido: (erro: unknown) => void,
  alteracaoPendente: (pendente: boolean) => void = () => {},
): () => void {
  let ativa = true;
  let recuperacao = false;
  let bloqueada = !!servico.ciclo;
  let filtroEstado = '';
  let filtroPrioridade = '';
  let controlesFiltro: HTMLSelectElement[] = [];
  const formulariosAlterados = new Set<HTMLFormElement>();
  const marcarAlterado = (form: HTMLFormElement) => {
    formulariosAlterados.add(form);
    alteracaoPendente(true);
  };
  const permitirAtualizacao = async (form: HTMLFormElement) =>
    ![...formulariosAlterados].some((outro) => outro !== form) ||
    (await confirmarDescarte('as alterações não salvas em outra tarefa'));
  const bloquearOutrosFormularios = (atual: HTMLFormElement) => {
    const controles = [
      ...raiz.querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement
      >('form input, form textarea, form select, form button'),
    ].filter((controle) => controle.form !== atual && !controle.disabled);
    controles.push(...controlesFiltro.filter((controle) => !controle.disabled));
    for (const controle of controles) controle.disabled = true;
    return () => {
      for (const controle of controles) controle.disabled = false;
    };
  };
  const elemento = <K extends keyof HTMLElementTagNameMap>(tipo: K, texto?: string) => {
    const el = document.createElement(tipo);
    if (texto !== undefined) el.textContent = texto;
    return el;
  };
  const estados: Record<RegistroTarefa['tarefa']['estado'], string> = {
    pendente: 'Pendente',
    em_andamento: 'Em andamento',
    concluida: 'Concluída',
    cancelada: 'Cancelada',
  };
  const prioridades: Record<RegistroTarefa['tarefa']['prioridade'], string> = {
    baixa: 'Baixa',
    media: 'Média',
    alta: 'Alta',
  };
  const consultar = () => {
    controlesFiltro = [];
    const status = elemento('p', 'Carregando tarefas…');
    status.setAttribute('role', 'status');
    raiz.replaceChildren(esqueletoCarregando(3, true), status);
    void servico
      .consultarTarefas(pacienteId)
      .then((registros) => {
        if (!ativa) return;
        const secao = elemento('section');
        secao.append(elemento('h2', 'Tarefas da equipe'));
        if (!servico.criarTarefa && !servico.atualizarTarefa)
          secao.append(elemento('p', 'Consulta disponível. Criação e edição ainda indisponíveis.'));
        const ciclo = servico.ciclo;
        if (ciclo && bloqueada) {
          const aviso = elemento(
            'p',
            'Antes de alterar tarefas, confira se já existe algum envio aguardando resposta.',
          );
          aviso.setAttribute('role', 'status');
          const confirmar = botao({ rotulo: 'Conferir e liberar', peso: 'secundario' });
          let cercado = false;
          const falhou = (erro: unknown) => {
            if (!ativa) return;
            if (exigeNovoAcesso(erro)) {
              ativa = false;
              raiz.replaceChildren();
              acessoPerdido(erro);
              return;
            }
            aviso.textContent = 'Não foi possível conferir agora. Tente novamente.';
            confirmar.disabled = false;
          };
          const verificar = async () => {
            let situacao = await ciclo.consultar();
            if (!situacao.resultado_pendente && (!cercado || situacao.reserva)) {
              await ciclo.encerrar();
              cercado = true;
              situacao = await ciclo.consultar();
            }
            if (!ativa) return;
            if (situacao.resultado_pendente) {
              const pendente = situacao.resultado_pendente;
              aviso.textContent = `A alteração enviada antes ${pendente.resultado === 'confirmada' ? 'foi salva' : 'não foi salva'}. Confira a tarefa na lista antes de continuar.`;
              confirmar.textContent = 'Entendi, liberar as tarefas';
              confirmar.onclick = () => {
                confirmar.disabled = true;
                const terminarAcao = iniciarAcao(confirmar);
                aviso.textContent = 'Concluindo conferência…';
                void (async () => {
                  await ciclo.reconhecer();
                  cercado = true;
                  confirmar.onclick = iniciar;
                  await verificar();
                })()
                  .catch(falhou)
                  .finally(terminarAcao);
              };
              confirmar.disabled = false;
              return;
            }
            if (situacao.reserva) {
              aviso.textContent = 'Outro envio começou enquanto isso. Confira novamente.';
              confirmar.textContent = 'Conferir e liberar';
              confirmar.onclick = iniciar;
              confirmar.disabled = false;
              return;
            }
            ciclo.liberar();
            bloqueada = false;
            consultar();
          };
          const iniciar = () => {
            confirmar.disabled = true;
            const terminarAcao = iniciarAcao(confirmar);
            aviso.textContent = 'Conferindo tarefas…';
            void verificar().catch(falhou).finally(terminarAcao);
          };
          confirmar.onclick = iniciar;
          secao.append(aviso, confirmar);
        }
        if (servico.criarTarefa && !bloqueada) secao.append(criarFormulario(servico.criarTarefa));
        if (!registros.length)
          secao.append(estadoVazio('Nenhuma tarefa encontrada para este paciente.'));
        const itens: { registro: RegistroTarefa; elemento: HTMLElement }[] = [];
        const semResultados = elemento('p', 'Nenhuma tarefa corresponde aos filtros selecionados.');
        semResultados.setAttribute('role', 'status');
        if (registros.length) {
          const filtros = elemento('div');
          const criarFiltro = (rotulo: string, opcoes: Record<string, string>, valor: string) => {
            const label = elemento('label', rotulo);
            const select = elemento('select');
            const todos = elemento('option', 'Todos');
            todos.value = '';
            select.append(todos);
            for (const [chave, texto] of Object.entries(opcoes)) {
              const opcao = elemento('option', texto);
              opcao.value = chave;
              select.append(opcao);
            }
            select.value = valor;
            label.append(select);
            filtros.append(label);
            return select;
          };
          const estado = criarFiltro('Filtrar por estado', estados, filtroEstado);
          const prioridade = criarFiltro('Filtrar por prioridade', prioridades, filtroPrioridade);
          controlesFiltro = [estado, prioridade];
          const aplicarFiltros = () => {
            filtroEstado = estado.value;
            filtroPrioridade = prioridade.value;
            let visiveis = 0;
            for (const item of itens) {
              const corresponde =
                (!filtroEstado || item.registro.tarefa.estado === filtroEstado) &&
                (!filtroPrioridade || item.registro.tarefa.prioridade === filtroPrioridade);
              item.elemento.hidden = !corresponde;
              if (corresponde) visiveis++;
            }
            semResultados.hidden = visiveis > 0;
          };
          estado.addEventListener('change', aplicarFiltros);
          prioridade.addEventListener('change', aplicarFiltros);
          secao.append(filtros, semResultados);
          for (const registro of registros) {
            const { tarefa } = registro;
            const item = elemento('article');
            item.append(elemento('h3', tarefa.descricao));
            item.append(elemento('p', `Estado: ${estados[tarefa.estado]}`));
            const prazo = tarefa.prazo.split('-').reverse().join('/');
            for (const [rotulo, valor] of [
              ['Responsável', tarefa.responsavel],
              ['Prazo', prazo],
              ['Prioridade', prioridades[tarefa.prioridade]],
              ...(tarefa.acaoRealizada ? [['Ação realizada', tarefa.acaoRealizada]] : []),
              ...(tarefa.justificativa ? [['Justificativa', tarefa.justificativa]] : []),
            ])
              item.append(elemento('p', `${rotulo}: ${valor}`));
            if (servico.atualizarTarefa && !bloqueada)
              item.append(criarAtualizacao(registro, servico.atualizarTarefa));
            secao.append(item);
            itens.push({ registro, elemento: item });
          }
          aplicarFiltros();
        }
        raiz.replaceChildren(secao);
      })
      .catch((erro: unknown) => {
        if (!ativa) return;
        if (exigeNovoAcesso(erro)) {
          ativa = false;
          raiz.replaceChildren();
          acessoPerdido(erro);
          return;
        }
        status.textContent = mensagemFalha(erro);
        const tentar = botao({ rotulo: 'Tentar novamente', peso: 'secundario' });
        tentar.addEventListener('click', consultar);
        raiz.replaceChildren(status, tentar);
      });
  };
  const oferecerConsulta = (form: HTMLFormElement, status: HTMLElement, mensagem: string) => {
    recuperacao = true;
    for (const grupo of raiz.querySelectorAll<HTMLFieldSetElement>('form fieldset'))
      grupo.disabled = false;
    for (const campo of raiz.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      'form input, form textarea',
    )) {
      campo.disabled = false;
      campo.readOnly = true;
    }
    for (const controle of raiz.querySelectorAll<HTMLSelectElement | HTMLButtonElement>(
      'form select, form button',
    ))
      controle.disabled = true;
    status.textContent = mensagem;
    const recarregar = botao({ rotulo: 'Consultar tarefas novamente', peso: 'secundario' });
    recarregar.addEventListener('click', () => {
      void (async () => {
        if (
          !(await confirmar({
            titulo: 'Consultar de novo e descartar o que não foi salvo nesta tela?',
            detalhe:
              'A consulta substitui o que está na tela pelos dados do serviço. Copie o que precisar antes de seguir.',
            acao: 'Consultar de novo',
            cancelar: 'Continuar nesta tela',
          }))
        )
          return;
        formulariosAlterados.clear();
        alteracaoPendente(false);
        recuperacao = false;
        bloqueada = !!servico.ciclo;
        consultar();
      })();
    });
    form.append(recarregar);
  };
  const criarAtualizacao = (
    registro: RegistroTarefa,
    atualizar: NonNullable<ServicoTarefasCuidado['atualizarTarefa']>,
  ) => {
    const form = elemento('form');
    const campos = elemento('fieldset');
    campos.append(elemento('legend', `Editar tarefa: ${registro.tarefa.descricao}`));
    const campo = (rotulo: string, tipo: 'text' | 'date', valor: string, tamanho?: number) => {
      const label = elemento('label', rotulo);
      const input = elemento('input');
      input.type = tipo;
      input.required = true;
      input.value = valor;
      if (tamanho) input.maxLength = tamanho;
      label.append(input);
      campos.append(label);
      return input;
    };
    const descricao = campo('Descrição', 'text', registro.tarefa.descricao, 4000);
    const responsavel = campo('Responsável', 'text', registro.tarefa.responsavel, 4000);
    const prazo = campo('Prazo', 'date', registro.tarefa.prazo);
    const labelPrioridade = elemento('label', 'Prioridade');
    const prioridade = elemento('select');
    for (const [valor, rotulo] of Object.entries(prioridades)) {
      const opcao = elemento('option', rotulo);
      opcao.value = valor;
      prioridade.append(opcao);
    }
    prioridade.value = registro.tarefa.prioridade;
    labelPrioridade.append(prioridade);
    campos.append(labelPrioridade);
    const labelEstado = elemento('label', 'Estado');
    const estado = elemento('select');
    for (const [valor, rotulo] of Object.entries(estados)) {
      const opcao = elemento('option', rotulo);
      opcao.value = valor;
      estado.append(opcao);
    }
    estado.value = registro.tarefa.estado;
    labelEstado.append(estado);
    const labelAcao = elemento('label', 'Ação realizada');
    const acao = elemento('textarea');
    acao.maxLength = 4000;
    acao.value = registro.tarefa.acaoRealizada ?? '';
    labelAcao.append(acao);
    const labelJustificativa = elemento('label', 'Justificativa');
    const justificativa = elemento('textarea');
    justificativa.maxLength = 4000;
    justificativa.value = registro.tarefa.justificativa ?? '';
    labelJustificativa.append(justificativa);
    campos.append(labelEstado, labelAcao, labelJustificativa);
    const salvar = botao({ rotulo: 'Salvar tarefa', peso: 'principal', tipo: 'submit' });
    const status = elemento('p');
    status.setAttribute('role', 'status');
    form.append(campos, salvar, status);
    form.addEventListener('input', () => marcarAlterado(form));
    form.addEventListener('change', () => marcarAlterado(form));
    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      if (recuperacao) return;
      const descricaoLimpa = descricao.value.trim();
      const responsavelLimpo = responsavel.value.trim();
      if (
        !descricaoLimpa ||
        !responsavelLimpo ||
        !prazo.value ||
        !Object.hasOwn(prioridades, prioridade.value)
      ) {
        status.textContent = 'Preencha descrição, responsável, prazo e prioridade.';
        return;
      }
      const acaoLimpa = acao.value.trim();
      const justificativaLimpa = justificativa.value.trim();
      if (estado.value === 'concluida' && !acaoLimpa && !justificativaLimpa) {
        status.textContent = 'Informe a ação realizada ou a justificativa para concluir.';
        return;
      }
      if (!Object.hasOwn(estados, estado.value)) return;
      if (!(await permitirAtualizacao(form))) return;
      const tarefa: TarefaCuidado = {
        ...registro.tarefa,
        descricao: descricaoLimpa,
        responsavel: responsavelLimpo,
        prazo: prazo.value,
        prioridade: prioridade.value as TarefaCuidado['prioridade'],
        estado: estado.value as TarefaCuidado['estado'],
        acaoRealizada: acaoLimpa || undefined,
        justificativa: justificativaLimpa || undefined,
      };
      const liberarOutros = bloquearOutrosFormularios(form);
      campos.disabled = salvar.disabled = true;
      const terminarAcao = iniciarAcao(salvar);
      alteracaoPendente(true);
      status.textContent = 'Salvando atualização…';
      void atualizar(pacienteId, registro.tarefa_id, registro.versao, crypto.randomUUID(), tarefa)
        .then(() => {
          if (!ativa) return;
          formulariosAlterados.clear();
          alteracaoPendente(false);
          bloqueada = !!servico.ciclo;
          consultar();
        })
        .catch((erro: unknown) => {
          if (!ativa) return;
          if (exigeNovoAcesso(erro)) {
            ativa = false;
            raiz.replaceChildren();
            acessoPerdido(erro);
            return;
          }
          if (
            !!servico.ciclo ||
            resultadoIncerto(erro) ||
            (erro instanceof FalhaApi &&
              ['conflito_versao', 'conflito_idempotencia'].includes(erro.codigo))
          ) {
            oferecerConsulta(
              form,
              status,
              resultadoIncerto(erro)
                ? 'Não foi possível confirmar a atualização. Copie os dados e consulte a tarefa antes de tentar novamente.'
                : 'A tarefa foi alterada. Copie os dados e consulte a versão atual antes de tentar novamente.',
            );
            return;
          }
          liberarOutros();
          campos.disabled = salvar.disabled = false;
          status.textContent = mensagemFalha(erro);
        })
        .finally(terminarAcao);
    });
    return form;
  };
  const criarFormulario = (criar: NonNullable<ServicoTarefasCuidado['criarTarefa']>) => {
    const form = elemento('form');
    const campos = elemento('fieldset');
    campos.append(elemento('legend', 'Nova tarefa'));
    const campo = (rotulo: string, tipo: 'text' | 'date', tamanho?: number) => {
      const label = elemento('label', rotulo);
      const input = elemento('input');
      input.type = tipo;
      input.required = true;
      if (tamanho) input.maxLength = tamanho;
      label.append(input);
      campos.append(label);
      return input;
    };
    const descricao = campo('Descrição', 'text', 4000);
    const responsavel = campo('Responsável', 'text', 4000);
    const prazo = campo('Prazo', 'date');
    const labelPrioridade = elemento('label', 'Prioridade');
    const prioridade = elemento('select');
    for (const [valor, texto] of [
      ['baixa', 'Baixa'],
      ['media', 'Média'],
      ['alta', 'Alta'],
    ] as const) {
      const opcao = elemento('option', texto);
      opcao.value = valor;
      prioridade.append(opcao);
    }
    labelPrioridade.append(prioridade);
    campos.append(labelPrioridade);
    const salvar = botao({ rotulo: 'Criar tarefa', peso: 'principal', tipo: 'submit' });
    const status = elemento('p');
    status.setAttribute('role', 'status');
    form.append(campos, salvar, status);
    form.addEventListener('input', () => marcarAlterado(form));
    form.addEventListener('change', () => marcarAlterado(form));
    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      if (recuperacao) return;
      const descricaoLimpa = descricao.value.trim();
      const responsavelLimpo = responsavel.value.trim();
      if (
        !descricaoLimpa ||
        !responsavelLimpo ||
        !prazo.value ||
        !['baixa', 'media', 'alta'].includes(prioridade.value)
      ) {
        status.textContent = 'Preencha descrição, responsável, prazo e prioridade.';
        return;
      }
      if (!(await permitirAtualizacao(form))) return;
      const tarefa: TarefaCuidado = {
        descricao: descricaoLimpa,
        responsavel: responsavelLimpo,
        prazo: prazo.value,
        prioridade: prioridade.value as TarefaCuidado['prioridade'],
        estado: 'pendente',
      };
      const tarefaId = crypto.randomUUID();
      const chave = crypto.randomUUID();
      const liberarOutros = bloquearOutrosFormularios(form);
      campos.disabled = salvar.disabled = true;
      const terminarAcao = iniciarAcao(salvar);
      alteracaoPendente(true);
      status.textContent = 'Criando tarefa…';
      void criar(pacienteId, tarefaId, chave, tarefa)
        .then(() => {
          if (!ativa) return;
          formulariosAlterados.clear();
          alteracaoPendente(false);
          bloqueada = !!servico.ciclo;
          consultar();
        })
        .catch((erro: unknown) => {
          if (!ativa) return;
          if (exigeNovoAcesso(erro)) {
            ativa = false;
            raiz.replaceChildren();
            acessoPerdido(erro);
            return;
          }
          if (
            !!servico.ciclo ||
            resultadoIncerto(erro) ||
            (erro instanceof FalhaApi &&
              ['conflito_versao', 'conflito_idempotencia'].includes(erro.codigo))
          ) {
            oferecerConsulta(
              form,
              status,
              'Não foi possível confirmar a criação. Copie os dados e consulte as tarefas antes de tentar novamente.',
            );
            return;
          }
          liberarOutros();
          campos.disabled = salvar.disabled = false;
          status.textContent = mensagemFalha(erro);
        })
        .finally(terminarAcao);
    });
    return form;
  };
  consultar();
  return () => {
    ativa = false;
    raiz.replaceChildren();
  };
}
