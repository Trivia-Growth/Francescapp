// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  CONSULTA_FOLHA,
  classesSobreposicao,
  Folha,
  type FormaSobreposicao,
  type MedidaSobreposicao,
  useFormaSobreposicao,
} from './folha';

/*  A grade de três faixas é a peça que o solicitante vê e que uma reescrita ingênua perde.
 *  Por isso o que está travado aqui é vocabulário, não aparência: o teto de altura em
 *  `dvh`, o corpo que encolhe, o rodapé que não rola junto e a folha colada embaixo.
 *  Também a regra de cor — nenhum literal — que é verificável lendo a própria classe.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FORMAS: FormaSobreposicao[] = ['dialogo', 'folha'];
const MEDIDAS: MedidaSobreposicao[] = ['formulario', 'conteudo', 'decisao'];

it('nenhuma classe carrega cor literal nem altura em `vh`', () => {
  for (const forma of FORMAS) {
    for (const medida of MEDIDAS) {
      const tudo = Object.values(classesSobreposicao(forma, medida)).join(' ');
      // Toda cor sai de token: `#hex` e `rgb()` aqui seriam paleta perdida na tradução.
      expect(tudo).not.toMatch(/#[0-9a-fA-F]{3}/);
      expect(tudo).not.toMatch(/rgba?\(/);
      // `dvh` e nunca `vh`: com o teclado virtual aberto a ação continua visível.
      expect(tudo).not.toMatch(/\d+vh/);
      expect(tudo).toContain('dvh');
    }
  }
});

it('a grade é sempre três faixas: cabeçalho e rodapé fixos, só o corpo rolando', () => {
  for (const forma of FORMAS) {
    const classes = classesSobreposicao(forma, 'formulario');
    expect(classes.conteudo).toContain('flex-col');
    expect(classes.cabecalho).toContain('flex-none');
    expect(classes.rodape).toContain('flex-none');
    // `min-h-0` é a peça que faz o corpo encolher em vez de empurrar o rodapé para fora.
    expect(classes.corpo).toContain('min-h-0');
    expect(classes.corpo).toContain('flex-1');
    expect(classes.corpo).toContain('overflow-y-auto');
  }
});

it('o sinal de rolagem é pintura, não movimento', () => {
  const { corpo } = classesSobreposicao('dialogo', 'formulario');
  // Quatro camadas, duas `local` sobre duas `scroll`. Sem `animation` e sem `transition`,
  // logo imune a `prefers-reduced-motion` — era esse o motivo de não ser sombra animada.
  expect(corpo.match(/linear-gradient/g)).toHaveLength(4);
  expect(corpo.match(/_local/g)).toHaveLength(2);
  expect(corpo.match(/_scroll/g)).toHaveLength(2);
  expect(corpo).not.toContain('animate-');
  expect(corpo).not.toContain('transition');
});

it('diálogo centraliza e tem teto; folha cola embaixo e respeita a área segura', () => {
  const dialogo = classesSobreposicao('dialogo', 'formulario');
  // O `margin: auto` do `dialog:modal` nativo não vale para um `div` em portal.
  expect(dialogo.fundo).toContain('fixed');
  expect(dialogo.fundo).toContain('place-items-center');
  expect(dialogo.conteudo).toContain('max-h-[min(640px,calc(100dvh-var(--espaco-6)*2))]');
  expect(dialogo.conteudo).toContain('rounded-painel');
  expect(dialogo.acao).toBe('');

  const folha = classesSobreposicao('folha', 'formulario');
  expect(folha.fundo).toContain('items-end');
  expect(folha.conteudo).toContain('w-full');
  expect(folha.conteudo).toContain('mt-auto');
  expect(folha.conteudo).toContain('rounded-t-painel');
  expect(folha.conteudo).toContain('max-h-[calc(100dvh-var(--espaco-6))]');
  // A área segura entra no rodapé, que é onde ficam as ações; e elas ocupam a linha.
  expect(folha.rodape).toContain('env(safe-area-inset-bottom,0px)');
  expect(folha.rodape).toContain('flex-col-reverse');
  expect(folha.acao).toBe('w-full');
});

it('a decisão perde os filetes e não ganha corpo', () => {
  const decisao = classesSobreposicao('dialogo', 'decisao');
  // Decisão cabe numa dobra e não rola: é uma resposta, não um texto.
  expect(decisao.cabecalho).toContain('border-b-0');
  expect(decisao.rodape).toContain('border-t-0');
  expect(decisao.conteudo).toContain('w-[min(420px,calc(100vw-var(--espaco-6)))]');
});

it('corpo e rodapé vazios não são montados', () => {
  render(<Folha forma="dialogo" medida="decisao" cabecalho={<h2>Descartar?</h2>} />);
  // Equivalente React de `.ui-dialogo__corpo:empty { display: none }`: sem isso, a decisão
  // volta a mostrar a faixa cinza dos dois sinais de rolagem sobrepostos.
  expect(document.querySelector('[data-faixa="corpo"]')).toBeNull();
  expect(document.querySelector('[data-faixa="rodape"]')).toBeNull();
  expect(document.querySelector('[data-faixa="cabecalho"]')).not.toBeNull();
});

it('a forma acompanha o ponto de corte de 768px enquanto a sobreposição está aberta', () => {
  let estreita = false;
  const ouvintes = new Set<() => void>();
  vi.stubGlobal('matchMedia', (texto: string) => ({
    get matches() {
      return texto === CONSULTA_FOLHA && estreita;
    },
    media: texto,
    addEventListener: (_: string, ouvinte: () => void) => ouvintes.add(ouvinte),
    removeEventListener: (_: string, ouvinte: () => void) => ouvintes.delete(ouvinte),
  }));

  function Caso() {
    return <output>{useFormaSobreposicao()}</output>;
  }
  render(<Caso />);
  expect(document.querySelector('output')?.textContent).toBe('dialogo');

  // Girar o aparelho com o diálogo aberto trocava a forma quando isso era consulta de
  // mídia; continua trocando agora que a decisão é de JavaScript.
  act(() => {
    estreita = true;
    for (const ouvinte of ouvintes) ouvinte();
  });
  expect(document.querySelector('output')?.textContent).toBe('folha');
});
