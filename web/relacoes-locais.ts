export type PessoaReferenciaLocal = {
  id: string;
  nome: string;
  relacao: string;
  contato: string;
};

export type DadosPessoaReferencia = Omit<PessoaReferenciaLocal, 'id'>;

export function montarRelacoesLocais(
  raiz: HTMLElement,
  dados: {
    pessoas: PessoaReferenciaLocal[];
    aoRegistrar: (pessoa: DadosPessoaReferencia) => Promise<PessoaReferenciaLocal>;
    aoAtualizar: (id: string, pessoa: DadosPessoaReferencia) => Promise<void>;
    aoLimpar?: () => void;
  },
): void {
  raiz.replaceChildren();
  const aviso = document.createElement('p');
  aviso.textContent = 'Registrar uma pessoa de referência não cria conta nem concede acesso.';
  const formulario = document.createElement('form');
  const campo = (rotulo: string, obrigatorio: boolean) => {
    const label = document.createElement('label');
    label.textContent = rotulo;
    const input = document.createElement('input');
    input.required = obrigatorio;
    input.maxLength = 200;
    label.append(input);
    formulario.append(label);
    return input;
  };
  const nome = campo('Nome', true);
  const relacao = campo('Relação', true);
  const contato = campo('Contato (opcional)', false);
  const salvar = document.createElement('button');
  salvar.type = 'submit';
  salvar.textContent = 'Registrar pessoa de referência';
  const cancelar = document.createElement('button');
  cancelar.type = 'button';
  cancelar.textContent = 'Cancelar edição';
  cancelar.hidden = true;
  formulario.append(salvar, cancelar);
  const mensagem = document.createElement('p');
  mensagem.setAttribute('role', 'status');
  const lista = document.createElement('ul');
  let editando: string | null = null;
  let salvando = false;
  let original = ['', '', ''];
  const alterado = () =>
    [nome.value, relacao.value, contato.value].some((v, i) => v !== original[i]);
  const confirmarDescarte = () => !alterado() || window.confirm('Descartar alterações não salvas?');
  const limpar = () => {
    editando = null;
    formulario.reset();
    original = ['', '', ''];
    salvar.textContent = 'Registrar pessoa de referência';
    cancelar.hidden = true;
    dados.aoLimpar?.();
  };
  cancelar.addEventListener('click', () => {
    if (!confirmarDescarte()) return;
    limpar();
    mensagem.textContent = '';
  });
  const atualizarLista = () => {
    lista.replaceChildren();
    if (!dados.pessoas.length) {
      const vazio = document.createElement('li');
      vazio.textContent = 'Nenhuma pessoa de referência registrada nesta prévia.';
      lista.append(vazio);
    }
    for (const pessoa of dados.pessoas) {
      const item = document.createElement('li');
      const descricao = document.createElement('span');
      descricao.textContent = [pessoa.nome, pessoa.relacao, pessoa.contato]
        .filter(Boolean)
        .join(' · ');
      const editar = document.createElement('button');
      editar.type = 'button';
      editar.disabled = salvando;
      editar.textContent = 'Editar';
      editar.setAttribute('aria-label', `Editar pessoa de referência ${pessoa.nome}`);
      editar.addEventListener('click', () => {
        if (!confirmarDescarte()) return;
        dados.aoLimpar?.();
        editando = pessoa.id;
        nome.value = pessoa.nome;
        relacao.value = pessoa.relacao;
        contato.value = pessoa.contato;
        original = [nome.value, relacao.value, contato.value];
        salvar.textContent = 'Salvar alterações';
        cancelar.hidden = false;
        mensagem.textContent = '';
        nome.focus();
      });
      item.append(descricao, editar);
      lista.append(item);
    }
  };
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (salvando) return;
    const valores = {
      nome: nome.value.trim(),
      relacao: relacao.value.trim(),
      contato: contato.value.trim(),
    };
    if (!valores.nome || !valores.relacao) {
      mensagem.textContent = 'Informe nome e relação.';
      return;
    }
    const id = editando;
    salvando = true;
    for (const controle of [nome, relacao, contato, salvar, cancelar]) controle.disabled = true;
    for (const botao of lista.querySelectorAll('button')) botao.disabled = true;
    mensagem.textContent = 'Salvando…';
    try {
      if (id === null) {
        dados.pessoas.push(await dados.aoRegistrar(valores));
      } else {
        await dados.aoAtualizar(id, valores);
        const indice = dados.pessoas.findIndex((item) => item.id === id);
        if (indice !== -1) dados.pessoas[indice] = { id, ...valores };
      }
      limpar();
      atualizarLista();
      mensagem.textContent = 'Pessoa de referência salva nesta prévia.';
    } catch {
      mensagem.textContent = 'Não foi possível guardar. O rascunho foi preservado.';
    } finally {
      salvando = false;
      for (const controle of [nome, relacao, contato, salvar, cancelar]) controle.disabled = false;
      for (const botao of lista.querySelectorAll('button')) botao.disabled = false;
    }
  });
  atualizarLista();
  raiz.append(aviso, formulario, mensagem, lista);
}
