// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { createElement, type ComponentProps } from 'react';
import { render } from '@testing-library/react';
import { TelaPapelDeclarado } from './papel-declarado-administracao.js';
import { FalhaApi } from './api.ts';
import { esquecerConsultas } from './consultas.js';

const identidade = {
  usuario_id: 'a0000000-0000-4000-8000-00000000000a',
  session_id: 'a1000000-0000-4000-8000-00000000000a',
};

// O cache de leitura é um módulo único: cada teste começa com ele vazio.
beforeEach(() => esquecerConsultas());

function montarPapelDeclaradoAdministracao(
  raiz: HTMLElement,
  servico: ComponentProps<typeof TelaPapelDeclarado>['servico'],
  acessoPerdido: ComponentProps<typeof TelaPapelDeclarado>['acessoPerdido'],
) {
  return render(createElement(TelaPapelDeclarado, { servico, acessoPerdido }), { container: raiz })
    .unmount;
}

/* Primeira prova desta tela (25/11/2026, migração para React). O catálogo de papéis
 * declarados é administrado só pelo Administrador, e o papel é rótulo de registro: ele
 * NÃO concede acesso nenhum. As duas pontas da autorização precisam estar cobertas —
 * quem pode administra, e quem não pode não vê nem grava. */

const papelId = 'b0000000-0000-4000-8000-000000000001';

function papel(nome = 'Acompanhante terapêutico fictício') {
  return { papel_id: papelId, nome, ativo: true, de_fabrica: false, versao: 1 };
}

it('positivo: quem administra renomeia um papel sob a versão lida', async () => {
  const raiz = document.createElement('div');
  const servico = {
    identidade,
    consultar: vi.fn().mockResolvedValue([papel()]),
    gravar: vi.fn().mockResolvedValue(undefined),
  };
  const perdido = vi.fn();
  const desmontar = montarPapelDeclaradoAdministracao(raiz, servico, perdido);
  try {
    await vi.waitFor(() => expect(raiz.textContent).toContain('Catálogo de papéis atualizado'));
    const formulario = [...raiz.querySelectorAll('form')].find((item) =>
      [...item.querySelectorAll('button')].some((botao) => botao.textContent === 'Salvar nome'),
    );
    const campo = formulario?.querySelector('input');
    if (!formulario || !campo) throw new Error('Formulário de renomear ausente');
    campo.value = 'Enfermeira fictícia';
    formulario.requestSubmit();
    await vi.waitFor(() =>
      expect(servico.gravar).toHaveBeenCalledWith(
        { papel_id: papelId, nome: 'Enfermeira fictícia', ativo: true, versao_esperada: 1 },
        expect.any(String),
      ),
    );
    expect(perdido).not.toHaveBeenCalled();
  } finally {
    desmontar();
  }
});

it('negativo: recusa de permissão na leitura esvazia a tela e devolve o acesso perdido', async () => {
  const raiz = document.createElement('div');
  const servico = {
    identidade,
    consultar: vi.fn().mockRejectedValue(new FalhaApi('sem_permissao', 403)),
    gravar: vi.fn(),
  };
  const perdido = vi.fn();
  montarPapelDeclaradoAdministracao(raiz, servico, perdido);
  await vi.waitFor(() => expect(perdido).toHaveBeenCalledOnce());
  // Nada do catálogo sobrevive à negativa, nem por um quadro: a tela some inteira.
  expect(raiz.childElementCount).toBe(0);
  expect(raiz.textContent).toBe('');
  expect(servico.gravar).not.toHaveBeenCalled();
});

it('negativo: recusa de permissão na gravação não inventa sucesso nem cria um segundo envio', async () => {
  const raiz = document.createElement('div');
  const servico = {
    identidade,
    consultar: vi.fn().mockResolvedValue([papel()]),
    gravar: vi.fn().mockRejectedValue(new FalhaApi('sem_permissao', 403)),
  };
  const perdido = vi.fn();
  montarPapelDeclaradoAdministracao(raiz, servico, perdido);
  await vi.waitFor(() => expect(raiz.textContent).toContain('Catálogo de papéis atualizado'));
  const novo = [...raiz.querySelectorAll('form')].find((item) =>
    [...item.querySelectorAll('button')].some((botao) => botao.textContent === 'Criar papel'),
  );
  const campo = novo?.querySelector('input');
  if (!novo || !campo) throw new Error('Formulário novo ausente');
  campo.value = 'Papel fictício sem permissão';
  novo.requestSubmit();
  await vi.waitFor(() => expect(perdido).toHaveBeenCalledOnce());
  expect(servico.gravar).toHaveBeenCalledOnce();
  expect(raiz.childElementCount).toBe(0);
});
