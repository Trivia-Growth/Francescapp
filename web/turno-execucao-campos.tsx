/** Controles compartilhados pelas superfícies de execução do cuidado.
 *
 * Este arquivo é a FRONTEIRA da migração do bloco `turno-execucao-*` (VIS-018). Ele
 * carrega duas camadas de propósito e por tempo determinado:
 *
 * 1. **A camada React** — `CampoTurno`, `SelecaoTurno`, `EstadoTurno` —, que não desenha
 *    controle nenhum por conta própria: delega a `web/componentes/ui/`, de onde vêm as
 *    medidas, o `aria-describedby` com dica e erro, e o tamanho de fonte que impede o
 *    iOS de dar zoom ao focar. É o que os módulos já migrados consomem.
 *
 * 2. **As fábricas imperativas** — `elementoTurno`, `campoTurno`, `selecaoTurno`,
 *    `botaoTurno`, `estadoTurno` —, ainda consumidas por `-gestao`, `-relatorios`,
 *    `-arquivos`, `-localizacao-coordenacao` e `turno-execucao.ts`. `-editor` migrou em
 *    25/11/2026 e já consome só a camada React. Elas NÃO foram reescritas: reescrevê-las
 *    mudaria o DOM de módulos que esta frente não migrou, e quem muda o DOM de um módulo
 *    é a migração dele, não a de um vizinho. Saem inteiras quando o último consumidor
 *    migrar — não antes, e não por partes.
 *
 * Os validadores (`numeroTurno`, `instanteTurno`, `dataLocalTurno`) são lógica pura e
 * servem às duas camadas sem mudança: são regra de dado clínico, não de desenho.
 */
import { useId, type ReactNode } from 'react';
import { AreaTexto } from './componentes/ui/area-texto.js';
import { Campo } from './componentes/ui/campo.js';
import { SelecaoSimples } from './componentes/ui/selecao-simples.js';
import './estilos/tema.css';
import { botao as botaoDaCamada } from './ui/basicos.js';

/** Uma opção de `SelecaoTurno`, no vocabulário das telas de turno. */
export type OpcaoTurno<T extends string = string> = { valor: T; rotulo: string };

/** Campo de texto do turno. O controle é NÃO controlado — o DOM continua dono do valor,
 *  como na versão imperativa —, então quem lê usa `valorDe` de `web/telas/formulario.tsx`
 *  ou a própria referência. `obrigatorio` tem padrão `true`, igual ao de `campoTurno`. */
export function CampoTurno({
  rotulo,
  nome,
  tipo = 'text',
  valor,
  obrigatorio = true,
  longo = false,
  ajuda,
  id,
  ...resto
}: {
  rotulo: string;
  nome: string;
  tipo?: string;
  valor?: string;
  obrigatorio?: boolean;
  /** Área de texto no lugar de uma linha. */
  longo?: boolean;
  ajuda?: string;
  id?: string;
  linhas?: number;
  disabled?: boolean;
  /** Passagem direta para o controle numérico — `turno-execucao-editor.tsx` precisa de
   *  `step`/`min` nos campos de valor aferido e de contagem, exatamente como a fábrica
   *  imperativa fazia atribuindo `.step`/`.min` após criar o controle. */
  step?: string;
  min?: string;
}) {
  const gerado = useId();
  const identificador = id ?? `turno-campo-${gerado}`;
  if (longo)
    return (
      <AreaTexto
        id={identificador}
        name={nome}
        rotulo={rotulo}
        dica={ajuda}
        required={obrigatorio}
        defaultValue={valor ?? ''}
        {...resto}
      />
    );
  return (
    <Campo
      id={identificador}
      name={nome}
      rotulo={rotulo}
      tipo={tipo}
      dica={ajuda}
      required={obrigatorio}
      defaultValue={valor ?? ''}
      {...resto}
    />
  );
}

/** Seleção do turno. A opção vazia "Selecione" continua sendo a primeira e o valor
 *  continua obrigatório: escolher é decisão explícita de quem registra. */
export function SelecaoTurno<T extends string>({
  rotulo,
  nome,
  opcoes,
  valor,
  ajuda,
  id,
  disabled,
}: {
  rotulo: string;
  nome: string;
  opcoes: readonly OpcaoTurno<T>[];
  valor?: T;
  ajuda?: string;
  id?: string;
  disabled?: boolean;
}) {
  const gerado = useId();
  const identificador = id ?? `turno-campo-${gerado}`;
  return (
    <SelecaoSimples
      id={identificador}
      name={nome}
      rotulo={rotulo}
      dica={ajuda}
      required
      disabled={disabled}
      defaultValue={valor ?? ''}
    >
      <option value="">Selecione</option>
      {opcoes.map((item) => (
        <option key={item.valor} value={item.valor}>
          {item.rotulo}
        </option>
      ))}
    </SelecaoSimples>
  );
}

/** A linha de situação da superfície. `role="status"` em `<p>` é o que as telas e as
 *  provas já procuram; `<output>` mudaria a semântica de formulário e o gancho. */
export function EstadoTurno({ children }: { children?: ReactNode }) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as provas desta tela já usam.
    <p role="status" aria-live="polite" className="m-0 text-(length:--texto-1) text-texto-suave">
      {children}
    </p>
  );
}

/* ——— Camada imperativa em extinção. Ver o cabeçalho: sai com o último consumidor. ——— */

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
