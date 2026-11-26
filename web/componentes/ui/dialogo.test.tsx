// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { Dialogo } from './dialogo';

/*  Estes testes guardam duas coisas diferentes.
 *
 *  A primeira é o contrato de acessibilidade que `web/ui/dialogo.test.ts` já travava: foco
 *  preso, foco devolvido a quem abriu, `Esc` fechando e a ação que recusa mantendo a tela
 *  aberta. Perder qualquer um deles é regressão silenciosa — ninguém vê, e quem navega por
 *  teclado fica tabulando num conteúdo que não pode tocar.
 *
 *  A segunda é o pedido literal do solicitante em 25/11/2026: "atenção pros modal
 *  centralizarem na tela e ficarem com botões visíveis caso tenha scroll que funcione".
 *  Isso não é layout bonito, é o defeito que ele viu: com formulário longo, o rodapé saía
 *  da tela. O jsdom não calcula layout, então o que se prova aqui é a ESTRUTURA que produz
 *  o resultado — rodapé fora do elemento que rola, teto de altura em `dvh`, corpo que
 *  encolhe — e não uma captura de tela. É o que um teste pode honestamente afirmar.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function recorte(consulta: string) {
  // jsdom não tem `matchMedia`. Declarar o recorte é o que torna a prova de celular real
  // em vez de uma afirmação sobre uma consulta de mídia que ninguém avalia.
  vi.stubGlobal(
    'matchMedia',
    (texto: string) =>
      ({
        matches: texto === consulta,
        media: texto,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

const conteudo = () =>
  document.querySelector<HTMLElement>('[data-faixa="cabecalho"]')?.parentElement;
// Quarenta campos: formulário propositalmente mais alto que qualquer janela.
const CAMPOS = Array.from({ length: 40 }, (_, indice) => `Campo ${indice + 1}`);
const corpo = () => document.querySelector<HTMLElement>('[data-faixa="corpo"]');
const rodape = () => document.querySelector<HTMLElement>('[data-faixa="rodape"]');

it('abre nomeado, descrito, e prende o foco dentro de si', async () => {
  const pessoa = userEvent.setup();
  const fechou = vi.fn();
  render(
    <>
      <button type="button">Novo paciente</button>
      <Dialogo
        aberto
        aoFechar={fechou}
        titulo="Novo paciente"
        descricao="Todos os campos são obrigatórios."
        acoes={[{ rotulo: 'Cadastrar paciente', peso: 'principal', marca: 'enviar' }]}
      >
        <input aria-label="Nome" />
      </Dialogo>
    </>,
  );

  const dialogo = screen.getByRole('dialog');
  const nomeado = dialogo.getAttribute('aria-labelledby') ?? '';
  expect(document.getElementById(nomeado)?.textContent).toBe('Novo paciente');
  const descrito = dialogo.getAttribute('aria-describedby') ?? '';
  expect(document.getElementById(descrito)?.textContent).toBe('Todos os campos são obrigatórios.');

  // Campo, ação e o fechar do cabeçalho: nada mais entra na volta do Tab.
  expect(within(dialogo).getAllByRole('button')).toHaveLength(2);
  for (let volta = 0; volta < 5; volta += 1) {
    await pessoa.tab();
    expect(dialogo.contains(document.activeElement)).toBe(true);
  }

  await pessoa.click(screen.getByRole('button', { name: 'Fechar' }));
  expect(fechou).toHaveBeenCalledTimes(1);
});

it('Esc fecha e o foco volta a quem abriu, mesmo sem gatilho Radix', async () => {
  const pessoa = userEvent.setup();

  function Tela() {
    const [aberto, definirAberto] = useState(false);
    return (
      <>
        <button type="button" onClick={() => definirAberto(true)}>
          Novo paciente
        </button>
        <Dialogo aberto={aberto} aoFechar={() => definirAberto(false)} titulo="Novo paciente">
          <input aria-label="Nome" />
        </Dialogo>
      </>
    );
  }
  render(<Tela />);

  const origem = screen.getByRole('button', { name: 'Novo paciente' });
  await pessoa.click(origem);
  expect(screen.getByRole('dialog')).toBeTruthy();

  await pessoa.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  // Sem isto o teclado recomeça do topo da página, longe de onde a pessoa estava.
  expect(document.activeElement).toBe(origem);
});

it('a ação que recusa mantém o diálogo aberto; a segunda tentativa fecha', async () => {
  const pessoa = userEvent.setup();
  let tentativas = 0;
  const fechou = vi.fn();
  render(
    <Dialogo
      aberto
      aoFechar={fechou}
      titulo="Cadastrar paciente?"
      acoes={[
        {
          rotulo: 'Cadastrar',
          marca: 'enviar',
          // Validação recusou: a pessoa precisa ver o erro no campo, não a tela fechando.
          aoAtivar: () => {
            tentativas += 1;
            return tentativas > 1 ? undefined : false;
          },
        },
      ]}
    />,
  );

  await pessoa.click(screen.getByRole('button', { name: 'Cadastrar' }));
  expect(fechou).not.toHaveBeenCalled();
  await pessoa.click(screen.getByRole('button', { name: 'Cadastrar' }));
  expect(fechou).toHaveBeenCalledTimes(1);
});

it('a medida chega ao DOM, decisão não ganha fechar e Esc fecha', async () => {
  const pessoa = userEvent.setup();
  const fechou = vi.fn();
  const { rerender } = render(<Dialogo aberto aoFechar={fechou} titulo="Formulário" />);
  expect(conteudo()?.dataset.medida).toBe('formulario');

  rerender(<Dialogo aberto aoFechar={fechou} titulo="Conteúdo" medida="conteudo" />);
  expect(conteudo()?.dataset.medida).toBe('conteudo');

  rerender(<Dialogo aberto aoFechar={fechou} titulo="Descartar?" medida="decisao" />);
  expect(screen.queryByRole('button', { name: 'Fechar' })).toBeNull();
  await pessoa.keyboard('{Escape}');
  expect(fechou).toHaveBeenCalled();
});

it('clique fora não fecha: formulário preenchido não some por clique de passagem', () => {
  const fechou = vi.fn();
  render(
    <Dialogo aberto aoFechar={fechou} titulo="Novo paciente">
      <input aria-label="Nome" />
    </Dialogo>,
  );
  // É o `pointerdown` fora que a camada de dispensa do Radix escuta.
  fireEvent.pointerDown(document.body);
  fireEvent.mouseDown(document.body);
  fireEvent.focusOut(document.body);
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(fechou).not.toHaveBeenCalled();
});

it('diálogo mais alto que a janela: o corpo rola e as ações seguem alcançáveis', async () => {
  // O pedido de 25/11/2026. Conteúdo propositalmente maior que qualquer janela.
  const pessoa = userEvent.setup();
  render(
    <Dialogo
      aberto
      aoFechar={() => {}}
      titulo="Cadastrar paciente"
      acoes={[
        { rotulo: 'Voltar', marca: 'cancelar' },
        { rotulo: 'Cadastrar paciente', peso: 'principal', marca: 'enviar' },
      ]}
    >
      {CAMPOS.map((rotulo) => (
        <input key={rotulo} aria-label={rotulo} />
      ))}
    </Dialogo>,
  );

  const caixa = conteudo();
  const rolante = corpo();
  const acoes = rodape();
  if (!caixa || !rolante || !acoes) throw new Error('faixas do diálogo não montadas');

  // 1. Teto de altura, em `dvh` e nunca em `vh` (riscos 1 e 2). Sem o teto, o diálogo
  //    cresce com o formulário e o rodapé sai da tela — o defeito reclamado.
  expect(caixa.className).toContain('max-h-[min(640px,calc(100dvh-var(--espaco-6)*2))]');
  expect(caixa.className).not.toMatch(/\d+vh/);

  // 2. Centralização escrita à mão, porque o `div` em portal não a recebe do navegador.
  const fundo = caixa.parentElement;
  expect(fundo?.className).toContain('place-items-center');
  expect(fundo?.className).toContain('fixed');

  // 3. Só o corpo rola, e ele encolhe em vez de empurrar o rodapé: `min-h-0` é a peça.
  expect(rolante.className).toContain('overflow-y-auto');
  expect(rolante.className).toContain('min-h-0');
  expect(rolante.className).toContain('flex-1');
  expect(caixa.className).toContain('flex-col');

  // 4. O rodapé NÃO está dentro do que rola: é isto que faz a ação continuar alcançável
  //    sem rolar até o fim de quarenta campos.
  expect(rolante.contains(acoes)).toBe(false);
  expect(acoes.className).toContain('flex-none');
  expect(rolante.querySelectorAll('input')).toHaveLength(40);

  // 5. E alcançável também pelo teclado, sem passar pelos quarenta campos: o `Tab` a
  //    partir do último campo chega às ações.
  const ultimo = screen.getByLabelText('Campo 40');
  ultimo.focus();
  await pessoa.tab();
  expect(screen.getByRole('button', { name: 'Voltar' })).toBe(document.activeElement);
});

it('no recorte de celular vira folha colada embaixo, com as ações sob o polegar', () => {
  recorte('(max-width: 767px)');
  render(
    <Dialogo
      aberto
      aoFechar={() => {}}
      titulo="Cadastrar paciente"
      acoes={[
        { rotulo: 'Voltar', marca: 'cancelar' },
        { rotulo: 'Cadastrar paciente', peso: 'principal', marca: 'enviar' },
      ]}
    >
      {CAMPOS.map((rotulo) => (
        <input key={rotulo} aria-label={rotulo} />
      ))}
    </Dialogo>,
  );

  const caixa = conteudo();
  const acoes = rodape();
  if (!caixa || !acoes) throw new Error('faixas do diálogo não montadas');

  expect(caixa.dataset.forma).toBe('folha');
  // Largura inteira, colada na base, raio só em cima: nunca um diálogo centrado espremido.
  expect(caixa.className).toContain('w-full');
  expect(caixa.className).toContain('mt-auto');
  expect(caixa.className).toContain('rounded-t-painel');
  // Altura em `dvh` para o teclado virtual não empurrar a ação para fora (risco 2).
  expect(caixa.className).toContain('max-h-[calc(100dvh-var(--espaco-6))]');
  expect(caixa.className).not.toMatch(/\d+vh[^a-z]/);

  // O corpo continua sendo o único que rola, com o rodapé fixo fora dele.
  expect(corpo()?.className).toContain('overflow-y-auto');
  expect(corpo()?.contains(acoes)).toBe(false);

  // A ordem no DOM não muda; o visual é que inverte, para a ação segura cair sob o
  // polegar. E a área segura entra no rodapé, que é onde ficam as ações.
  expect(acoes.className).toContain('flex-col-reverse');
  expect(acoes.className).toContain('pb-[calc(var(--espaco-4)+env(safe-area-inset-bottom,0px))]');
  const ordem = [...acoes.querySelectorAll('button')].map((botao) => botao.dataset.acao);
  expect(ordem).toEqual(['cancelar', 'enviar']);
  for (const botao of acoes.querySelectorAll('button')) expect(botao.className).toContain('w-full');
});
