import type {
  RegistroTarefaCuidado,
  TarefaCuidado,
} from '../packages/contracts/src/tarefa-cuidado.ts';
import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.ts';

type RegistroTarefa = RegistroTarefaCuidado;
export type ServicoTarefasCuidado = {
  consultarTarefas(pacienteId: string): Promise<RegistroTarefa[]>;
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
  const formulariosAlterados = new Set<HTMLFormElement>();
  const marcarAlterado = (form: HTMLFormElement) => {
    formulariosAlterados.add(form);
    alteracaoPendente(true);
  };
  const permitirAtualizacao = (form: HTMLFormElement) =>
    ![...formulariosAlterados].some((outro) => outro !== form) ||
    window.confirm('Há alterações não salvas em outra tarefa. Deseja descartá-las?');
  const bloquearOutrosFormularios = (atual: HTMLFormElement) => {
    const controles = [
      ...raiz.querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement
      >('form input, form textarea, form select, form button'),
    ].filter((controle) => controle.form !== atual && !controle.disabled);
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
    const status = elemento('p', 'Carregando tarefas…');
    status.setAttribute('role', 'status');
    raiz.replaceChildren(status);
    void servico
      .consultarTarefas(pacienteId)
      .then((registros) => {
        if (!ativa) return;
        const secao = elemento('section');
        secao.append(elemento('h2', 'Tarefas da equipe'));
        if (servico.criarTarefa) secao.append(criarFormulario(servico.criarTarefa));
        if (!registros.length)
          secao.append(elemento('p', 'Nenhuma tarefa encontrada para este paciente.'));
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
          if (servico.atualizarTarefa)
            item.append(criarAtualizacao(registro, servico.atualizarTarefa));
          secao.append(item);
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
        const tentar = elemento('button', 'Tentar novamente');
        tentar.type = 'button';
        tentar.addEventListener('click', consultar);
        raiz.append(tentar);
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
    const recarregar = elemento('button', 'Consultar tarefas novamente');
    recarregar.type = 'button';
    recarregar.addEventListener('click', () => {
      if (
        !window.confirm(
          'A consulta descartará os dados não salvos desta tela. Copie o que precisar antes de continuar. Deseja consultar novamente?',
        )
      )
        return;
      formulariosAlterados.clear();
      alteracaoPendente(false);
      recuperacao = false;
      consultar();
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
    const salvar = elemento('button', 'Salvar tarefa');
    salvar.type = 'submit';
    const status = elemento('p');
    status.setAttribute('role', 'status');
    form.append(campos, salvar, status);
    form.addEventListener('input', () => marcarAlterado(form));
    form.addEventListener('change', () => marcarAlterado(form));
    form.addEventListener('submit', (evento) => {
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
      if (!permitirAtualizacao(form)) return;
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
      alteracaoPendente(true);
      status.textContent = 'Salvando atualização…';
      void atualizar(pacienteId, registro.tarefa_id, registro.versao, crypto.randomUUID(), tarefa)
        .then(() => {
          if (!ativa) return;
          formulariosAlterados.clear();
          alteracaoPendente(false);
          consultar();
        })
        .catch((erro: unknown) => {
          if (!ativa) return;
          if (exigeNovoAcesso(erro)) {
            acessoPerdido(erro);
            return;
          }
          if (
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
        });
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
    const salvar = elemento('button', 'Criar tarefa');
    salvar.type = 'submit';
    salvar.className = 'button-primary';
    const status = elemento('p');
    status.setAttribute('role', 'status');
    form.append(campos, salvar, status);
    form.addEventListener('input', () => marcarAlterado(form));
    form.addEventListener('change', () => marcarAlterado(form));
    form.addEventListener('submit', (evento) => {
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
      if (!permitirAtualizacao(form)) return;
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
      alteracaoPendente(true);
      status.textContent = 'Criando tarefa…';
      void criar(pacienteId, tarefaId, chave, tarefa)
        .then(() => {
          if (!ativa) return;
          formulariosAlterados.clear();
          alteracaoPendente(false);
          consultar();
        })
        .catch((erro: unknown) => {
          if (!ativa) return;
          if (exigeNovoAcesso(erro)) {
            acessoPerdido(erro);
            return;
          }
          if (
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
        });
    });
    return form;
  };
  consultar();
  return () => {
    ativa = false;
    raiz.replaceChildren();
  };
}
