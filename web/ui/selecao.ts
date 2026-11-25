/** Seleção própria, no lugar do `<select>` do navegador.
 *
 *  Por que trocar: em 25/11/2026 havia 17 `<select>` nativos na aplicação. Escolher é um
 *  dos três momentos de maior atenção da tela — os outros são confirmar e datar — e nos
 *  três quem aparecia era o widget do navegador, não o produto. No celular o `<select>`
 *  abre a roleta do sistema, que não tem nada a ver com o resto da aplicação.
 *
 *  Por que aprimorar em vez de substituir: o `<select>` continua no documento e continua
 *  sendo o dono do valor. É ele que o formulário envia, é ele que o restante do código lê
 *  e escreve, e é ele que guarda `disabled` e `aria-invalid`. O que este módulo faz é
 *  tirá-lo da vista e da ordem de tabulação e pôr no lugar uma lista com rótulo associado,
 *  foco visível e teclado completo. Sem o script, o controle nativo continua funcionando.
 *
 *  Teclado, no padrão de combobox: Enter, Espaço, Alt+Seta para baixo ou qualquer seta
 *  abrem; setas e Home/End movem a opção ativa; Enter e Espaço escolhem; Esc fecha sem
 *  mudar; Tab fecha mantendo o que já estava; digitar letras salta para a opção que começa
 *  com elas.
 */

export type Selecao = {
  grupo: HTMLElement;
  gatilho: HTMLButtonElement;
  lista: HTMLElement;
  /** Relê opções, valor, `disabled` e `aria-invalid` do `<select>`. */
  sincronizar(): void;
  encerrar(): void;
};

const aprimoradas = new WeakMap<HTMLSelectElement, Selecao>();
let sequencia = 0;

function rotuloDe(nativa: HTMLSelectElement): HTMLLabelElement | null {
  const marcado = nativa.labels?.[0];
  if (marcado) return marcado;
  return nativa.closest('label');
}

/** Troca o `<select>` pela seleção da aplicação. Chamar duas vezes no mesmo campo só
 *  ressincroniza: nenhuma tela monta dois comboboxes por engano. */
export function aprimorarSelecao(nativa: HTMLSelectElement): Selecao {
  const existente = aprimoradas.get(nativa);
  if (existente) {
    existente.sincronizar();
    return existente;
  }

  sequencia += 1;
  const marca = `ui-selecao-${sequencia}`;
  const grupo = document.createElement('div');
  grupo.className = 'ui-selecao';
  nativa.replaceWith(grupo);
  grupo.append(nativa);
  // Só depois de montado: enquanto o atributo não existe, a folha de estilo mantém o
  // controle nativo visível, e uma falha de script não deixa o campo invisível.
  grupo.dataset.aprimorada = '';
  nativa.setAttribute('aria-hidden', 'true');
  nativa.tabIndex = -1;

  const gatilho = document.createElement('button');
  gatilho.type = 'button';
  gatilho.className = 'ui-selecao__gatilho';
  gatilho.id = `${marca}-gatilho`;
  gatilho.setAttribute('role', 'combobox');
  gatilho.setAttribute('aria-haspopup', 'listbox');
  gatilho.setAttribute('aria-expanded', 'false');
  gatilho.setAttribute('aria-controls', `${marca}-lista`);
  const valor = document.createElement('span');
  valor.className = 'ui-selecao__valor';
  const seta = document.createElement('span');
  seta.className = 'ui-selecao__seta';
  seta.setAttribute('aria-hidden', 'true');
  gatilho.append(valor, seta);

  const lista = document.createElement('ul');
  lista.className = 'ui-selecao__lista';
  lista.id = `${marca}-lista`;
  lista.setAttribute('role', 'listbox');
  lista.hidden = true;

  // O rótulo continua sendo o `<label>` da tela: nada de rótulo duplicado só para o
  // widget. Clicar nele foca o nativo, e o foco é reencaminhado ao gatilho logo abaixo.
  const rotulo = rotuloDe(nativa);
  if (rotulo) {
    rotulo.id ||= `${marca}-rotulo`;
    gatilho.setAttribute('aria-labelledby', `${rotulo.id} ${marca}-gatilho`);
  } else if (nativa.getAttribute('aria-label')) {
    gatilho.setAttribute('aria-label', nativa.getAttribute('aria-label') ?? '');
  }
  const descritores = nativa.getAttribute('aria-describedby');
  if (descritores) gatilho.setAttribute('aria-describedby', descritores);

  grupo.append(gatilho, lista);

  let aberta = false;
  let ativa = -1;
  let digitado = '';
  let relogioDigitacao = 0;

  const opcoes = (): HTMLOptionElement[] => [...nativa.options];
  const itens = (): HTMLElement[] => [...lista.querySelectorAll<HTMLElement>('[role="option"]')];

  const marcarAtiva = (indice: number) => {
    ativa = indice;
    const lidos = itens();
    for (const [posicao, item] of lidos.entries())
      item.dataset.ativa = posicao === indice ? 'sim' : 'nao';
    const alvo = lidos[indice];
    if (alvo) {
      gatilho.setAttribute('aria-activedescendant', alvo.id);
      alvo.scrollIntoView?.({ block: 'nearest' });
    } else gatilho.removeAttribute('aria-activedescendant');
  };

  const escolher = (indice: number) => {
    const alvo = opcoes()[indice];
    if (!alvo) return;
    nativa.selectedIndex = indice;
    // Os dois eventos: o código da tela escuta ora `input`, ora `change`, e o `<select>`
    // programático não dispara nenhum dos dois sozinho.
    nativa.dispatchEvent(new Event('input', { bubbles: true }));
    nativa.dispatchEvent(new Event('change', { bubbles: true }));
    sincronizar();
  };

  const fechar = (devolverFoco = true) => {
    if (!aberta) return;
    aberta = false;
    lista.hidden = true;
    gatilho.setAttribute('aria-expanded', 'false');
    gatilho.removeAttribute('aria-activedescendant');
    if (devolverFoco) gatilho.focus();
  };

  const abrir = () => {
    if (aberta || nativa.disabled) return;
    aberta = true;
    lista.hidden = false;
    gatilho.setAttribute('aria-expanded', 'true');
    marcarAtiva(nativa.selectedIndex >= 0 ? nativa.selectedIndex : 0);
  };

  function sincronizar(): void {
    const lidas = opcoes();
    lista.replaceChildren(
      ...lidas.map((opcao, posicao) => {
        const item = document.createElement('li');
        item.className = 'ui-selecao__opcao';
        item.id = `${marca}-opcao-${posicao}`;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', posicao === nativa.selectedIndex ? 'true' : 'false');
        item.dataset.valor = opcao.value;
        item.textContent = opcao.textContent ?? '';
        item.addEventListener('click', () => {
          escolher(posicao);
          fechar();
        });
        return item;
      }),
    );
    const escolhida = lidas[nativa.selectedIndex];
    valor.textContent = escolhida?.textContent ?? '';
    valor.dataset.vazio = escolhida && escolhida.value !== '' ? 'nao' : 'sim';
    gatilho.disabled = nativa.disabled;
    const invalida = nativa.getAttribute('aria-invalid');
    if (invalida) gatilho.setAttribute('aria-invalid', invalida);
    else gatilho.removeAttribute('aria-invalid');
    if (nativa.required) gatilho.setAttribute('aria-required', 'true');
    else gatilho.removeAttribute('aria-required');
    if (nativa.disabled) fechar(false);
  }

  const saltarPorLetra = (letra: string) => {
    const agora = Date.now();
    digitado = agora - relogioDigitacao > 800 ? letra : digitado + letra;
    relogioDigitacao = agora;
    const alvo = opcoes().findIndex((opcao) =>
      (opcao.textContent ?? '').toLocaleLowerCase('pt-BR').startsWith(digitado),
    );
    if (alvo < 0) return;
    if (aberta) marcarAtiva(alvo);
    else escolher(alvo);
  };

  gatilho.addEventListener('click', () => (aberta ? fechar() : abrir()));
  gatilho.addEventListener('keydown', (evento) => {
    const lidas = opcoes();
    const ultimo = lidas.length - 1;
    switch (evento.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        evento.preventDefault();
        if (!aberta) {
          abrir();
          return;
        }
        const passo = evento.key === 'ArrowDown' ? 1 : -1;
        marcarAtiva(Math.min(ultimo, Math.max(0, (ativa < 0 ? 0 : ativa) + passo)));
        return;
      }
      case 'Home':
        if (!aberta) return;
        evento.preventDefault();
        marcarAtiva(0);
        return;
      case 'End':
        if (!aberta) return;
        evento.preventDefault();
        marcarAtiva(ultimo);
        return;
      case 'Enter':
      case ' ':
      case 'Spacebar':
        evento.preventDefault();
        if (!aberta) {
          abrir();
          return;
        }
        escolher(ativa);
        fechar();
        return;
      case 'Escape':
        if (!aberta) return;
        // O Esc da seleção não pode fechar o diálogo que a contém.
        evento.preventDefault();
        evento.stopPropagation();
        fechar();
        return;
      case 'Tab':
        fechar(false);
        return;
      default:
        if (evento.key.length === 1 && !evento.ctrlKey && !evento.metaKey && !evento.altKey)
          saltarPorLetra(evento.key.toLocaleLowerCase('pt-BR'));
    }
  });
  // Clicar fora é desistir, não escolher.
  const aoClicarFora = (evento: MouseEvent) => {
    if (aberta && !grupo.contains(evento.target as Node)) fechar(false);
  };
  document.addEventListener('click', aoClicarFora, true);
  // Qualquer foco dirigido ao controle nativo — `label` clicado, `focus()` de validação —
  // termina no gatilho, que é o que a pessoa vê.
  nativa.addEventListener('focus', () => gatilho.focus());
  nativa.form?.addEventListener('reset', () => setTimeout(sincronizar, 0));
  nativa.addEventListener('change', sincronizar);
  nativa.addEventListener('input', sincronizar);
  const observador = new MutationObserver(sincronizar);
  observador.observe(nativa, {
    attributes: true,
    attributeFilter: ['disabled', 'aria-invalid', 'required'],
    childList: true,
    subtree: true,
  });

  sincronizar();
  const selecao: Selecao = {
    grupo,
    gatilho,
    lista,
    sincronizar,
    encerrar() {
      observador.disconnect();
      document.removeEventListener('click', aoClicarFora, true);
      aprimoradas.delete(nativa);
    },
  };
  aprimoradas.set(nativa, selecao);
  return selecao;
}

/** Aprimora os `<select>` ainda nativos dentro de uma raiz.
 *
 *  Pula de propósito os que já foram aprimorados, em vez de ressincronizá-los: quem chama
 *  isto costuma ser um `MutationObserver` que vigia o formulário, e ressincronizar
 *  reescreveria a lista de opções dentro da própria raiz vigiada — a observação dispararia
 *  de novo, e a tela travaria em laço. */
export function aprimorarSelecoes(raiz: ParentNode): Selecao[] {
  return [...raiz.querySelectorAll('select')]
    .filter((nativa) => !nativa.parentElement?.hasAttribute('data-aprimorada'))
    .map(aprimorarSelecao);
}
