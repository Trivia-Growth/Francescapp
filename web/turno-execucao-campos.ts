/** Controles compartilhados pelas superfícies de execução do cuidado. */
import { botao as botaoDaCamada } from './ui/basicos.js';

export function elementoTurno<K extends keyof HTMLElementTagNameMap>(tipo: K, texto?: string) {
  const elemento = document.createElement(tipo);
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}
export function campoTurno(
  destino: HTMLElement,
  rotulo: string,
  opcoes: {
    tipo?: string;
    valor?: string;
    obrigatorio?: boolean;
    longo?: boolean;
    ajuda?: string;
  } = {},
): HTMLInputElement | HTMLTextAreaElement {
  const label = elementoTurno('label', rotulo);
  const controle = opcoes.longo ? elementoTurno('textarea') : elementoTurno('input');
  if (controle instanceof HTMLInputElement) controle.type = opcoes.tipo ?? 'text';
  controle.required = opcoes.obrigatorio ?? true;
  controle.value = opcoes.valor ?? '';
  controle.id = `turno-campo-${crypto.randomUUID()}`;
  label.htmlFor = controle.id;
  label.append(controle);
  if (opcoes.ajuda) {
    const ajuda = elementoTurno('small', opcoes.ajuda);
    ajuda.id = `${controle.id}-ajuda`;
    controle.setAttribute('aria-describedby', ajuda.id);
    label.append(ajuda);
  }
  destino.append(label);
  return controle;
}
export function selecaoTurno<T extends string>(
  destino: HTMLElement,
  rotulo: string,
  opcoes: readonly { valor: T; rotulo: string }[],
  valor?: T,
) {
  const label = elementoTurno('label', rotulo);
  const controle = elementoTurno('select');
  controle.required = true;
  controle.id = `turno-campo-${crypto.randomUUID()}`;
  label.htmlFor = controle.id;
  const vazio = elementoTurno('option', 'Selecione');
  vazio.value = '';
  controle.append(vazio);
  for (const item of opcoes) {
    const opcao = elementoTurno('option', item.rotulo);
    opcao.value = item.valor;
    controle.append(opcao);
  }
  controle.value = valor ?? '';
  label.append(controle);
  destino.append(label);
  return controle;
}
export function numeroTurno(controle: HTMLInputElement | HTMLTextAreaElement): number {
  if (!controle.value.trim() || !/^-?\d+(\.\d+)?$/.test(controle.value.trim()))
    throw new Error('Informe um número válido.');
  const valor = Number(controle.value);
  if (!Number.isFinite(valor)) throw new Error('Informe um número finito.');
  return valor;
}
export function instanteTurno(valor: string): string {
  if (!valor) throw new Error('Informe data e horário.');
  const data = new Date(valor);
  if (!Number.isFinite(data.getTime())) throw new Error('Confira data e horário.');
  return data.toISOString();
}
export function dataLocalTurno(valor?: string): string {
  if (!valor) return '';
  const data = new Date(valor);
  if (!Number.isFinite(data.getTime())) return '';
  const local = new Date(data.getTime() - data.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
/** Única fábrica de botão de plantão e turno: trocá-la aqui troca os quarenta botões
 *  dessas telas de uma vez. Passa a devolver o botão da camada de componente, para a ação
 *  do turno ser a mesma peça da ação do cadastro e da carteira. `onclick` continua sendo
 *  atribuição, e não `addEventListener`: há chamador que troca a ação do botão depois de
 *  montá-lo, e com dois registros a ação antiga continuaria disparando. */
export function botaoTurno(texto: string, acao: () => void, principal = false) {
  const elemento = botaoDaCamada({ rotulo: texto, peso: principal ? 'principal' : 'secundario' });
  elemento.onclick = acao;
  return elemento;
}
export function estadoTurno(texto = '') {
  const estado = elementoTurno('p', texto);
  estado.setAttribute('role', 'status');
  estado.setAttribute('aria-live', 'polite');
  return estado;
}
