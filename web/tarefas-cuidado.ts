import type {
  RegistroTarefaCuidado,
  TarefaCuidado,
} from '../packages/contracts/src/tarefa-cuidado.ts';
import { exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.ts';

type RegistroTarefa = RegistroTarefaCuidado;
export type ServicoTarefasCuidado = {
  consultarTarefas(pacienteId: string): Promise<RegistroTarefa[]>;
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
        for (const { tarefa } of registros) {
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
    form.addEventListener('input', () => alteracaoPendente(true));
    form.addEventListener('change', () => alteracaoPendente(true));
    form.addEventListener('submit', (evento) => {
      evento.preventDefault();
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
      const tarefa: TarefaCuidado = {
        descricao: descricaoLimpa,
        responsavel: responsavelLimpo,
        prazo: prazo.value,
        prioridade: prioridade.value as TarefaCuidado['prioridade'],
        estado: 'pendente',
      };
      const tarefaId = crypto.randomUUID();
      const chave = crypto.randomUUID();
      campos.disabled = salvar.disabled = true;
      alteracaoPendente(true);
      status.textContent = 'Criando tarefa…';
      void criar(pacienteId, tarefaId, chave, tarefa)
        .then(() => {
          if (!ativa) return;
          alteracaoPendente(false);
          consultar();
        })
        .catch((erro: unknown) => {
          if (!ativa) return;
          if (exigeNovoAcesso(erro)) {
            acessoPerdido(erro);
            return;
          }
          if (resultadoIncerto(erro)) {
            campos.disabled = false;
            for (const input of [descricao, responsavel, prazo]) input.readOnly = true;
            prioridade.disabled = true;
            status.textContent =
              'Não foi possível confirmar a criação. Copie os dados se necessário e confira as tarefas antes de tentar novamente.';
            return;
          }
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
