type TarefaPainelLocal = {
  descricao: string;
  responsavel: string;
  prazo: string;
  estado: string;
};

export type DadosPainelPendenciasLocal = {
  hoje: string;
  pacientes: readonly {
    id: string;
    nome: string;
    tarefas: readonly TarefaPainelLocal[];
  }[];
  abrirTarefas?: (pacienteId: string) => void;
};

/** Apresenta dados fornecidos pela prévia; não autoriza acesso. Datas usam AAAA-MM-DD. */
export function montarPainelPendenciasLocal(
  raiz: HTMLElement,
  dados: DadosPainelPendenciasLocal,
): void {
  raiz.replaceChildren();
  let encontrouTarefa = false;
  for (const paciente of dados.pacientes) {
    const tarefas = paciente.tarefas.filter(
      (tarefa) => tarefa.estado === 'pendente' || tarefa.estado === 'em_andamento',
    );
    if (!tarefas.length) continue;
    encontrouTarefa = true;
    const secao = document.createElement('section');
    const titulo = document.createElement('h3');
    titulo.textContent = paciente.nome;
    secao.append(titulo);
    const lista = document.createElement('ul');
    for (const tarefa of tarefas) {
      const item = document.createElement('li');
      const vencida = tarefa.prazo && tarefa.prazo < dados.hoje;
      item.textContent = `${tarefa.descricao} · ${tarefa.responsavel} · Prazo: ${tarefa.prazo} · ${tarefa.estado}${vencida ? ' · Vencida' : ''}`;
      lista.append(item);
    }
    secao.append(lista);
    if (dados.abrirTarefas) {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.textContent = 'Abrir tarefas';
      botao.addEventListener('click', () => dados.abrirTarefas?.(paciente.id));
      secao.append(botao);
    }
    raiz.append(secao);
  }
  if (!encontrouTarefa) {
    const vazio = document.createElement('p');
    vazio.textContent = 'Nenhuma tarefa em aberto registrada nesta prévia.';
    raiz.append(vazio);
  }
}
