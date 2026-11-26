// @vitest-environment jsdom
import { useEffect, useState } from 'react';
import { expect, it, vi } from 'vitest';
import { ilha } from '../ponte/ilha.js';
import { Formulario } from './formulario.js';

/* Regressão de 26/11/2026. O portão do CI reprovou
 * `modelo-ficha-plantao-administracao.test.ts` com `gravar` em zero chamadas, e esta
 * máquina passava. A causa não era o teste: `Formulario` instalava o ouvinte de `submit`
 * num efeito PASSIVO, agendado numa tarefa separada da confirmação. Entre o formulário
 * aparecer no DOM e o ouvinte existir cabia uma tarefa inteira.
 *
 * O prejuízo não é só o envio perdido. Sem ouvinte não há `preventDefault`, e o `submit`
 * vira navegação de verdade — no navegador, a página recarrega e o que a pessoa digitou
 * se perde.
 *
 * A espera por tarefa (`setTimeout`) é o que separa as duas fases; com `await
 * Promise.resolve()` a própria confirmação ainda não aconteceu, e o teste não veria nada. */

function TelaTardia({ aoEnviar }: { aoEnviar: (formulario: HTMLFormElement) => void }) {
  const [pronto, definirPronto] = useState(false);
  useEffect(() => {
    void Promise.resolve().then(() => definirPronto(true));
  }, []);
  if (!pronto) return <p>carregando</p>;
  return (
    <Formulario aoEnviar={aoEnviar}>
      <button type="submit">Salvar</button>
    </Formulario>
  );
}

it('o ouvinte de envio existe na mesma tarefa em que o formulário aparece', async () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const aoEnviar = vi.fn();
  const desmontar = ilha(raiz, <TelaTardia aoEnviar={aoEnviar} />);
  try {
    for (let volta = 0; volta < 200 && !raiz.querySelector('form'); volta += 1) {
      await new Promise((seguir) => setTimeout(seguir, 0));
    }
    const formulario = raiz.querySelector('form');
    expect(formulario).not.toBeNull();
    formulario?.requestSubmit();
    expect(aoEnviar).toHaveBeenCalledOnce();
  } finally {
    desmontar();
    raiz.remove();
  }
});

it('o envio é impedido: o formulário nunca navega', () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const desmontar = ilha(
    raiz,
    <Formulario aoEnviar={() => {}}>
      <button type="submit">Salvar</button>
    </Formulario>,
  );
  try {
    const formulario = raiz.querySelector('form');
    const evento = new Event('submit', { bubbles: true, cancelable: true });
    formulario?.dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(true);
  } finally {
    desmontar();
    raiz.remove();
  }
});
