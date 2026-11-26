// @vitest-environment jsdom
import { createElement, useEffect, useState } from 'react';
import { act } from 'react';
import { expect, it } from 'vitest';
import { ilha, nodeDe } from './ilha.js';

/** Componente que escreve o que a consulta devolver — o padrão de toda tela do produto. */
function TelaQueConsulta({ consulta }: { consulta: Promise<string> }) {
  const [texto, definir] = useState('Carregando…');
  useEffect(() => {
    let ativo = true;
    void consulta.then((valor) => {
      if (ativo) definir(valor);
    });
    return () => {
      ativo = false;
    };
  }, [consulta]);
  return createElement('p', null, texto);
}

it('deixa o conteúdo pronto ANTES de devolver, como o contrato imperativo exige', () => {
  /* Defeito encontrado em uso real em 25/11/2026: `root.render()` é assíncrono, a ponte
     devolvia antes de o conteúdo existir, e quem lê a raiz na linha seguinte — o que
     vários chamadores de `main.ts` fazem — encontrava string vazia. Sem `act()` de
     propósito: `act()` descarrega a fila e esconderia exatamente o que se mede aqui. */
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const desmontar = ilha(raiz, createElement('p', null, 'Conteúdo'));
  expect(raiz.textContent).toBe('Conteúdo');
  desmontar();
});

it('tolera montar duas vezes na mesma raiz, que `main.ts` faz', () => {
  /* `montarFiltrosCarteira` é chamada uma vez sem e outra com a equipe, na mesma raiz.
     `createRoot` duas vezes no mesmo nó é erro de React; a ponte desmonta a anterior. */
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const erros: unknown[] = [];
  const anterior = console.error;
  console.error = (...argumentos: unknown[]) => erros.push(argumentos);

  const primeira = ilha(raiz, createElement('p', null, 'Primeira'));
  const segunda = ilha(raiz, createElement('p', null, 'Segunda'));
  console.error = anterior;

  expect(raiz.textContent).toBe('Segunda');
  expect(erros).toEqual([]);
  expect(() => primeira()).not.toThrow();
  // A desmontagem obsoleta não pode levar junto a montagem que tomou o lugar.
  expect(raiz.textContent).toBe('Segunda');
  segunda();
});

it('entrega um nó solto para quem compõe DOM à mão, sem deixar raiz viva', () => {
  const no = nodeDe(createElement('span', { className: 'selo' }, 'Em pausa'));
  expect(no.tagName).toBe('SPAN');
  expect(no.textContent).toBe('Em pausa');
  expect(no.isConnected).toBe(false);
});

it('monta e desmonta dentro do contrato que `main.ts` já usa', async () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  let desmontar!: () => void;
  await act(async () => {
    desmontar = ilha(raiz, createElement('p', null, 'Conteúdo'));
  });
  expect(raiz.textContent).toBe('Conteúdo');
  await act(async () => desmontar());
  expect(raiz.textContent).toBe('');
});

it('descarta resposta que chega depois da desmontagem, sem escrever em nó morto', async () => {
  /* O motivo de a ponte existir. Hoje este caso depende de um `if (!ativa) return`
     escrito à mão em cada módulo; aqui o ciclo de vida resolve. O teste reprova se
     `unmount` sair de `ilha`. */
  const raiz = document.createElement('div');
  document.body.append(raiz);
  let responder!: (valor: string) => void;
  const consulta = new Promise<string>((resolve) => {
    responder = resolve;
  });

  let desmontar!: () => void;
  await act(async () => {
    desmontar = ilha(raiz, createElement(TelaQueConsulta, { consulta }));
  });
  expect(raiz.textContent).toBe('Carregando…');

  await act(async () => desmontar());
  expect(raiz.textContent).toBe('');

  const erros: unknown[] = [];
  const anterior = console.error;
  console.error = (...argumentos: unknown[]) => erros.push(argumentos);
  await act(async () => {
    responder('Conteúdo que chegou tarde');
    await consulta;
  });
  console.error = anterior;

  expect(raiz.textContent).toBe('');
  expect(erros).toEqual([]);
});

it('tolera desmontagem repetida, que `main.ts` provoca ao perder o acesso', async () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  let desmontar!: () => void;
  await act(async () => {
    desmontar = ilha(raiz, createElement('p', null, 'Conteúdo'));
  });
  await act(async () => desmontar());
  expect(() => desmontar()).not.toThrow();
});
