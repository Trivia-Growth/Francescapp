// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { createElement, type ComponentProps } from 'react';
import { expect, it, vi } from 'vitest';
import { TelaRegrasAtendimento } from './regras-atendimento.js';
import { FalhaApi } from './api.ts';

function montarRegrasAtendimento(
  raiz: HTMLElement,
  servico: ComponentProps<typeof TelaRegrasAtendimento>['servico'],
) {
  return render(createElement(TelaRegrasAtendimento, { servico }), { container: raiz }).unmount;
}

/* Primeira prova desta tela (25/11/2026, migração para React). FR-041: as regras são
 * leitura aberta a QUALQUER sessão autenticada — profissional, paciente e familiar veem a
 * mesma tela, sem caminho por perfil. O recorte do que é publicado é do banco, que só
 * devolve as chaves de exposição pública; a tela não escolhe nada e não tem formulário.
 *
 * Positivo: sessão autenticada lê o que o servidor publicou, na ordem de FR-041.
 * Negativo: recusa do servidor não expõe conteúdo nem inventa regra. */

function regra(chave: string, rotulo: string, valor: string) {
  return { chave, rotulo, valor, atualizado_em: '2026-11-18T12:00:00Z' };
}

it('positivo: sessão autenticada lê as regras publicadas, com "onde pedir ajuda" primeiro', async () => {
  const raiz = document.createElement('div');
  const consultar = vi
    .fn()
    .mockResolvedValue([
      regra('ffcm.regras.diario', 'Uso do diário fictício', 'Texto fictício do diário.'),
      regra('ffcm.regras.canais', 'Onde pedir ajuda fictício', 'Texto fictício dos canais.'),
    ]);
  const desmontar = montarRegrasAtendimento(raiz, { consultar });
  try {
    await vi.waitFor(() => expect(raiz.textContent).toContain('Texto fictício dos canais.'));
    const titulos = [...raiz.querySelectorAll('h2')].map((item) => item.textContent);
    expect(titulos).toEqual([
      'Como funciona e onde pedir ajuda',
      'Onde pedir ajuda fictício',
      'Uso do diário fictício',
    ]);
    // Somente leitura: a tela não oferece nenhum caminho de edição.
    expect(raiz.querySelector('form')).toBeNull();
    expect(raiz.querySelector('input')).toBeNull();
  } finally {
    desmontar();
  }
});

it('negativo: recusa do servidor não expõe regra nenhuma e oferece recuperação', async () => {
  const raiz = document.createElement('div');
  const consultar = vi.fn().mockRejectedValue(new FalhaApi('sem_permissao', 403));
  const desmontar = montarRegrasAtendimento(raiz, { consultar });
  try {
    await vi.waitFor(() =>
      expect(raiz.textContent).toContain('Não foi possível carregar as regras.'),
    );
    expect(raiz.querySelectorAll('h2')).toHaveLength(1);
    expect(raiz.querySelector('[aria-busy="true"]')).toBeNull();
    // Erro sem saída é beco: o recarregar continua alcançável.
    expect(
      [...raiz.querySelectorAll('button')].some((item) => item.textContent === 'Recarregar'),
    ).toBe(true);
  } finally {
    desmontar();
  }
});
