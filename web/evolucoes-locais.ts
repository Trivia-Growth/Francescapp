export type EvolucaoLocal = {
  id: string;
  texto: string;
  data: string;
  autor: string;
  area: string;
  estado: 'rascunho' | 'publicada';
};

export function montarEvolucoesLocais(
  raiz: HTMLElement,
  dados: {
    evolucoes: EvolucaoLocal[];
    aoSalvar: (evolucoes: EvolucaoLocal[]) => Promise<void>;
  },
): void {
  raiz.replaceChildren();
  const aviso = document.createElement('p');
  aviso.textContent = 'Prévia fictícia: use somente dados fictícios. Publicação aqui é simulada.';
  const formulario = document.createElement('form');
  const campo = (rotulo: string, tipo: 'textarea' | 'text' | 'date') => {
    const label = document.createElement('label');
    label.textContent = rotulo;
    const controle =
      tipo === 'textarea' ? document.createElement('textarea') : document.createElement('input');
    if (controle instanceof HTMLInputElement) controle.type = tipo;
    controle.required = true;
    controle.maxLength = tipo === 'textarea' ? 5000 : 200;
    label.append(controle);
    formulario.append(label);
    return controle;
  };
  const texto = campo('Evolução fictícia', 'textarea');
  const data = campo('Data', 'date');
  const autor = campo('Autor fictício', 'text');
  const area = campo('Área', 'text');
  const estadoLabel = document.createElement('label');
  estadoLabel.textContent = 'Estado na prévia';
  const estado = document.createElement('select');
  for (const valor of ['rascunho', 'publicada'] as const) {
    const opcao = document.createElement('option');
    opcao.value = valor;
    opcao.textContent = valor === 'publicada' ? 'Publicada na prévia (simulação)' : 'Rascunho';
    estado.append(opcao);
  }
  estadoLabel.append(estado);
  const botao = document.createElement('button');
  botao.type = 'submit';
  botao.textContent = 'Registrar evolução fictícia';
  formulario.append(estadoLabel, botao);
  const mensagem = document.createElement('p');
  mensagem.setAttribute('role', 'status');
  const lista = document.createElement('ul');
  let salvando = false;
  const renderizar = () => {
    lista.replaceChildren();
    if (!dados.evolucoes.length)
      lista.textContent = 'Nenhuma evolução fictícia registrada nesta prévia.';
    for (const item of dados.evolucoes) {
      const linha = document.createElement('li');
      linha.textContent = `${item.estado === 'publicada' ? 'Publicada na prévia (simulação)' : 'Rascunho'} · ${item.data} · ${item.autor} · ${item.area} · ${item.texto}`;
      lista.append(linha);
    }
  };
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (salvando) return;
    if (
      !texto.value.trim() ||
      !data.value ||
      !autor.value.trim() ||
      !area.value.trim() ||
      !['rascunho', 'publicada'].includes(estado.value)
    ) {
      mensagem.textContent = 'Informe texto, data, autor, área e estado.';
      return;
    }
    const nova: EvolucaoLocal = {
      id: crypto.randomUUID(),
      texto: texto.value.trim(),
      data: data.value,
      autor: autor.value.trim(),
      area: area.value.trim(),
      estado: estado.value as EvolucaoLocal['estado'],
    };
    const proximas = [...dados.evolucoes, nova];
    salvando = true;
    const controles = [texto, data, autor, area, estado, botao];
    for (const controle of controles) controle.disabled = true;
    mensagem.textContent = 'Salvando…';
    try {
      await dados.aoSalvar(proximas);
      dados.evolucoes.splice(0, dados.evolucoes.length, ...proximas);
      formulario.reset();
      renderizar();
      mensagem.textContent = 'Evolução fictícia salva nesta prévia.';
    } catch {
      mensagem.textContent = 'Não foi possível guardar. O rascunho foi preservado.';
    } finally {
      salvando = false;
      for (const controle of controles) controle.disabled = false;
    }
  });
  renderizar();
  raiz.append(aviso, formulario, mensagem, lista);
}
