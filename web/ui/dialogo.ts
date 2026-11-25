/** Diálogo da aplicação — um componente, dois comportamentos.
 *
 *  Generaliza o que `web/confirmacao.ts` já fazia para uma decisão, em vez de duplicá-lo:
 *  foco preso enquanto estiver aberto, Esc cancela, foco devolvido a quem abriu, e nada
 *  desenhado pelo navegador acima da página.
 *
 *  A forma depende do tamanho da tela, e isso é decidido na folha de estilo, não aqui:
 *  a partir de 768px é diálogo centrado (560px para formulário, 720px para conteúdo) para
 *  a tela não crescer sem fim; abaixo disso o mesmo elemento vira folha ancorada embaixo,
 *  com cabeçalho e rodapé fixos e o corpo rolando entre os dois.
 */

const SELETOR_FOCAVEL = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/** Controles que de fato recebem foco agora: fora os desligados, os ocultos e os que o
 *  aprimoramento de seleção/data tirou da vista (`aria-hidden`). */
export function focaveis(raiz: ParentNode): HTMLElement[] {
  return [...raiz.querySelectorAll<HTMLElement>(SELETOR_FOCAVEL)].filter((elemento) => {
    if (elemento.hasAttribute('disabled') || elemento.getAttribute('aria-hidden') === 'true')
      return false;
    return !elemento.closest('[hidden]');
  });
}

/** Prende o foco dentro do elemento: Tab e Shift+Tab circulam, nunca saem. */
export function prenderFoco(raiz: HTMLElement): () => void {
  const aoTeclar = (evento: KeyboardEvent) => {
    if (evento.key !== 'Tab') return;
    const alvos = focaveis(raiz);
    if (alvos.length === 0) return;
    const atual = alvos.indexOf(document.activeElement as HTMLElement);
    const passo = evento.shiftKey ? -1 : 1;
    const destino = (atual + passo + alvos.length) % alvos.length;
    evento.preventDefault();
    alvos[atual === -1 ? 0 : destino]?.focus();
  };
  raiz.addEventListener('keydown', aoTeclar);
  return () => raiz.removeEventListener('keydown', aoTeclar);
}

export type MedidaDialogo = 'formulario' | 'conteudo' | 'decisao';

export type AcaoDialogo = {
  /** Rótulo no mesmo verbo do título. "Continuar?" não informa o que se perde. */
  rotulo: string;
  peso?: 'principal' | 'secundario' | 'discreto';
  /** Marca de leitura para provas e para quem procura a ação no DOM. */
  marca?: string;
  /** Ação própria. Devolver `false` mantém o diálogo aberto (validação recusou). */
  aoAtivar?: () => boolean | undefined;
  /** Fecha o diálogo depois de `aoAtivar`. Padrão: fecha. */
  fecha?: boolean;
  /** Recebe o foco ao abrir. Em decisão, é o botão seguro. */
  focoInicial?: boolean;
};

export type PedidoDialogo = {
  titulo: string;
  /** O que mais quem decide precisa saber antes de responder. */
  descricao?: string;
  /** `formulario` 560px, `conteudo` 720px, `decisao` 420px. No celular todas viram folha. */
  medida?: MedidaDialogo;
  corpo?: Node | readonly Node[];
  acoes?: readonly AcaoDialogo[];
  /** Botão de fechar no cabeçalho. Decisão não tem: a resposta é uma das ações. */
  comFechar?: boolean;
  classe?: string;
  /** Chamado quando o diálogo fecha, por qualquer caminho, inclusive Esc. */
  aoFechar?: () => void;
};

export type Dialogo = {
  elemento: HTMLDialogElement;
  corpo: HTMLElement;
  rodape: HTMLElement;
  fechar(): void;
};

let sequencia = 0;

function montarAcao(acao: AcaoDialogo, fechar: () => void): HTMLButtonElement {
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'ui-botao';
  botao.dataset.peso = acao.peso ?? 'secundario';
  if (acao.marca) botao.dataset.acao = acao.marca;
  botao.textContent = acao.rotulo;
  botao.addEventListener('click', () => {
    if (acao.aoAtivar?.() === false) return;
    if (acao.fecha !== false) fechar();
  });
  return botao;
}

/** Abre o diálogo e devolve o controle dele. Quem abre decide quando fechar. */
export function abrirDialogo(pedido: PedidoDialogo): Dialogo {
  sequencia += 1;
  const marca = `ui-dialogo-${sequencia}`;
  const elemento = document.createElement('dialog');
  elemento.className = pedido.classe ? `ui-dialogo ${pedido.classe}` : 'ui-dialogo';
  elemento.dataset.medida = pedido.medida ?? 'formulario';

  const cabecalho = document.createElement('div');
  cabecalho.className = 'ui-dialogo__cabecalho';
  const textos = document.createElement('div');
  const titulo = document.createElement('h2');
  titulo.id = `${marca}-titulo`;
  titulo.className = 'ui-dialogo__titulo';
  titulo.textContent = pedido.titulo;
  elemento.setAttribute('aria-labelledby', titulo.id);
  textos.append(titulo);
  if (pedido.descricao) {
    const descricao = document.createElement('p');
    descricao.id = `${marca}-descricao`;
    descricao.className = 'ui-dialogo__descricao';
    descricao.textContent = pedido.descricao;
    elemento.setAttribute('aria-describedby', descricao.id);
    textos.append(descricao);
  }
  cabecalho.append(textos);

  let liberarFoco = () => {};
  let fechado = false;
  const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const fechar = () => {
    if (fechado) return;
    fechado = true;
    liberarFoco();
    if (elemento.open && typeof elemento.close === 'function') elemento.close();
    elemento.remove();
    // Quem abriu continua de onde estava; sem isto o foco cai no body.
    if (anterior?.isConnected) anterior.focus();
    pedido.aoFechar?.();
  };

  if (pedido.comFechar !== false && pedido.medida !== 'decisao') {
    const botaoFechar = document.createElement('button');
    botaoFechar.type = 'button';
    botaoFechar.className = 'ui-dialogo__fechar';
    botaoFechar.dataset.acao = 'fechar';
    botaoFechar.setAttribute('aria-label', 'Fechar');
    botaoFechar.textContent = '×';
    botaoFechar.addEventListener('click', fechar);
    cabecalho.append(botaoFechar);
  }

  const corpo = document.createElement('div');
  corpo.className = 'ui-dialogo__corpo';
  if (pedido.corpo) corpo.append(...(Array.isArray(pedido.corpo) ? pedido.corpo : [pedido.corpo]));

  const rodape = document.createElement('div');
  rodape.className = 'ui-dialogo__rodape';
  const acoes = pedido.acoes ?? [];
  for (const acao of acoes) rodape.append(montarAcao(acao, fechar));

  elemento.append(cabecalho, corpo, rodape);
  // `cancel` é o Esc do próprio `<dialog>`; fechar sem responder é desistir.
  elemento.addEventListener('cancel', (evento) => {
    evento.preventDefault();
    fechar();
  });
  elemento.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape') return;
    evento.preventDefault();
    fechar();
  });

  document.body.append(elemento);
  liberarFoco = prenderFoco(elemento);
  // `showModal` não existe no jsdom das provas; o atributo mantém o diálogo visível e
  // respondível lá, e o navegador real continua recebendo o modal com fundo e foco presos.
  if (typeof elemento.showModal === 'function') elemento.showModal();
  else elemento.setAttribute('open', '');

  const indicado = acoes.findIndex((acao) => acao.focoInicial);
  const botoes = [...rodape.querySelectorAll<HTMLButtonElement>('button')];
  const inicial = indicado >= 0 ? botoes[indicado] : focaveis(corpo)[0];
  (inicial ?? botoes[0] ?? elemento).focus();

  return { elemento, corpo, rodape, fechar };
}
