/** Campo de data próprio, no lugar do `input[type=date]` do navegador.
 *
 *  Por que trocar: em 25/11/2026 havia 18 campos de data nativos. Cada navegador desenha
 *  o seu, com ordem de segmentos e calendário próprios, e no celular abre a roleta do
 *  sistema. Datar é um dos três momentos de maior atenção da tela, e era o navegador que
 *  aparecia nele.
 *
 *  Por que aprimorar em vez de substituir: como na seleção, o `input[type=date]` continua
 *  no documento e continua sendo o dono do valor, em ISO (`aaaa-mm-dd`). É ele que o
 *  formulário envia e que o restante do código lê e escreve. Aqui entra um campo de texto
 *  dd/mm/aaaa, com teclado numérico no celular, e um calendário navegável por teclado.
 *
 *  Nada de fuso: uma data de nascimento não é um instante. As contas são feitas sobre os
 *  três números, nunca sobre `new Date(iso)`, que desloca o dia conforme o fuso da máquina.
 */

export type CampoData = {
  grupo: HTMLElement;
  texto: HTMLInputElement;
  abrir: HTMLButtonElement;
  calendario: HTMLElement;
  sincronizar(): void;
  encerrar(): void;
};

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const aprimorados = new WeakMap<HTMLInputElement, CampoData>();
let sequencia = 0;

type Partes = { ano: number; mes: number; dia: number };

function doIso(iso: string): Partes | null {
  const partida = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!partida) return null;
  const ano = Number(partida[1]);
  const mes = Number(partida[2]);
  const dia = Number(partida[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > diasNoMes(ano, mes)) return null;
  return { ano, mes, dia };
}

function paraIso({ ano, mes, dia }: Partes): string {
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function primeiroDiaDaSemana(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay();
}

/** dd/mm/aaaa a partir do ISO; string vazia quando não há data válida. */
export function paraVisivel(iso: string): string {
  const partes = doIso(iso);
  return partes
    ? `${String(partes.dia).padStart(2, '0')}/${String(partes.mes).padStart(2, '0')}/${partes.ano}`
    : '';
}

/** ISO a partir de dd/mm/aaaa; `null` quando o que foi digitado não é uma data real. */
export function doVisivel(visivel: string): string | null {
  const partida = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(visivel.trim());
  if (!partida) return null;
  const partes = { dia: Number(partida[1]), mes: Number(partida[2]), ano: Number(partida[3]) };
  if (partes.mes < 1 || partes.mes > 12) return null;
  if (partes.dia < 1 || partes.dia > diasNoMes(partes.ano, partes.mes)) return null;
  return paraIso(partes);
}

/** Vai pondo as barras enquanto se digita, sem recusar o que ainda está incompleto. */
function mascarar(bruto: string): string {
  const numeros = bruto.replace(/\D/g, '').slice(0, 8);
  const dia = numeros.slice(0, 2);
  const mes = numeros.slice(2, 4);
  const ano = numeros.slice(4, 8);
  return [dia, mes, ano].filter((parte) => parte !== '').join('/');
}

/** Troca o `input[type=date]` pelo campo de data da aplicação. Idempotente. */
export function aprimorarData(nativo: HTMLInputElement): CampoData {
  const existente = aprimorados.get(nativo);
  if (existente) {
    existente.sincronizar();
    return existente;
  }

  sequencia += 1;
  const marca = `ui-data-${sequencia}`;
  const grupo = document.createElement('div');
  grupo.className = 'ui-data';
  nativo.replaceWith(grupo);
  grupo.append(nativo);
  grupo.dataset.aprimorada = '';
  nativo.setAttribute('aria-hidden', 'true');
  nativo.tabIndex = -1;

  const linha = document.createElement('div');
  linha.className = 'ui-data__linha';
  const texto = document.createElement('input');
  texto.type = 'text';
  texto.id = `${marca}-texto`;
  texto.className = 'ui-campo__controle ui-data__texto';
  texto.inputMode = 'numeric';
  texto.setAttribute('autocomplete', 'off');
  texto.placeholder = 'dd/mm/aaaa';
  texto.maxLength = 10;

  const rotulo = nativo.labels?.[0] ?? nativo.closest('label');
  if (rotulo) {
    rotulo.id ||= `${marca}-rotulo`;
    // O rótulo da tela passa a apontar para o campo que a pessoa vê e digita.
    if (rotulo instanceof HTMLLabelElement) rotulo.htmlFor = texto.id;
    texto.setAttribute('aria-labelledby', rotulo.id);
  } else if (nativo.getAttribute('aria-label')) {
    texto.setAttribute('aria-label', nativo.getAttribute('aria-label') ?? '');
  }
  const descritores = nativo.getAttribute('aria-describedby');
  const dica = document.createElement('p');
  dica.id = `${marca}-formato`;
  dica.className = 'sr-only';
  dica.textContent = 'Formato dia, mês e ano, com quatro dígitos no ano. Exemplo: 31/01/2000.';
  texto.setAttribute('aria-describedby', [descritores, dica.id].filter(Boolean).join(' '));

  const abrir = document.createElement('button');
  abrir.type = 'button';
  abrir.className = 'ui-data__abrir';
  abrir.dataset.ui = 'calendario';
  abrir.setAttribute('aria-expanded', 'false');
  abrir.setAttribute('aria-haspopup', 'dialog');
  abrir.setAttribute('aria-label', 'Escolher no calendário');
  abrir.textContent = '▦';

  const calendario = document.createElement('div');
  calendario.className = 'ui-data__calendario';
  calendario.id = `${marca}-calendario`;
  calendario.setAttribute('role', 'dialog');
  calendario.setAttribute('aria-label', 'Calendário');
  calendario.hidden = true;
  abrir.setAttribute('aria-controls', calendario.id);

  linha.append(texto, abrir);
  grupo.append(linha, dica, calendario);

  const hoje = new Date();
  let foco: Partes = doIso(nativo.value) ?? {
    ano: hoje.getFullYear(),
    mes: hoje.getMonth() + 1,
    dia: hoje.getDate(),
  };

  const definir = (iso: string) => {
    nativo.value = iso;
    nativo.dispatchEvent(new Event('input', { bubbles: true }));
    nativo.dispatchEvent(new Event('change', { bubbles: true }));
    sincronizar();
  };

  const fechar = (devolverFoco = true) => {
    if (calendario.hidden) return;
    calendario.hidden = true;
    abrir.setAttribute('aria-expanded', 'false');
    if (devolverFoco) abrir.focus();
  };

  function desenharCalendario(): void {
    const navegacao = document.createElement('div');
    navegacao.className = 'ui-data__navegacao';
    const anterior = document.createElement('button');
    anterior.type = 'button';
    anterior.className = 'ui-data__passo';
    anterior.setAttribute('aria-label', 'Mês anterior');
    anterior.textContent = '‹';
    anterior.addEventListener('click', () => mover(0, -1));
    const seguinte = document.createElement('button');
    seguinte.type = 'button';
    seguinte.className = 'ui-data__passo';
    seguinte.setAttribute('aria-label', 'Próximo mês');
    seguinte.textContent = '›';
    seguinte.addEventListener('click', () => mover(0, 1));
    const mes = document.createElement('p');
    mes.className = 'ui-data__mes';
    mes.setAttribute('aria-live', 'polite');
    mes.textContent = `${MESES[foco.mes - 1]} de ${foco.ano}`;
    navegacao.append(anterior, mes, seguinte);

    const grade = document.createElement('div');
    grade.className = 'ui-data__grade';
    grade.setAttribute('role', 'grid');
    for (const dia of DIAS) {
      const cabeca = document.createElement('span');
      cabeca.className = 'ui-data__cabecalho-dia';
      cabeca.setAttribute('role', 'columnheader');
      cabeca.setAttribute('aria-hidden', 'true');
      cabeca.textContent = dia;
      grade.append(cabeca);
    }
    for (let vazio = 0; vazio < primeiroDiaDaSemana(foco.ano, foco.mes); vazio += 1)
      grade.append(document.createElement('span'));
    const escolhido = doIso(nativo.value);
    for (let dia = 1; dia <= diasNoMes(foco.ano, foco.mes); dia += 1) {
      const celula = document.createElement('button');
      celula.type = 'button';
      celula.className = 'ui-data__dia';
      celula.dataset.dia = String(dia);
      const partes = { ano: foco.ano, mes: foco.mes, dia };
      celula.setAttribute('aria-label', `${dia} de ${MESES[foco.mes - 1]} de ${foco.ano}`);
      celula.setAttribute(
        'aria-selected',
        escolhido && paraIso(escolhido) === paraIso(partes) ? 'true' : 'false',
      );
      if (
        dia === hoje.getDate() &&
        foco.mes === hoje.getMonth() + 1 &&
        foco.ano === hoje.getFullYear()
      )
        celula.dataset.hoje = 'sim';
      celula.tabIndex = dia === foco.dia ? 0 : -1;
      celula.textContent = String(dia);
      celula.addEventListener('click', () => {
        definir(paraIso(partes));
        fechar();
      });
      grade.append(celula);
    }
    calendario.replaceChildren(navegacao, grade);
  }

  function mover(dias: number, meses: number): void {
    const base = new Date(Date.UTC(foco.ano, foco.mes - 1 + meses, foco.dia + dias));
    foco = {
      ano: base.getUTCFullYear(),
      mes: base.getUTCMonth() + 1,
      dia: base.getUTCDate(),
    };
    desenharCalendario();
    calendario.querySelector<HTMLElement>('.ui-data__dia[tabindex="0"]')?.focus();
  }

  calendario.addEventListener('keydown', (evento) => {
    const passos: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [-7, 0],
      ArrowDown: [7, 0],
      PageUp: [0, -1],
      PageDown: [0, 1],
    };
    const passo = passos[evento.key];
    if (passo) {
      evento.preventDefault();
      mover(passo[0], passo[1]);
      return;
    }
    if (evento.key === 'Escape') {
      // Não pode fechar o diálogo que contém o campo.
      evento.preventDefault();
      evento.stopPropagation();
      fechar();
    }
  });

  abrir.addEventListener('click', () => {
    if (!calendario.hidden) {
      fechar();
      return;
    }
    foco = doIso(nativo.value) ?? foco;
    desenharCalendario();
    calendario.hidden = false;
    abrir.setAttribute('aria-expanded', 'true');
    calendario.querySelector<HTMLElement>('.ui-data__dia[tabindex="0"]')?.focus();
  });

  texto.addEventListener('input', () => {
    texto.value = mascarar(texto.value);
    const iso = doVisivel(texto.value);
    if (iso) {
      nativo.value = iso;
      nativo.dispatchEvent(new Event('input', { bubbles: true }));
      nativo.dispatchEvent(new Event('change', { bubbles: true }));
      texto.removeAttribute('aria-invalid');
      return;
    }
    // Apagar o campo apaga a data; escrever algo incompleto não escolhe data nenhuma.
    nativo.value = '';
    nativo.dispatchEvent(new Event('input', { bubbles: true }));
    if (texto.value.length === 10) texto.setAttribute('aria-invalid', 'true');
    else texto.removeAttribute('aria-invalid');
  });

  function sincronizar(): void {
    const visivel = paraVisivel(nativo.value);
    if (doVisivel(texto.value) !== (nativo.value || null)) texto.value = visivel;
    texto.disabled = nativo.disabled;
    abrir.disabled = nativo.disabled;
    const invalido = nativo.getAttribute('aria-invalid');
    if (invalido) texto.setAttribute('aria-invalid', invalido);
    else if (texto.value.length !== 10 || doVisivel(texto.value))
      texto.removeAttribute('aria-invalid');
    if (nativo.required) texto.setAttribute('aria-required', 'true');
    else texto.removeAttribute('aria-required');
  }

  const aoClicarFora = (evento: MouseEvent) => {
    if (!calendario.hidden && !grupo.contains(evento.target as Node)) fechar(false);
  };
  document.addEventListener('click', aoClicarFora, true);
  nativo.addEventListener('focus', () => texto.focus());
  // `form.reset()` não dispara `change` nem muda atributo: sem isto o campo visível ficava
  // mostrando a data do cadastro anterior depois de um envio bem-sucedido.
  nativo.form?.addEventListener('reset', () => setTimeout(sincronizar, 0));
  nativo.addEventListener('change', sincronizar);
  const observador = new MutationObserver(sincronizar);
  observador.observe(nativo, {
    attributes: true,
    attributeFilter: ['disabled', 'aria-invalid', 'required', 'value'],
  });

  sincronizar();
  const campo: CampoData = {
    grupo,
    texto,
    abrir,
    calendario,
    sincronizar,
    encerrar() {
      observador.disconnect();
      document.removeEventListener('click', aoClicarFora, true);
      aprimorados.delete(nativo);
    },
  };
  aprimorados.set(nativo, campo);
  return campo;
}

/** Aprimora todos os campos de data dentro de uma raiz. Idempotente. */
export function aprimorarDatas(raiz: ParentNode): CampoData[] {
  return [...raiz.querySelectorAll<HTMLInputElement>('input[type="date"]')].map(aprimorarData);
}
