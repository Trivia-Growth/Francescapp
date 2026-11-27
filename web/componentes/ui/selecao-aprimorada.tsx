import {
  type ComponentPropsWithRef,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { EnvelopeCampo, descritores } from './campo.js';

type PropsSelecaoAprimorada = Omit<ComponentPropsWithRef<'select'>, 'id' | 'multiple' | 'size'> & {
  id: string;
  rotulo?: string;
  marcaRotulo?: string;
  dica?: string;
  erro?: string;
  classeEnvelope?: string;
};

type Opcao = { valor: string; texto: string; desabilitada: boolean };
type SelecaoLida = { opcoes: Opcao[]; indice: number };

export function SelecaoAprimorada({
  id,
  rotulo,
  marcaRotulo,
  dica,
  erro,
  classeEnvelope,
  children,
  ref,
  value,
  defaultValue,
  disabled,
  required,
  onFocus,
  'aria-label': nome,
  'aria-labelledby': rotuladoPor,
  'aria-describedby': descritoPor = rotulo ? descritores(id, dica) : undefined,
  'aria-invalid': invalida = erro ? true : undefined,
  ...resto
}: PropsSelecaoAprimorada) {
  const nativa = useRef<HTMLSelectElement>(null);
  const grupo = useRef<HTMLDivElement>(null);
  const gatilho = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const digitacao = useRef({ texto: '', instante: 0 });
  const [selecao, lerSelecao] = useState<SelecaoLida>({
    opcoes: [],
    indice: -1,
  });
  const [ativa, definirAtiva] = useState<number | null>(null);
  const aberta = ativa !== null && !disabled;
  const idLista = `${id}-lista`;
  const idRotulo = `${id}-rotulo`;

  const sincronizar = useCallback(() => {
    const campo = nativa.current;
    if (!campo) return;
    lerSelecao({
      opcoes: Array.from(campo.options, (opcao) => ({
        valor: opcao.value,
        texto: opcao.label,
        desabilitada: opcao.disabled || opcao.parentElement?.matches('optgroup:disabled') === true,
      })),
      indice: campo.selectedIndex,
    });
  }, []);

  // A leitura acontece depois de o React aplicar as opções e o valor. Isso cobre também
  // defaultValue e a seleção implícita da primeira opção, cuja escolha é do navegador.
  // biome-ignore lint/correctness/useExhaustiveDependencies: estas props mudam a seleção nativa.
  useLayoutEffect(sincronizar, [sincronizar, children, value, defaultValue]);

  useEffect(() => {
    const campo = nativa.current;
    const form = campo?.form;
    let aposReset: ReturnType<typeof setTimeout> | undefined;
    function reiniciar() {
      clearTimeout(aposReset);
      aposReset = setTimeout(() => {
        definirAtiva(null);
        sincronizar();
      }, 0);
    }
    campo?.addEventListener('input', sincronizar);
    campo?.addEventListener('change', sincronizar);
    form?.addEventListener('reset', reiniciar);
    return () => {
      clearTimeout(aposReset);
      campo?.removeEventListener('input', sincronizar);
      campo?.removeEventListener('change', sincronizar);
      form?.removeEventListener('reset', reiniciar);
    };
  }, [sincronizar]);

  useEffect(() => {
    if (!aberta) return;
    function fecharFora(evento: PointerEvent) {
      if (evento.target instanceof Node && !grupo.current?.contains(evento.target)) {
        definirAtiva(null);
      }
    }
    document.addEventListener('pointerdown', fecharFora, true);
    return () => document.removeEventListener('pointerdown', fecharFora, true);
  }, [aberta]);

  useLayoutEffect(() => {
    if (aberta && ativa !== null) {
      lista.current?.children[ativa]?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [aberta, ativa]);

  const { opcoes, indice } = selecao;
  const escolhida = opcoes[indice];
  const navegaveis = opcoes.flatMap((opcao, posicao) => (opcao.desabilitada ? [] : [posicao]));
  const indiceAtivo = ativa !== null && navegaveis.includes(ativa) ? ativa : -1;

  function abrir() {
    definirAtiva(navegaveis.includes(indice) ? indice : (navegaveis[0] ?? -1));
  }

  function escolher(posicao: number) {
    const campo = nativa.current;
    if (!campo || campo.matches(':disabled') || !navegaveis.includes(posicao)) return;
    campo.selectedIndex = posicao;
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    campo.dispatchEvent(new Event('change', { bubbles: true }));
    sincronizar();
  }

  function aoTeclar(evento: KeyboardEvent<HTMLButtonElement>) {
    switch (evento.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        evento.preventDefault();
        if (!aberta) {
          abrir();
          break;
        }
        const posicao = navegaveis.indexOf(indiceAtivo);
        const passo = evento.key === 'ArrowDown' ? 1 : -1;
        const destino = Math.max(0, Math.min(navegaveis.length - 1, posicao + passo));
        definirAtiva(navegaveis[destino] ?? -1);
        break;
      }
      case 'Home':
      case 'End':
        if (!aberta) return;
        evento.preventDefault();
        definirAtiva((evento.key === 'Home' ? navegaveis[0] : navegaveis.at(-1)) ?? -1);
        break;
      case 'Enter':
      case ' ':
        evento.preventDefault();
        if (aberta) {
          escolher(indiceAtivo);
          definirAtiva(null);
        } else abrir();
        break;
      case 'Escape':
        if (!aberta) return;
        evento.preventDefault();
        evento.stopPropagation();
        definirAtiva(null);
        break;
      case 'Tab':
        definirAtiva(null);
        break;
      default: {
        if (evento.key.length !== 1 || evento.ctrlKey || evento.metaKey || evento.altKey) return;
        const instante = Date.now();
        const letra = evento.key.toLocaleLowerCase('pt-BR');
        const texto =
          (instante - digitacao.current.instante > 800 ? '' : digitacao.current.texto) + letra;
        digitacao.current = { texto, instante };
        const alvo = navegaveis.find((posicao) =>
          opcoes[posicao]?.texto.toLocaleLowerCase('pt-BR').startsWith(texto),
        );
        if (alvo === undefined) return;
        if (aberta) definirAtiva(alvo);
        else escolher(alvo);
      }
    }
  }

  const controle = (
    // O atributo já está presente quando o nativo entra no DOM. Durante a migração,
    // o observador legado reconhece este invólucro e pula o controle.
    <div ref={grupo} className="ui-selecao" data-aprimorada="">
      <select
        {...resto}
        ref={(campo) => {
          nativa.current = campo;
          if (typeof ref === 'function') return ref(campo);
          if (ref) ref.current = campo;
        }}
        id={id}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        required={required}
        aria-hidden="true"
        aria-describedby={descritoPor}
        aria-invalid={invalida}
        tabIndex={-1}
        onFocus={(evento) => {
          onFocus?.(evento);
          gatilho.current?.focus();
        }}
      >
        {children}
      </select>
      <button
        ref={gatilho}
        type="button"
        className="ui-selecao__gatilho"
        // biome-ignore lint/a11y/useSemanticElements: o gatilho mostra o valor do select nativo.
        role="combobox"
        aria-label={nome}
        aria-labelledby={rotuladoPor ?? (rotulo ? idRotulo : undefined)}
        aria-describedby={descritoPor}
        aria-invalid={invalida}
        aria-required={required || undefined}
        aria-haspopup="listbox"
        aria-expanded={aberta}
        aria-controls={idLista}
        aria-activedescendant={
          aberta && indiceAtivo >= 0 ? `${idLista}-opcao-${indiceAtivo}` : undefined
        }
        disabled={disabled}
        onClick={() => (aberta ? definirAtiva(null) : abrir())}
        onKeyDown={aoTeclar}
      >
        <span className="ui-selecao__valor" data-vazio={escolhida?.valor ? 'nao' : 'sim'}>
          {escolhida?.texto}
        </span>
        <span className="ui-selecao__seta" aria-hidden="true" />
      </button>
      <div
        ref={lista}
        id={idLista}
        // biome-ignore lint/a11y/useSemanticElements: a lista pertence ao combobox e é navegada pelo gatilho.
        role="listbox"
        tabIndex={-1}
        className="ui-selecao__lista"
        aria-label={nome}
        aria-labelledby={rotuladoPor ?? (rotulo ? idRotulo : undefined)}
        hidden={!aberta}
      >
        {opcoes.map((opcao, posicao) => (
          // biome-ignore lint/a11y/useKeyWithClickEvents: o teclado fica no gatilho via aria-activedescendant.
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: a posição é o selectedIndex nativo e a identidade de foco.
            key={posicao}
            id={`${idLista}-opcao-${posicao}`}
            className="ui-selecao__opcao"
            // biome-ignore lint/a11y/useSemanticElements: a opção visual espelha a opção nativa.
            role="option"
            tabIndex={-1}
            aria-selected={indice === posicao}
            aria-disabled={opcao.desabilitada || undefined}
            data-ativa={indiceAtivo === posicao ? 'sim' : 'nao'}
            data-valor={opcao.valor}
            onClick={() => {
              if (opcao.desabilitada) return;
              escolher(posicao);
              definirAtiva(null);
              gatilho.current?.focus();
            }}
          >
            {opcao.texto}
          </div>
        ))}
      </div>
    </div>
  );

  return rotulo ? (
    <EnvelopeCampo
      id={id}
      idRotulo={idRotulo}
      rotulo={rotulo}
      marcaRotulo={marcaRotulo}
      dica={dica}
      erro={erro}
      className={classeEnvelope}
    >
      {controle}
    </EnvelopeCampo>
  ) : (
    controle
  );
}
