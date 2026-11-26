import { useLayoutEffect, useRef, type FormHTMLAttributes, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { juntar } from '../componentes/ui/juntar.js';

/** Formulário cujo `submit` é ouvido no próprio elemento, e não pela delegação do React.
 *
 *  Duas razões concretas, as duas medidas em 25/11/2026 nesta migração:
 *
 *  1. O React escuta na raiz da ilha e só alcança o evento pela fase de borbulha. As
 *     provas de tela já existentes disparam `new Event('submit', { cancelable: true })`
 *     — sem `bubbles` —, que nunca chega à raiz. O ouvinte nativo recebe os dois casos,
 *     o sintético e o `requestSubmit()` real, sem pedir que a prova mude.
 *  2. O envio é um ponto em que a tela precisa ficar inerte NA HORA: campo de credencial
 *     limpo, botão travado, segunda submissão recusada. Fora de evento do React a
 *     atualização seria agendada, e entre o `dispatchEvent` e o repintar caberia um
 *     segundo envio. `flushSync` devolve a garantia síncrona que a versão imperativa
 *     tinha de graça.
 *
 *  `noValidate` não tem padrão aqui de propósito: quem decide é a tela, porque a
 *  validação nativa é parte do comportamento de cada formulário migrado. */
export function Formulario({
  aoEnviar,
  children,
  ...resto
}: Omit<FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> & {
  /** Recebe o próprio formulário: os controles são NÃO controlados e o DOM continua dono
   *  do valor, como na versão imperativa. Use `valorDe` e `marcado` para lê-los. */
  aoEnviar: (formulario: HTMLFormElement) => void;
  children: ReactNode;
}) {
  const referencia = useRef<HTMLFormElement>(null);
  const guardado = useRef(aoEnviar);
  guardado.current = aoEnviar;
  /* `useLayoutEffect` e não `useEffect`, medido em 26/11/2026: efeito passivo é agendado
     numa tarefa SEPARADA da confirmação. Entre o formulário aparecer no DOM e o ouvinte
     ser instalado cabe uma tarefa inteira, e um envio nessa janela não é só perdido — o
     `submit` segue sem `preventDefault` e vira navegação de verdade. Foi o que o portão do
     CI pegou e esta máquina não: lá a janela abriu, aqui não. O efeito de disposição corre
     dentro da confirmação, então quem vê o formulário já vê o ouvinte. */
  useLayoutEffect(() => {
    const formulario = referencia.current;
    if (!formulario) return;
    const ouvir = (evento: Event) => {
      evento.preventDefault();
      flushSync(() => {
        guardado.current(formulario);
      });
    };
    formulario.addEventListener('submit', ouvir);
    return () => formulario.removeEventListener('submit', ouvir);
  }, []);
  return (
    /* `web/styles.css` dá borda, raio, fundo e preenchimento a TODO `form` dentro de
       `.administracao-conteudo` — regra escrita quando cada tela montava o próprio DOM.
       A tela migrada já envolve o conteúdo numa `Superficie`, então a regra legada vira
       uma segunda moldura: caixa dentro de caixa, medida em seis telas e em até 45
       controles numa delas. As utilitárias vencem a camada `legado`, e é assim que a tela
       migrada se desfaz da moldura herdada sem mexer na folha de quem ainda não migrou. */
    <form
      ref={referencia}
      {...resto}
      className={juntar('rounded-none border-0 bg-transparent p-0', resto.className)}
    >
      {children}
    </form>
  );
}

type ControleDeFormulario = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function controle(formulario: HTMLFormElement, nome: string): ControleDeFormulario | null {
  const achado = formulario.elements.namedItem(nome);
  return achado instanceof HTMLInputElement ||
    achado instanceof HTMLSelectElement ||
    achado instanceof HTMLTextAreaElement
    ? achado
    : null;
}

/** Texto de um controle do formulário, pelo `name`. */
export function valorDe(formulario: HTMLFormElement, nome: string): string {
  return controle(formulario, nome)?.value ?? '';
}

/** Estado de uma caixa de marcação do formulário, pelo `name`. */
export function marcado(formulario: HTMLFormElement, nome: string): boolean {
  const achado = controle(formulario, nome);
  return achado instanceof HTMLInputElement && achado.checked;
}
