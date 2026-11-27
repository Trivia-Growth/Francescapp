import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { EnvelopeCampo, type PropsCampo, descritores } from './campo.js';
import {
  DIAS,
  MESES,
  type Partes,
  diasNoMes,
  doIso,
  doVisivel,
  mascarar,
  paraIso,
  paraVisivel,
  primeiroDiaDaSemana,
} from './data-civil.js';
import { EVENTO_VALOR_NATIVO } from './valor-nativo.js';

type PropsCampoData = Omit<
  PropsCampo,
  'tipo' | 'rotulo' | 'onChange' | 'defaultValue' | 'value'
> & {
  rotulo?: string;
  value?: string;
  defaultValue?: string;
  aoAlterar?: (iso: string) => void;
};

const PASSOS: Record<string, readonly [dias: number, meses: number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [-7, 0],
  ArrowDown: [7, 0],
  PageUp: [0, -1],
  PageDown: [0, 1],
};

/** Data civil em ISO para formulários, com edição dd/mm/aaaa e calendário na mesma árvore. */
export function CampoData({
  id,
  rotulo,
  marcaRotulo,
  dica,
  erro,
  classeEnvelope,
  disabled,
  readOnly,
  required,
  ref,
  onFocus,
  value,
  defaultValue,
  aoAlterar,
  'aria-label': nome,
  'aria-labelledby': rotuladoPor,
  'aria-invalid': invalida = erro ? true : undefined,
  'aria-describedby': descritoPor = rotulo ? descritores(id, dica) : undefined,
  ...resto
}: PropsCampoData) {
  const nativo = useRef<HTMLInputElement>(null);
  const grupo = useRef<HTMLDivElement>(null);
  const editor = useRef<HTMLInputElement>(null);
  const gatilho = useRef<HTMLButtonElement>(null);
  const diaAtivo = useRef<HTMLButtonElement>(null);
  const [texto, definirTexto] = useState(() => paraVisivel(value ?? defaultValue ?? ''));
  const [foco, definirFoco] = useState<Partes | null>(null);
  const aberto = foco !== null && !disabled && !readOnly;
  const formatoId = `${id}-formato`;
  const calendarioId = `${id}-calendario`;
  const textoId = `${id}-texto`;
  const rotuloId = `${id}-rotulo`;
  const hoje = new Date();
  const hojeIso = paraIso({
    ano: hoje.getFullYear(),
    mes: hoje.getMonth() + 1,
    dia: hoje.getDate(),
  });

  const sincronizar = useCallback(() => {
    const iso = nativo.current?.value || null;
    definirTexto((atual) => (doVisivel(atual) === iso ? atual : paraVisivel(iso ?? '')));
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reflete valores aplicados pelo React ao nativo.
  useLayoutEffect(sincronizar, [sincronizar, value, defaultValue]);

  useEffect(() => {
    const campo = nativo.current;
    let aposReset: ReturnType<typeof setTimeout> | undefined;
    function limpar(evento: Event) {
      if (!campo || evento.target !== campo.form) return;
      clearTimeout(aposReset);
      aposReset = setTimeout(() => {
        definirTexto(paraVisivel(campo.value));
        definirFoco(null);
      }, 0);
    }
    campo?.addEventListener('input', sincronizar);
    campo?.addEventListener('change', sincronizar);
    campo?.addEventListener(EVENTO_VALOR_NATIVO, sincronizar);
    document.addEventListener('reset', limpar, true);
    return () => {
      clearTimeout(aposReset);
      campo?.removeEventListener('input', sincronizar);
      campo?.removeEventListener('change', sincronizar);
      campo?.removeEventListener(EVENTO_VALOR_NATIVO, sincronizar);
      document.removeEventListener('reset', limpar, true);
    };
  }, [sincronizar]);

  useEffect(() => {
    if (!aberto) return;
    function fecharFora(evento: PointerEvent) {
      if (evento.target instanceof Node && !grupo.current?.contains(evento.target)) {
        definirFoco(null);
      }
    }
    document.addEventListener('pointerdown', fecharFora, true);
    return () => document.removeEventListener('pointerdown', fecharFora, true);
  }, [aberto]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: o dia focável muda com o cursor do calendário.
  useLayoutEffect(() => {
    if (aberto) diaAtivo.current?.focus();
  }, [aberto, foco]);

  function definirData(iso: string, visivel: string) {
    const campo = nativo.current;
    if (!campo || campo.matches(':disabled') || readOnly) return;
    definirTexto(visivel);
    const anterior = campo.value;
    campo.value = iso;
    // O consumidor React recebe o ISO pela interface do campo. Eventos retornam ao
    // nativo para os formulários que ainda leem ou escutam o nó diretamente.
    if (campo.value !== anterior) aoAlterar?.(campo.value);
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    if (iso) campo.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fechar() {
    definirFoco(null);
    gatilho.current?.focus();
  }

  function mover(dias: number, meses: number) {
    if (!foco) return;
    const alvo = new Date(Date.UTC(foco.ano, foco.mes - 1 + meses, foco.dia + dias));
    definirFoco({
      ano: alvo.getUTCFullYear(),
      mes: alvo.getUTCMonth() + 1,
      dia: alvo.getUTCDate(),
    });
  }

  function aoTeclar(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key === 'Escape') {
      evento.preventDefault();
      evento.stopPropagation();
      fechar();
      return;
    }
    const passo = PASSOS[evento.key];
    if (!passo) return;
    evento.preventDefault();
    mover(...passo);
  }

  const controle = (
    <div ref={grupo} className="ui-data" data-aprimorada="">
      <input
        {...resto}
        ref={(campo) => {
          nativo.current = campo;
          if (typeof ref === 'function') return ref(campo);
          if (ref) ref.current = campo;
        }}
        id={id}
        type="date"
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        aria-describedby={descritoPor}
        aria-invalid={invalida}
        aria-hidden="true"
        tabIndex={-1}
        onFocus={(evento) => {
          onFocus?.(evento);
          editor.current?.focus();
        }}
        onChange={(evento) => aoAlterar?.(evento.currentTarget.value)}
      />
      <div className="ui-data__linha">
        <input
          ref={editor}
          id={textoId}
          type="text"
          className="ui-campo__controle ui-data__texto"
          inputMode="numeric"
          autoComplete="off"
          placeholder="dd/mm/aaaa"
          maxLength={10}
          disabled={disabled}
          readOnly={readOnly}
          aria-required={required || undefined}
          aria-label={nome}
          aria-labelledby={rotuladoPor ?? (rotulo ? rotuloId : undefined)}
          aria-describedby={descritoPor ? `${descritoPor} ${formatoId}` : formatoId}
          aria-invalid={invalida || (texto.length === 10 && doVisivel(texto) === null) || undefined}
          value={texto}
          onInput={(evento) => evento.stopPropagation()}
          onChange={(evento) => {
            evento.stopPropagation();
            const entrada = mascarar(evento.currentTarget.value);
            definirData(doVisivel(entrada) ?? '', entrada);
          }}
        />
        <button
          ref={gatilho}
          type="button"
          className="ui-data__abrir"
          data-ui="calendario"
          disabled={disabled || readOnly}
          aria-expanded={aberto}
          aria-haspopup="dialog"
          aria-label="Escolher no calendário"
          aria-controls={calendarioId}
          onClick={() => {
            if (aberto) fechar();
            else definirFoco(doIso(nativo.current?.value || hojeIso));
          }}
        >
          ▦
        </button>
      </div>
      <p id={formatoId} className="sr-only">
        Formato dia, mês e ano, com quatro dígitos no ano. Exemplo: 31/01/2000.
      </p>
      <div
        id={calendarioId}
        className="ui-data__calendario"
        // biome-ignore lint/a11y/useSemanticElements: calendário ancorado no campo, com o foco no dia ativo.
        role="dialog"
        aria-label="Calendário"
        hidden={!aberto}
        onKeyDown={aoTeclar}
      >
        {foco ? (
          <>
            <div className="ui-data__navegacao">
              <button
                type="button"
                className="ui-data__passo"
                aria-label="Mês anterior"
                onClick={() => mover(0, -1)}
              >
                ‹
              </button>
              <p className="ui-data__mes" aria-live="polite">
                {MESES[foco.mes - 1]} de {foco.ano}
              </p>
              <button
                type="button"
                className="ui-data__passo"
                aria-label="Próximo mês"
                onClick={() => mover(0, 1)}
              >
                ›
              </button>
            </div>
            <div className="ui-data__grade">
              {DIAS.map((dia) => (
                <span key={dia} className="ui-data__cabecalho-dia" aria-hidden="true">
                  {dia}
                </span>
              ))}
              {DIAS.slice(0, primeiroDiaDaSemana(foco.ano, foco.mes)).map((dia) => (
                <span key={`espaco-${dia}`} aria-hidden="true" />
              ))}
              {Array.from({ length: diasNoMes(foco.ano, foco.mes) }, (_, posicao) => {
                const dia = posicao + 1;
                const iso = paraIso({ ...foco, dia });
                return (
                  <button
                    key={iso}
                    type="button"
                    ref={dia === foco.dia ? diaAtivo : undefined}
                    className="ui-data__dia"
                    data-dia={dia}
                    data-hoje={iso === hojeIso ? 'sim' : undefined}
                    aria-label={`${dia} de ${MESES[foco.mes - 1]} de ${foco.ano}`}
                    aria-pressed={doVisivel(texto) === iso}
                    tabIndex={dia === foco.dia ? 0 : -1}
                    onClick={() => {
                      definirData(iso, paraVisivel(iso));
                      fechar();
                    }}
                  >
                    {dia}
                  </button>
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );

  return rotulo ? (
    <EnvelopeCampo
      id={id}
      idControle={textoId}
      idRotulo={rotuloId}
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
