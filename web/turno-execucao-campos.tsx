/** Controles compartilhados pelas superfícies de execução do cuidado (VIS-018).
 *
 * `CampoTurno`, `SelecaoTurno` e `EstadoTurno` não desenham controle nenhum por conta
 * própria: delegam a `web/componentes/ui/`, de onde vêm as medidas, o `aria-describedby`
 * com dica e erro, e o tamanho de fonte que impede o iOS de dar zoom ao focar.
 *
 * `usarProtocoloTurno` reúne o que cada superfície imperativa repetia à mão — `ativa`,
 * `ocupada`, a linha de situação e a falha que distingue perda de acesso de recusa comum.
 *
 * As fábricas imperativas (`elementoTurno`, `campoTurno`, `selecaoTurno`, `botaoTurno`,
 * `estadoTurno`) saíram em 27/11/2026 com o último consumidor, `turno-execucao`.
 *
 * Os validadores (`numeroTurno`, `instanteTurno`, `dataLocalTurno`) são lógica pura: são
 * regra de dado clínico, não de desenho.
 */
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { flushSync } from 'react-dom';
import { FalhaApi, exigeNovoAcesso, mensagemFalha } from './api.ts';
import type { ArquivoTurno } from './servico-turno-execucao-http.ts';
import { AreaTexto } from './componentes/ui/area-texto.js';
import { Campo } from './componentes/ui/campo.js';
import { CampoData } from './componentes/ui/campo-data.js';
import { SelecaoAprimorada } from './componentes/ui/selecao-aprimorada.js';
import './estilos/tema.css';

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
  /** Limite do contrato aplicado no próprio controle: a tela não oferece o que vai recusar. */
  maxLength?: number;
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
  if (tipo === 'date')
    return (
      <CampoData
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
    <SelecaoAprimorada
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
    </SelecaoAprimorada>
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

/** O protocolo comum às superfícies do turno, que a versão imperativa repetia à mão em
 *  cada módulo: `ativa`, `ocupada`, a linha de situação e a `falha` que distingue perda de
 *  acesso (a superfície some e avisa quem a hospeda) de recusa comum (a frase aparece).
 *
 *  `ocupada` mora em ref E em estado: o protocolo decide de forma síncrona no meio de fluxo
 *  assíncrono, e o estado lido ali seria o do render anterior. `viva()` é falsa depois da
 *  desmontagem e depois da perda de acesso — é o que impede o protocolo de continuar
 *  gravando ou consultando por uma tela que já não existe. `pendencia_externa` não é perda
 *  de acesso: é resultado incerto, e quem decide o que fazer é a superfície. */
export function usarProtocoloTurno(inicial: string, acessoPerdido: (erro: unknown) => void) {
  const vivaRef = useRef(true);
  const avisar = useRef(acessoPerdido);
  avisar.current = acessoPerdido;
  useEffect(() => {
    vivaRef.current = true;
    return () => {
      vivaRef.current = false;
    };
  }, []);
  const ocupadaRef = useRef(false);
  const [ocupada, marcarOcupada] = useState(false);
  const [perdida, marcarPerdida] = useState(false);
  const [status, definirStatus] = useState(inicial);
  const viva = useCallback(() => vivaRef.current, []);
  /* `flushSync`: a trava dos controles é parte do protocolo, não desenho. Fora de evento o
     React agenda a repintura numa macrotarefa, e nesse intervalo o botão continuava
     desabilitado no DOM depois de a operação acabar — um clique ali era perdido em
     silêncio. A versão imperativa liberava na hora; esta também. */
  const definirOcupada = useCallback((valor: boolean) => {
    ocupadaRef.current = valor;
    if (vivaRef.current) flushSync(() => marcarOcupada(valor));
  }, []);
  const falha = useCallback((erro: unknown) => {
    if (!vivaRef.current) return;
    if (
      exigeNovoAcesso(erro) &&
      !(erro instanceof FalhaApi && erro.codigo === 'pendencia_externa')
    ) {
      vivaRef.current = false;
      flushSync(() => marcarPerdida(true));
      avisar.current(erro);
      return;
    }
    definirStatus(mensagemFalha(erro));
  }, []);
  return { viva, ocupadaRef, ocupada, definirOcupada, perdida, falha, status, definirStatus };
}

/** Ouve `change` diretamente no nó com este `id`, dentro do invólucro — não pela delegação
 *  do React, que as provas destas telas não alcançam ao disparar o evento sem `bubbles`.
 *  `flushSync` porque quem chama costuma conferir o efeito na linha seguinte. */
export function usarMudancaNativa(
  envolucroRef: RefObject<HTMLElement | null>,
  id: string,
  aoMudar: (valor: string) => void,
  /** Troca quando o nó é recriado (lista recarregada, chave nova): o ouvinte vai junto. */
  recriacao?: unknown,
) {
  const guardado = useRef(aoMudar);
  guardado.current = aoMudar;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `recriacao` é justamente o sinal de que o nó mudou.
  useEffect(() => {
    // Ids fixos escritos no código, sem caractere especial: dispensa `CSS.escape`, que o
    // jsdom das provas não implementa.
    const no = envolucroRef.current?.querySelector<HTMLSelectElement | HTMLInputElement>(`#${id}`);
    if (!no) return;
    const ouvir = () => flushSync(() => guardado.current(no.value));
    no.addEventListener('change', ouvir);
    return () => no.removeEventListener('change', ouvir);
  }, [envolucroRef, id, recriacao]);
}

/** Entrega de arquivo recebido do servidor, revogando a URL temporária logo depois e na
 *  desmontagem. Sem DOM da tela: o link é descartável e nunca entra no documento. */
export function criarEntregaArquivoTurno() {
  let ativa = true;
  const urls = new Map<string, ReturnType<typeof setTimeout>>();
  return {
    entregar(arquivo: ArquivoTurno) {
      if (!ativa) return;
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(arquivo.bytes)], { type: arquivo.tipo }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = arquivo.nome;
      link.rel = 'noopener';
      link.click();
      const prazo = setTimeout(() => {
        URL.revokeObjectURL(url);
        urls.delete(url);
      }, 1_000);
      urls.set(url, prazo);
    },
    desmontar() {
      ativa = false;
      for (const [url, prazo] of urls) {
        clearTimeout(prazo);
        URL.revokeObjectURL(url);
      }
      urls.clear();
    },
  };
}

/** A entrega com o ciclo de vida da superfície: some com ela. */
export function usarEntregaArquivoTurno() {
  const entrega = useRef<ReturnType<typeof criarEntregaArquivoTurno> | null>(null);
  entrega.current ??= criarEntregaArquivoTurno();
  useEffect(() => {
    const atual = entrega.current;
    return () => atual?.desmontar();
  }, []);
  return entrega.current;
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
