export type EstadoEncaminhamento =
  | 'sugerido'
  | 'agendado'
  | 'realizado'
  | 'retorno pendente'
  | 'concluído';

export type EncaminhamentoLocal = {
  id: string;
  destino: string;
  motivo: string;
  responsavel: string;
  estado: EstadoEncaminhamento;
};

export type DadosEncaminhamento = Omit<EncaminhamentoLocal, 'id'>;

export function montarEncaminhamentosLocais(
  raiz: HTMLElement,
  dados: {
    encaminhamentos: EncaminhamentoLocal[];
    aoRegistrar: (encaminhamento: DadosEncaminhamento) => Promise<EncaminhamentoLocal>;
    aoAtualizar: (id: string, encaminhamento: DadosEncaminhamento) => Promise<void>;
  },
): void {
  raiz.replaceChildren();
  const formulario = document.createElement('form');
  const campo = (rotulo: string) => {
    const label = document.createElement('label');
    label.textContent = rotulo;
    const input = document.createElement('input');
    input.required = true;
    input.maxLength = 200;
    label.append(input);
    formulario.append(label);
    return input;
  };
  const destino = campo('Destino');
  const motivo = campo('Motivo');
  const responsavel = campo('Responsável');
  const labelEstado = document.createElement('label');
  labelEstado.textContent = 'Estado';
  const estado = document.createElement('select');
  const estados: EstadoEncaminhamento[] = [
    'sugerido',
    'agendado',
    'realizado',
    'retorno pendente',
    'concluído',
  ];
  for (const valor of estados) {
    const opcao = document.createElement('option');
    opcao.value = valor;
    opcao.textContent = valor;
    estado.append(opcao);
  }
  labelEstado.append(estado);
  const salvar = document.createElement('button');
  salvar.type = 'submit';
  salvar.textContent = 'Registrar encaminhamento';
  const cancelar = document.createElement('button');
  cancelar.type = 'button';
  cancelar.textContent = 'Cancelar edição';
  cancelar.hidden = true;
  formulario.append(labelEstado, salvar, cancelar);
  const mensagem = document.createElement('p');
  mensagem.setAttribute('role', 'status');
  const filtroLabel = document.createElement('label');
  const filtro = document.createElement('input');
  filtro.type = 'checkbox';
  filtroLabel.append(filtro, ' Mostrar apenas retorno pendente');
  const lista = document.createElement('ul');
  let editando: string | null = null;
  let salvando = false;
  let original = ['', '', '', 'sugerido'];
  const alterado = () =>
    [destino.value, motivo.value, responsavel.value, estado.value].some(
      (valor, indice) => valor !== original[indice],
    );
  const confirmarDescarte = () => !alterado() || window.confirm('Descartar alterações não salvas?');
  const limpar = () => {
    editando = null;
    formulario.reset();
    original = ['', '', '', 'sugerido'];
    salvar.textContent = 'Registrar encaminhamento';
    cancelar.hidden = true;
  };
  cancelar.addEventListener('click', () => {
    if (!confirmarDescarte()) return;
    limpar();
    mensagem.textContent = '';
  });
  const atualizarLista = () => {
    lista.replaceChildren();
    const visiveis = filtro.checked
      ? dados.encaminhamentos.filter((item) => item.estado === 'retorno pendente')
      : dados.encaminhamentos;
    if (!visiveis.length) {
      const item = document.createElement('li');
      item.textContent = filtro.checked
        ? 'Nenhum encaminhamento com retorno pendente.'
        : 'Nenhum encaminhamento registrado nesta prévia.';
      lista.append(item);
    }
    for (const encaminhamento of visiveis) {
      const item = document.createElement('li');
      const descricao = document.createElement('span');
      descricao.textContent = `${encaminhamento.destino} · ${encaminhamento.motivo} · ${encaminhamento.responsavel} · ${encaminhamento.estado}`;
      const editar = document.createElement('button');
      editar.type = 'button';
      editar.disabled = salvando;
      editar.textContent = 'Editar';
      editar.setAttribute('aria-label', `Editar encaminhamento para ${encaminhamento.destino}`);
      editar.addEventListener('click', () => {
        if (!confirmarDescarte()) return;
        editando = encaminhamento.id;
        destino.value = encaminhamento.destino;
        motivo.value = encaminhamento.motivo;
        responsavel.value = encaminhamento.responsavel;
        estado.value = encaminhamento.estado;
        original = [destino.value, motivo.value, responsavel.value, estado.value];
        salvar.textContent = 'Salvar alterações';
        cancelar.hidden = false;
        mensagem.textContent = '';
        destino.focus();
      });
      item.append(descricao, editar);
      lista.append(item);
    }
  };
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const valores: DadosEncaminhamento = {
      destino: destino.value.trim(),
      motivo: motivo.value.trim(),
      responsavel: responsavel.value.trim(),
      estado: estado.value as EstadoEncaminhamento,
    };
    if (
      !valores.destino ||
      !valores.motivo ||
      !valores.responsavel ||
      !estados.includes(valores.estado)
    ) {
      mensagem.textContent = 'Informe destino, motivo, responsável e estado.';
      return;
    }
    const id = editando;
    salvando = true;
    for (const controle of [destino, motivo, responsavel, estado, salvar, cancelar, filtro])
      controle.disabled = true;
    for (const botao of lista.querySelectorAll('button')) botao.disabled = true;
    mensagem.textContent = 'Salvando…';
    try {
      if (id === null) {
        const criado = await dados.aoRegistrar(valores);
        dados.encaminhamentos.push(criado);
      } else {
        await dados.aoAtualizar(id, valores);
        const indice = dados.encaminhamentos.findIndex((item) => item.id === id);
        if (indice !== -1) dados.encaminhamentos[indice] = { id, ...valores };
      }
      limpar();
      atualizarLista();
      mensagem.textContent = 'Encaminhamento salvo nesta prévia.';
    } catch {
      mensagem.textContent = 'Não foi possível guardar. O rascunho foi preservado.';
    } finally {
      salvando = false;
      for (const controle of [destino, motivo, responsavel, estado, salvar, cancelar, filtro])
        controle.disabled = false;
      for (const botao of lista.querySelectorAll('button')) botao.disabled = false;
    }
  });
  filtro.addEventListener('change', atualizarLista);
  atualizarLista();
  raiz.append(formulario, mensagem, filtroLabel, lista);
}
