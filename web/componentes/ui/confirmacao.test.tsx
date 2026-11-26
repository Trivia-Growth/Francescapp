// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { useConfirmacao } from './confirmacao';

/*  Uma confirmação que não responde é pior do que nenhuma: a tela fica esperando para
 *  sempre, e quem olha vê um botão que "não faz nada". Por isso o que estes testes guardam
 *  é a RESOLUÇÃO por todos os caminhos — inclusive `Esc` — e a ordem dos botões, que é
 *  invertida de propósito e já foi "consertada" por engano antes.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Tela({ aoResponder }: { aoResponder: (resposta: boolean) => void }) {
  const { confirmarDescarte, dialogo } = useConfirmacao();
  return (
    <>
      <button
        type="button"
        onClick={() => {
          void confirmarDescarte('a anamnese').then(aoResponder);
        }}
      >
        Sair da anamnese
      </button>
      {dialogo}
    </>
  );
}

const abrir = async (pessoa: ReturnType<typeof userEvent.setup>) =>
  pessoa.click(screen.getByRole('button', { name: 'Sair da anamnese' }));

it('diz a consequência, não pergunta "Continuar?", e começa com o foco no botão seguro', async () => {
  const pessoa = userEvent.setup();
  render(<Tela aoResponder={() => {}} />);
  await abrir(pessoa);

  const dialogo = screen.getByRole('dialog');
  expect(dialogo.textContent).toContain('Descartar a anamnese?');
  expect(dialogo.textContent).toContain('não há como recuperar');
  expect(dialogo.textContent).not.toContain('Continuar?');

  // Confirmar por engano é o erro caro: o foco inicial é o botão seguro.
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Continuar editando' }));

  // Decisão não tem botão de fechar: a resposta é uma das ações, nunca um "x" ambíguo.
  expect(screen.queryByRole('button', { name: 'Fechar' })).toBeNull();
});

it('a ordem no DOM é seguir-adiante antes do seguro, com os pesos invertidos', async () => {
  const pessoa = userEvent.setup();
  render(<Tela aoResponder={() => {}} />);
  await abrir(pessoa);

  const botoes = [...screen.getByRole('dialog').querySelectorAll('[data-acao]')];
  // É a ordem de tabulação que as provas guardam; no celular o rodapé inverte só o visual.
  expect(botoes.map((botao) => (botao as HTMLElement).dataset.acao)).toEqual([
    'confirmar',
    'cancelar',
  ]);
  expect((botoes[0] as HTMLElement).dataset.peso).toBe('secundario');
  expect((botoes[1] as HTMLElement).dataset.peso).toBe('principal');
});

it('confirmar resolve verdadeiro; cancelar resolve falso', async () => {
  const pessoa = userEvent.setup();
  const respostas: boolean[] = [];
  render(<Tela aoResponder={(resposta) => respostas.push(resposta)} />);

  await abrir(pessoa);
  await pessoa.click(screen.getByRole('button', { name: 'Descartar' }));
  await vi.waitFor(() => expect(respostas).toEqual([true]));
  expect(screen.queryByRole('dialog')).toBeNull();

  await abrir(pessoa);
  await pessoa.click(screen.getByRole('button', { name: 'Continuar editando' }));
  await vi.waitFor(() => expect(respostas).toEqual([true, false]));
});

it('Esc resolve falso: a promessa nunca fica pendente', async () => {
  // Se o React resolvesse no `onClick` do cancelar, este caminho deixaria a tela esperando
  // uma resposta que nunca chega — e o defeito pareceria "estado perdido".
  const pessoa = userEvent.setup();
  const respostas: boolean[] = [];
  render(<Tela aoResponder={(resposta) => respostas.push(resposta)} />);

  await abrir(pessoa);
  await pessoa.keyboard('{Escape}');
  await vi.waitFor(() => expect(respostas).toEqual([false]));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('no celular a decisão também é folha, com as ações largas e em ordem invertida só no visual', async () => {
  vi.stubGlobal(
    'matchMedia',
    (texto: string) =>
      ({
        matches: texto === '(max-width: 767px)',
        media: texto,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
  const pessoa = userEvent.setup();
  render(<Tela aoResponder={() => {}} />);
  await abrir(pessoa);

  const rodape = document.querySelector<HTMLElement>('[data-faixa="rodape"]');
  expect(rodape?.className).toContain('flex-col-reverse');
  expect(
    [...(rodape?.querySelectorAll('[data-acao]') ?? [])].map(
      (b) => (b as HTMLElement).dataset.acao,
    ),
  ).toEqual(['confirmar', 'cancelar']);
  // Decisão não tem corpo; sem isso a faixa cinza dos dois sinais de rolagem voltaria.
  expect(document.querySelector('[data-faixa="corpo"]')).toBeNull();
});
