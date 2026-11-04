import type { RegistroTarefaCuidado } from '../packages/contracts/src/tarefa-cuidado.ts';
import { exigeNovoAcesso, mensagemFalha } from './api.ts';

type RegistroTarefa = RegistroTarefaCuidado;
export type ServicoTarefasCuidado = {
  consultarTarefas(pacienteId: string): Promise<RegistroTarefa[]>;
};

/** Consulta vinculada ao paciente; o servidor determina o acesso. */
export function montarTarefasCuidado(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoTarefasCuidado,
  acessoPerdido: (erro: unknown) => void,
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
  consultar();
  return () => {
    ativa = false;
    raiz.replaceChildren();
  };
}
