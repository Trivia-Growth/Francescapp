/** Botão, campo de texto, superfície, linha de lista, estado vazio e aviso.
 *
 *  O mínimo que as telas de acesso e de carteira precisam e que o resto vai herdar. Cada
 *  função devolve o elemento montado, sem consultar nada e sem decidir autorização: quem
 *  pode ver ou fazer continua sendo decidido no servidor e no banco.
 */

export type PesoBotao = 'principal' | 'secundario' | 'discreto';

export type PedidoBotao = {
  rotulo: string;
  peso?: PesoBotao;
  tipo?: 'button' | 'submit';
  id?: string;
  marca?: string;
  rotuloLeitura?: string;
  largo?: boolean;
  aoAtivar?: (evento: MouseEvent) => void;
};

export function botao(pedido: PedidoBotao): HTMLButtonElement {
  const elemento = document.createElement('button');
  elemento.type = pedido.tipo ?? 'button';
  elemento.className = pedido.largo ? 'ui-botao ui-botao--largo' : 'ui-botao';
  elemento.dataset.peso = pedido.peso ?? 'secundario';
  if (pedido.id) elemento.id = pedido.id;
  if (pedido.marca) elemento.dataset.acao = pedido.marca;
  if (pedido.rotuloLeitura) elemento.setAttribute('aria-label', pedido.rotuloLeitura);
  elemento.textContent = pedido.rotulo;
  if (pedido.aoAtivar) elemento.addEventListener('click', pedido.aoAtivar);
  return elemento;
}

export type PedidoCampo = {
  id: string;
  rotulo: string;
  tipo?: string;
  nome?: string;
  /** Texto curto à direita do rótulo: "obrigatório", "opcional", a unidade. */
  marcaRotulo?: string;
  /** A linha que explica o campo, abaixo dele. Vira `aria-describedby`. */
  dica?: string;
  valor?: string;
  obrigatorio?: boolean;
  tamanhoMaximo?: number;
  autocomplete?: string;
  inputmode?: string;
  placeholder?: string;
};

export type Campo = {
  elemento: HTMLElement;
  controle: HTMLInputElement;
  /** Mostra ou limpa o erro do campo e mantém `aria-invalid` coerente com o que se vê. */
  erro(mensagem: string): void;
};

/** Campo de texto: rótulo acima, campo, dica e erro na mesma coluna. O erro nunca é só
 *  cor — é frase, ligada ao campo por `aria-describedby`, para o leitor de tela anunciá-la. */
export function campoTexto(pedido: PedidoCampo): Campo {
  const elemento = document.createElement('div');
  elemento.className = 'ui-campo';

  const rotulo = document.createElement('label');
  rotulo.className = 'ui-campo__rotulo';
  rotulo.htmlFor = pedido.id;
  const texto = document.createElement('span');
  texto.textContent = pedido.rotulo;
  rotulo.append(texto);
  if (pedido.marcaRotulo) {
    const marca = document.createElement('span');
    marca.className = 'ui-campo__marca';
    marca.textContent = pedido.marcaRotulo;
    rotulo.append(marca);
  }

  const controle = document.createElement('input');
  controle.className = 'ui-campo__controle';
  controle.id = pedido.id;
  controle.type = pedido.tipo ?? 'text';
  if (pedido.nome) controle.name = pedido.nome;
  if (pedido.valor) controle.value = pedido.valor;
  if (pedido.obrigatorio) controle.required = true;
  if (pedido.tamanhoMaximo) controle.maxLength = pedido.tamanhoMaximo;
  if (pedido.autocomplete) controle.setAttribute('autocomplete', pedido.autocomplete);
  if (pedido.inputmode) controle.inputMode = pedido.inputmode;
  if (pedido.placeholder) controle.placeholder = pedido.placeholder;

  const descritores: string[] = [];
  elemento.append(rotulo, controle);
  if (pedido.dica) {
    const dica = document.createElement('p');
    dica.id = `${pedido.id}-dica`;
    dica.className = 'ui-campo__dica';
    dica.textContent = pedido.dica;
    descritores.push(dica.id);
    elemento.append(dica);
  }
  const erro = document.createElement('p');
  erro.id = `${pedido.id}-erro`;
  erro.className = 'ui-campo__erro';
  descritores.push(erro.id);
  elemento.append(erro);
  controle.setAttribute('aria-describedby', descritores.join(' '));

  return {
    elemento,
    controle,
    erro(mensagem: string) {
      erro.textContent = mensagem;
      if (mensagem) controle.setAttribute('aria-invalid', 'true');
      else controle.removeAttribute('aria-invalid');
    },
  };
}

export type PedidoSuperficie = {
  titulo?: string;
  descricao?: string;
  /** Nível do título dentro da página. Sem ele a superfície não recebe cabeçalho. */
  nivel?: 2 | 3;
  acao?: HTMLElement;
  conteudo?: Node | readonly Node[];
  /** Sem borda e sem fundo: o assunto se separa só por espaço. */
  plana?: boolean;
  rotuloLeitura?: string;
};

export type Superficie = { elemento: HTMLElement; corpo: HTMLElement };

let sequenciaSuperficie = 0;

/** Uma superfície por assunto. É o que substitui o cartão dentro de cartão: a separação
 *  entre assuntos passa a ser espaço e filete, não mais uma caixa em volta de outra. */
export function superficie(pedido: PedidoSuperficie): Superficie {
  const elemento = document.createElement('section');
  elemento.className = pedido.plana ? 'ui-superficie ui-superficie--plana' : 'ui-superficie';
  if (pedido.rotuloLeitura) elemento.setAttribute('aria-label', pedido.rotuloLeitura);

  if (pedido.titulo) {
    const cabecalho = document.createElement('div');
    cabecalho.className = 'ui-superficie__cabecalho';
    const textos = document.createElement('div');
    const titulo = document.createElement(pedido.nivel === 3 ? 'h3' : 'h2');
    titulo.className = 'ui-superficie__titulo';
    titulo.textContent = pedido.titulo;
    textos.append(titulo);
    if (pedido.descricao) {
      const descricao = document.createElement('p');
      descricao.className = 'ui-superficie__descricao';
      descricao.textContent = pedido.descricao;
      textos.append(descricao);
    }
    cabecalho.append(textos);
    if (pedido.acao) cabecalho.append(pedido.acao);
    elemento.append(cabecalho);
    if (!pedido.rotuloLeitura) {
      sequenciaSuperficie += 1;
      titulo.id = `ui-superficie-${sequenciaSuperficie}`;
      elemento.setAttribute('aria-labelledby', titulo.id);
    }
  }

  const corpo = document.createElement('div');
  corpo.className = 'ui-superficie__corpo';
  if (pedido.conteudo)
    corpo.append(...(Array.isArray(pedido.conteudo) ? pedido.conteudo : [pedido.conteudo]));
  elemento.append(corpo);
  return { elemento, corpo };
}

export type PedidoLinha = {
  /** O que a linha é. Fica em primeiro, na mesma coluna em todas as linhas. */
  principal: Node | string;
  /** O que ajuda a reconhecer. Cinza, menor, logo ao lado. */
  secundario?: Node | string;
  /** O estado, à direita. É o que se compara entre linhas. */
  fim?: Node | readonly Node[];
  antes?: Node;
  rotuloLeitura: string;
  aoAbrir?: () => void;
};

function comoNo(valor: Node | string, classe: string): Node {
  if (typeof valor !== 'string') return valor;
  const span = document.createElement('span');
  span.className = classe;
  span.textContent = valor;
  return span;
}

/** Linha de lista: um botão que ocupa a linha inteira, com alvo de toque suficiente e a
 *  mesma ordem de campos em todas. Lista é para comparar; por isso nada de cartão. */
export function linhaLista(pedido: PedidoLinha): HTMLLIElement {
  const item = document.createElement('li');
  const abrir = document.createElement('button');
  abrir.type = 'button';
  abrir.className = 'ui-linha';
  abrir.setAttribute('aria-label', pedido.rotuloLeitura);
  if (pedido.antes) abrir.append(pedido.antes);
  const texto = document.createElement('span');
  texto.className = 'ui-linha__texto';
  texto.append(comoNo(pedido.principal, 'ui-linha__principal'));
  if (pedido.secundario) texto.append(comoNo(pedido.secundario, 'ui-linha__secundario'));
  if (pedido.fim) texto.append(...(Array.isArray(pedido.fim) ? pedido.fim : [pedido.fim]));
  abrir.append(texto);
  const seta = document.createElement('span');
  seta.className = 'ui-linha__seta';
  seta.setAttribute('aria-hidden', 'true');
  abrir.append(seta);
  if (pedido.aoAbrir) abrir.addEventListener('click', pedido.aoAbrir);
  item.append(abrir);
  return item;
}

/** Estado vazio: diz o que houve e, quando existe, o que fazer a seguir. Nunca inventa
 *  conteúdo para preencher a tela, e nunca afirma que algo não existe quando só não veio. */
export function estadoVazio(titulo: string, texto?: string, acao?: HTMLElement): HTMLElement {
  const elemento = document.createElement('div');
  elemento.className = 'ui-vazio';
  const cabeca = document.createElement('h3');
  cabeca.className = 'ui-vazio__titulo';
  cabeca.textContent = titulo;
  elemento.append(cabeca);
  if (texto) {
    const paragrafo = document.createElement('p');
    paragrafo.className = 'ui-vazio__texto';
    paragrafo.textContent = texto;
    elemento.append(paragrafo);
  }
  if (acao) elemento.append(acao);
  return elemento;
}

export type TomAviso = 'informacao' | 'atencao' | 'erro';

/** Aviso: régua à esquerda e fundo lavado. O tom muda a régua, não a cor da palavra —
 *  a oliva não tem contraste para ser texto (3,35:1 sobre branco) e só vale como marcação. */
export function aviso(texto: string, tom: TomAviso = 'informacao', titulo?: string): HTMLElement {
  const elemento = document.createElement('div');
  elemento.className = 'ui-aviso';
  elemento.dataset.tom = tom;
  if (tom === 'erro') elemento.setAttribute('role', 'alert');
  if (titulo) {
    const cabeca = document.createElement('p');
    cabeca.className = 'ui-aviso__titulo';
    cabeca.textContent = titulo;
    elemento.append(cabeca);
  }
  const paragrafo = document.createElement('p');
  paragrafo.className = 'ui-aviso__texto';
  paragrafo.textContent = texto;
  elemento.append(paragrafo);
  return elemento;
}
