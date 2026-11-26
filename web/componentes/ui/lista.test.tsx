// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { type Coluna, Lista, valor } from './lista.js';

type Pessoa = { id: string; nome: string; estado: string; pendencias: number | null };

const colunas: ReadonlyArray<Coluna<Pessoa>> = [
  { titulo: 'Nome', celula: (p) => p.nome },
  { titulo: 'Situação', celula: (p) => p.estado },
  { titulo: 'Pendências', celula: (p) => valor(p.pendencias), secundaria: true },
];

const itens: Pessoa[] = [
  { id: '1', nome: 'Pessoa fictícia A', estado: 'Em acompanhamento', pendencias: 0 },
  { id: '2', nome: 'Pessoa fictícia B', estado: 'Em pausa', pendencias: null },
];

afterEach(() => {
  // Sem isto cada render se acumula em document.body e as buscas por papel encontram
  // várias listas. O vitest deste projeto não liga os globais do Testing Library.
  cleanup();
  vi.restoreAllMocks();
});

it('apresenta cada registro como uma linha com as mesmas colunas', () => {
  render(
    <Lista itens={itens} colunas={colunas} chave={(p) => p.id} rotulo="Pessoas acompanhadas" />,
  );
  const lista = screen.getByRole('list', { name: 'Pessoas acompanhadas' });
  expect(lista.querySelectorAll('li')).toHaveLength(2);
  expect(screen.getByText('Pessoa fictícia A')).toBeDefined();
  expect(screen.getByText('Em pausa')).toBeDefined();
});

it('distingue zero confirmado de indisponível', () => {
  /* VIS-014. Confundir os dois faz a coordenadora encerrar um assunto que ninguém
     conferiu: "0 pendências" resolve, "—" diz que não se sabe. */
  expect(valor(0)).toBe('0');
  expect(valor(null)).toBe('—');
  expect(valor(undefined)).toBe('—');
  expect(valor('')).toBe('—');
  expect(valor(1234)).toBe('1.234');
});

it('abre o registro pelo teclado, com nome acionável por extenso', async () => {
  const abrir = vi.fn();
  render(
    <Lista
      itens={itens}
      colunas={colunas}
      chave={(p) => p.id}
      rotulo="Pessoas acompanhadas"
      aoAbrir={abrir}
      rotuloDaLinha={(p) => `Abrir ficha de ${p.nome}`}
    />,
  );
  const linha = screen.getByRole('button', { name: 'Abrir ficha de Pessoa fictícia A' });
  linha.focus();
  expect(document.activeElement).toBe(linha);
  await userEvent.keyboard('{Enter}');
  expect(abrir).toHaveBeenCalledWith(itens[0]);
});

it('degrada o registro que falha sem derrubar os demais', async () => {
  /* O defeito observado em 24/11/2026: uma única linha com conteúdo inválido apagou a
     lista de equipe inteira, e a pessoa perdeu o acesso a todos os outros registros. */
  const silenciar = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const quebrado: ReadonlyArray<Coluna<Pessoa>> = [
    {
      titulo: 'Nome',
      celula: (p) => {
        if (p.id === '1') throw new Error('conteúdo inesperado');
        return p.nome;
      },
    },
  ];
  const falhou = vi.fn();
  render(
    <Lista
      itens={itens}
      colunas={quebrado}
      chave={(p) => p.id}
      rotulo="Pessoas acompanhadas"
      aoFalharLinha={falhou}
    />,
  );
  expect(screen.getByText(/não pôde ser apresentado/)).toBeDefined();
  expect(screen.getByText('Pessoa fictícia B')).toBeDefined();
  expect(falhou).toHaveBeenCalled();
  silenciar.mockRestore();
});

it('anuncia carga sem trocar a lista por uma frase', () => {
  /* VIS-014: a moldura permanece. A queixa de 24/11/2026 foi justamente o contrário —
     o conteúdo sumia e aparecia texto no lugar. */
  render(
    <Lista
      itens={itens}
      colunas={colunas}
      chave={(p) => p.id}
      rotulo="Pessoas acompanhadas"
      carregando
    />,
  );
  const lista = screen.getByRole('list', { name: 'Pessoas acompanhadas' });
  expect(lista.getAttribute('aria-busy')).toBe('true');
  expect(screen.getByText('Pessoa fictícia A')).toBeDefined();
});

it('não mostra cabeçalho de colunas quando não há registro', () => {
  /* Cabeçalho de coluna sem linha nenhuma anuncia colunas de um conteúdo que não existe,
     e numa tela vazia vira a única coisa visível. Medido em 25/11/2026 em Acessos e em
     Vínculos profissionais. */
  const { container, rerender } = render(
    <Lista itens={[]} colunas={colunas} chave={(p) => p.id} rotulo="Pessoas acompanhadas" />,
  );
  expect(container.querySelector('[aria-hidden="true"]')?.hasAttribute('hidden')).toBe(true);

  rerender(
    <Lista itens={itens} colunas={colunas} chave={(p) => p.id} rotulo="Pessoas acompanhadas" />,
  );
  expect(container.querySelector('[aria-hidden="true"]')?.hasAttribute('hidden')).toBe(false);
});

it('dispensa a moldura própria quando já está dentro de uma superfície', () => {
  /* "Caixa dentro de caixa" foi a queixa literal de 24/11/2026, e voltou nas telas
     migradas: a `Superficie` tem moldura e a `Lista` tinha a sua, duas bordas para o
     mesmo assunto. Medido na conferência visual de 25/11/2026. */
  const { container, rerender } = render(
    <Lista itens={itens} colunas={colunas} chave={(p) => p.id} rotulo="Pessoas" />,
  );
  expect(container.firstElementChild?.className).toContain('border');

  rerender(
    <Lista itens={itens} colunas={colunas} chave={(p) => p.id} rotulo="Pessoas" moldura={false} />,
  );
  expect(container.firstElementChild?.className).not.toContain('border');
});
