// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { montarEstadoEmocionalAdministracao } from './estado-emocional-administracao.js';
import { FalhaApi } from './api.ts';

/* Primeira prova desta tela (25/11/2026, migração para React). O vocabulário de estado
 * emocional observado é administrado só pelo Administrador. As duas pontas da autorização
 * precisam estar cobertas: quem pode administra, e quem não pode não vê nem grava. */

const estadoId = 'c0000000-0000-4000-8000-000000000001';

function termo(estado = 'tranquilo fictício') {
  return { estado_id: estadoId, estado, ativo: true, de_fabrica: false, versao: 2 };
}

it('positivo: quem administra desativa um termo sob a versão lida', async () => {
  const raiz = document.createElement('div');
  const servico = {
    consultar: vi.fn().mockResolvedValue([termo()]),
    gravar: vi.fn().mockResolvedValue(undefined),
  };
  const perdido = vi.fn();
  const desmontar = montarEstadoEmocionalAdministracao(raiz, servico, perdido);
  try {
    await vi.waitFor(() => expect(raiz.textContent).toContain('Catálogo de termos atualizado'));
    const desativar = [...raiz.querySelectorAll('button')].find(
      (item) => item.textContent === 'Desativar termo',
    );
    desativar?.click();
    await vi.waitFor(() =>
      expect(servico.gravar).toHaveBeenCalledWith(
        { estado_id: estadoId, estado: 'tranquilo fictício', ativo: false, versao_esperada: 2 },
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
  montarEstadoEmocionalAdministracao(raiz, servico, perdido);
  await vi.waitFor(() => expect(perdido).toHaveBeenCalledOnce());
  expect(raiz.childElementCount).toBe(0);
  expect(raiz.textContent).toBe('');
  expect(servico.gravar).not.toHaveBeenCalled();
});
