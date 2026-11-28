// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { createElement, type ComponentProps } from 'react';
import { render } from '@testing-library/react';
import { TelaModeloFichaPlantao } from './modelo-ficha-plantao-administracao.js';
import { FalhaApi } from './api.ts';

function montarModeloFichaPlantao(
  raiz: HTMLElement,
  servico: ComponentProps<typeof TelaModeloFichaPlantao>['servico'],
  acessoPerdido: ComponentProps<typeof TelaModeloFichaPlantao>['acessoPerdido'],
) {
  return render(createElement(TelaModeloFichaPlantao, { servico, acessoPerdido }), {
    container: raiz,
  }).unmount;
}

/* Primeira prova desta tela (25/11/2026, migração para React). O modelo da ficha de
 * plantão é administrado só pelo Administrador (FR-078), e desativar um campo nunca apaga
 * resposta já gravada. As duas pontas da autorização precisam estar cobertas. */

const campoId = 'd0000000-0000-4000-8000-000000000001';

function campo() {
  return {
    campo_id: campoId,
    escopo: 'ficha_plantao' as const,
    nome: 'Observação fictícia',
    tipo: 'texto_longo' as const,
    opcoes: null,
    ativo: true,
    ordem: 3,
    obrigatorio: false,
    de_fabrica: false,
    visibilidade: 'interna' as const,
    versao: 4,
  };
}

it('positivo: quem administra muda a visibilidade do campo sob a versão lida', async () => {
  const raiz = document.createElement('div');
  const servico = {
    consultar: vi.fn().mockResolvedValue([campo()]),
    gravar: vi.fn().mockResolvedValue(undefined),
  };
  const perdido = vi.fn();
  const desmontar = montarModeloFichaPlantao(raiz, servico, perdido);
  try {
    await vi.waitFor(() => expect(raiz.textContent).toContain('Modelo da ficha atualizado'));
    const formulario = [...raiz.querySelectorAll('form')].find((item) =>
      [...item.querySelectorAll('button')].some((botao) => botao.textContent === 'Salvar campo'),
    );
    if (!formulario) throw new Error('Formulário de edição ausente');
    const visibilidade = formulario.elements.namedItem('visibilidade');
    if (!(visibilidade instanceof HTMLSelectElement)) throw new Error('Visibilidade ausente');
    visibilidade.value = 'compartilhavel';
    formulario.requestSubmit();
    await vi.waitFor(() =>
      expect(servico.gravar).toHaveBeenCalledWith(
        expect.objectContaining({
          campo_id: campoId,
          escopo: 'ficha_plantao',
          nome: 'Observação fictícia',
          visibilidade: 'compartilhavel',
          ordem: 3,
          versao_esperada: 4,
        }),
        expect.any(String),
      ),
    );
    expect(perdido).not.toHaveBeenCalled();
  } finally {
    desmontar();
  }
});

it('negativo: recusa de permissão esvazia a tela e devolve o acesso perdido', async () => {
  const raiz = document.createElement('div');
  const servico = {
    consultar: vi.fn().mockRejectedValue(new FalhaApi('sem_permissao', 403)),
    gravar: vi.fn(),
  };
  const perdido = vi.fn();
  montarModeloFichaPlantao(raiz, servico, perdido);
  await vi.waitFor(() => expect(perdido).toHaveBeenCalledOnce());
  expect(raiz.childElementCount).toBe(0);
  expect(raiz.textContent).toBe('');
  expect(servico.gravar).not.toHaveBeenCalled();
});
