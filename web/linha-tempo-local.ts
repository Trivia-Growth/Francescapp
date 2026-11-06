export type DadosLinhaTempoLocal = {
  evolucoes?: readonly {
    data: string;
    texto: string;
    autor: string;
    area: string;
    estado: 'rascunho' | 'publicada';
  }[];
  relatos: readonly { dataAcontecimento: string; descricao: string }[];
  tarefas: readonly { prazo: string; descricao: string; estado: string }[];
  compromissos: readonly { data: string; hora: string; descricao: string; estado: string }[];
};

/** Exibe somente datas fornecidas pela prévia; prazo não representa data de realização. */
export function montarLinhaTempoLocal(raiz: HTMLElement, dados: DadosLinhaTempoLocal): void {
  const eventos = [
    ...(dados.evolucoes ?? []).map((item) => ({
      data: item.data,
      texto: `Evolução · Data: ${item.data} · ${item.texto} · ${item.autor} · ${item.area} · ${item.estado}`,
    })),
    ...dados.relatos.map((item) => ({
      data: item.dataAcontecimento,
      texto: `Relato · Data do acontecimento: ${item.dataAcontecimento} · ${item.descricao}`,
    })),
    ...dados.tarefas.map((item) => ({
      data: item.prazo,
      texto: `Tarefa · Prazo: ${item.prazo} · ${item.descricao} · ${item.estado}`,
    })),
    ...dados.compromissos.map((item) => ({
      data: item.data,
      texto: `Compromisso · Data: ${item.data}${item.hora ? ` às ${item.hora}` : ''} · ${item.descricao} · ${item.estado}`,
    })),
  ];
  eventos.sort((a, b) => b.data.localeCompare(a.data));
  raiz.replaceChildren();
  if (!eventos.length) {
    const vazio = document.createElement('p');
    vazio.textContent = 'Nenhum evento registrado nesta prévia.';
    raiz.append(vazio);
    return;
  }
  const lista = document.createElement('ol');
  for (const evento of eventos) {
    const item = document.createElement('li');
    item.textContent = evento.texto;
    lista.append(item);
  }
  raiz.append(lista);
}
