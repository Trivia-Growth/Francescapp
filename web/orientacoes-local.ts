export type OrientacaoLocal = {
  id: string;
  texto: string;
  autor: string;
  data: string;
  destinatarios: string;
  validade: string | null;
  anterior: boolean;
};

export function montarOrientacoesLocais(
  raiz: HTMLElement,
  dados: {
    orientacoes: OrientacaoLocal[];
    aoSalvar: (orientacoes: OrientacaoLocal[]) => Promise<void>;
  },
): void {
  raiz.replaceChildren();
  const formulario = document.createElement('form');
  const campo = (rotulo: string, tipo: 'textarea' | 'text' | 'date', obrigatorio = true) => {
    const label = document.createElement('label');
    label.textContent = rotulo;
    const controle =
      tipo === 'textarea' ? document.createElement('textarea') : document.createElement('input');
    if (controle instanceof HTMLInputElement) controle.type = tipo;
    controle.required = obrigatorio;
    controle.maxLength = tipo === 'textarea' ? 5000 : 200;
    label.append(controle);
    formulario.append(label);
    return controle;
  };
  const texto = campo('Orientação', 'textarea');
  const autor = campo('Autor', 'text');
  const data = campo('Data', 'date');
  const destinatarios = campo('Destinatários', 'text');
  const validade = campo('Validade ou revisão (opcional)', 'date', false);
  const botao = document.createElement('button');
  botao.type = 'submit';
  botao.textContent = 'Registrar orientação';
  const cancelar = document.createElement('button');
  cancelar.type = 'button';
  cancelar.textContent = 'Cancelar substituição';
  cancelar.hidden = true;
  formulario.append(botao, cancelar);
  const mensagem = document.createElement('p');
  mensagem.setAttribute('role', 'status');
  const lista = document.createElement('ul');
  let substituindo: string | null = null;
  let salvando = false;
  const controles = [texto, autor, data, destinatarios, validade, botao, cancelar];
  const limpar = () => {
    formulario.reset();
    substituindo = null;
    cancelar.hidden = true;
    botao.textContent = 'Registrar orientação';
  };
  cancelar.addEventListener('click', () => {
    if (window.confirm('Descartar alterações não salvas?')) limpar();
  });
  const renderizar = () => {
    lista.replaceChildren();
    if (!dados.orientacoes.length)
      lista.textContent = 'Nenhuma orientação registrada nesta prévia.';
    for (const item of dados.orientacoes) {
      const linha = document.createElement('li');
      const descricao = document.createElement('span');
      descricao.textContent = `${item.anterior ? 'Anterior' : 'Atual'} · ${item.texto} · ${item.autor} · ${item.data} · ${item.destinatarios}${item.validade ? ` · Validade/revisão: ${item.validade}` : ''}`;
      linha.append(descricao);
      if (!item.anterior) {
        const substituir = document.createElement('button');
        substituir.type = 'button';
        substituir.textContent = 'Substituir';
        substituir.disabled = salvando;
        substituir.addEventListener('click', () => {
          if (
            (texto.value || autor.value || data.value || destinatarios.value || validade.value) &&
            !window.confirm('Descartar alterações não salvas?')
          )
            return;
          substituindo = item.id;
          texto.value = item.texto;
          autor.value = item.autor;
          data.value = item.data;
          destinatarios.value = item.destinatarios;
          validade.value = item.validade ?? '';
          cancelar.hidden = false;
          botao.textContent = 'Salvar nova versão';
          texto.focus();
        });
        linha.append(substituir);
      }
      lista.append(linha);
    }
  };
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (salvando) return;
    if (!texto.value.trim() || !autor.value.trim() || !data.value || !destinatarios.value.trim()) {
      mensagem.textContent = 'Informe orientação, autor, data e destinatários.';
      return;
    }
    const nova: OrientacaoLocal = {
      id: crypto.randomUUID(),
      texto: texto.value.trim(),
      autor: autor.value.trim(),
      data: data.value,
      destinatarios: destinatarios.value.trim(),
      validade: validade.value || null,
      anterior: false,
    };
    const proximas = [
      ...dados.orientacoes.map((item) =>
        item.id === substituindo ? { ...item, anterior: true } : item,
      ),
      nova,
    ];
    salvando = true;
    for (const controle of controles) controle.disabled = true;
    for (const controle of lista.querySelectorAll('button')) controle.disabled = true;
    mensagem.textContent = 'Salvando…';
    try {
      await dados.aoSalvar(proximas);
      dados.orientacoes.splice(0, dados.orientacoes.length, ...proximas);
      limpar();
      mensagem.textContent = 'Orientação salva nesta prévia.';
      renderizar();
    } catch {
      mensagem.textContent = 'Não foi possível guardar. O rascunho foi preservado.';
    } finally {
      salvando = false;
      for (const controle of controles) controle.disabled = false;
      for (const controle of lista.querySelectorAll('button')) controle.disabled = false;
    }
  });
  renderizar();
  raiz.append(formulario, mensagem, lista);
}
