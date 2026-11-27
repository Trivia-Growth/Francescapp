// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { Aba, Abas, CLASSES_ABA, FaixaAbas, PainelAba } from './abas';

/*  Aba é navegação, não decoração: errar aqui esconde conteúdo inteiro. O que está travado
 *  é o teclado (seta anda, Tab sai da faixa), o gancho `aria-selected` que as provas de
 *  tela já procuram, e a regra de que a seleção nunca depende só de cor. */

afterEach(cleanup);

function Ficha() {
  return (
    <Abas defaultValue="anamnese">
      <FaixaAbas aria-label="Seções da ficha">
        <Aba value="anamnese">Anamnese</Aba>
        <Aba value="saude">Saúde</Aba>
        <Aba value="tarefas" estado="3">
          Tarefas
        </Aba>
      </FaixaAbas>
      <PainelAba value="anamnese">História da pessoa</PainelAba>
      <PainelAba value="saude">Medicações</PainelAba>
      <PainelAba value="tarefas">Pendências</PainelAba>
    </Abas>
  );
}

it('mostra um painel por vez e anuncia qual aba está selecionada', async () => {
  const pessoa = userEvent.setup();
  render(<Ficha />);

  const anamnese = screen.getByRole('tab', { name: 'Anamnese' });
  expect(anamnese.getAttribute('aria-selected')).toBe('true');
  expect(screen.getByText('História da pessoa')).toBeTruthy();
  expect(screen.queryByText('Medicações')).toBeNull();

  await pessoa.click(screen.getByRole('tab', { name: 'Saúde' }));
  expect(screen.getByRole('tab', { name: 'Saúde' }).getAttribute('aria-selected')).toBe('true');
  expect(anamnese.getAttribute('aria-selected')).toBe('false');
  expect(screen.getByText('Medicações')).toBeTruthy();
});

it('o teclado anda pela faixa com as setas e sai dela com Tab', async () => {
  const pessoa = userEvent.setup();
  render(<Ficha />);

  screen.getByRole('tab', { name: 'Anamnese' }).focus();
  await pessoa.keyboard('{ArrowRight}');
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Saúde' }));

  // A faixa inteira é UMA parada de tabulação: o Tab vai para o painel, não para a aba
  // seguinte. É o que impede dez abas de virarem dez paradas.
  await pessoa.tab();
  expect(screen.getByRole('tab', { name: 'Saúde' }).contains(document.activeElement)).toBe(false);
});

it('a faixa rola com sinal de continuidade pintado, não animado', () => {
  render(<Ficha />);
  const faixa = screen.getByRole('tablist');
  expect(faixa.className).toContain('overflow-x-auto');
  // Quatro camadas, duas `local` sobre duas `scroll` — mesma pintura do corpo do diálogo,
  // deitada. Sem animação, logo sobrevive a `prefers-reduced-motion`.
  expect(faixa.className.match(/linear-gradient/g)).toHaveLength(4);
  expect(faixa.className.match(/_local/g)).toHaveLength(2);
  expect(faixa.className.match(/_scroll/g)).toHaveLength(2);
  expect(faixa.className).not.toContain('animate-');
});

it('a seleção nunca depende só de cor, e o oliva nunca é cor de texto', () => {
  // Traço de 3px no oliva MAIS peso 700. A pílula preenchida deixava o rótulo ilegível.
  expect(CLASSES_ABA).toContain('border-b-[3px]');
  expect(CLASSES_ABA).toContain('aria-selected:border-b-marca');
  expect(CLASSES_ABA).toContain('aria-selected:font-bold');
  // Oliva como TRAÇO. Como cor de texto dá 3,35:1 sobre branco e não se lê.
  expect(CLASSES_ABA).not.toContain('text-marca');
  // E o rótulo selecionado usa o oliva escuro de produto.
  expect(CLASSES_ABA).toContain('aria-selected:text-primaria');
  // Nenhuma cor literal: toda cor sai de token.
  expect(CLASSES_ABA).not.toMatch(/#[0-9a-fA-F]{3}|rgba?\(/);
});

it('a marca de estado da aba é discreta, não alarme', () => {
  render(<Ficha />);
  const estado = screen.getByText('3');
  expect(estado.className).toContain('bg-superficie-2');
  expect(estado.className).toContain('text-1');
  expect(estado.className).toContain('rounded-[20px]');
  expect(estado.className).not.toContain('bg-erro');
});
