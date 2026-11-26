// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { EstadoErro } from './estado-erro.js';
import { EstadoVazio } from './estado-vazio.js';
import { Superficie } from './superficie.js';

afterEach(cleanup);

it('anuncia erro como alerta e aviso como estado, sem depender só da cor', () => {
  /* VIS-014 e a regra "cor nunca é o único sinal": quem não distingue o âmbar do
     vermelho, e quem ouve a tela, precisam receber a diferença por papel e por palavra. */
  const { rerender } = render(<EstadoErro titulo="Não foi possível carregar" />);
  const erro = screen.getByRole('alert');
  expect(erro.getAttribute('aria-live')).toBe('assertive');
  expect(erro.textContent).toContain('Não foi possível carregar');

  rerender(<EstadoErro tom="atencao" titulo="Confira antes de continuar" />);
  const aviso = screen.getByRole('status');
  expect(aviso.getAttribute('aria-live')).toBe('polite');
  expect(aviso.dataset.tom).toBe('atencao');
});

it('mantém a recuperação dentro do erro, não fora dele', () => {
  // Erro sem recuperação é beco sem saída: a pessoa lê o problema e não tem o que fazer.
  render(
    <EstadoErro
      titulo="Não foi possível carregar a equipe"
      texto="A consulta não respondeu."
      acao={<button type="button">Tentar novamente</button>}
    />,
  );
  const alerta = screen.getByRole('alert');
  expect(alerta.contains(screen.getByRole('button', { name: 'Tentar novamente' }))).toBe(true);
});

it('mantém o estado vazio dentro do painel, com próximo passo', () => {
  render(
    <Superficie titulo="Equipe">
      <EstadoVazio
        titulo="Nenhum acesso concedido ainda"
        texto="Convide alguém da equipe para começar."
        acao={<button type="button">Convidar</button>}
      />
    </Superficie>,
  );
  const painel = screen.getByRole('heading', { name: 'Equipe' }).closest('section');
  expect(painel).not.toBeNull();
  expect(painel?.contains(screen.getByText('Nenhum acesso concedido ainda'))).toBe(true);
  expect(painel?.contains(screen.getByRole('button', { name: 'Convidar' }))).toBe(true);
});

it('não monta cabeçalho nem moldura quando a superfície é plana dentro de outra', () => {
  // Caixa dentro de caixa foi a queixa literal de 24/11/2026: "uma caixa solta".
  const { container } = render(
    <Superficie plana>
      <p>Conteúdo</p>
    </Superficie>,
  );
  const secao = container.querySelector('section');
  expect(secao?.querySelector('header')).toBeNull();
  expect(secao?.className).not.toContain('border');
});
