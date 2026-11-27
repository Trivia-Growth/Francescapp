// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { montarHabilitacaoPlanoCrise } from './habilitacao-plano-crise.js';
import { FalhaApi } from './api.ts';

/* Primeira prova de autorização desta tela (25/11/2026, migração para React). A marca de
 * habilitação (FR-020) decide quem PODE aprovar plano de crise, e por isso ela mesma é
 * administrada só por quem tem a capacidade de administrar concessões. Marcar aqui não
 * concede acesso a caso nenhum, e o servidor reautoriza cada gravação. */

const concessaoId = 'e0000000-0000-4000-8000-000000000001';

function pessoa(sobrescrever: Partial<ReturnType<typeof base>> = {}) {
  return { ...base(), ...sobrescrever };
}
function base() {
  return {
    concessao_id: concessaoId,
    usuario_id: 'e0000000-0000-4000-8000-0000000000aa',
    email: 'equipe.ficticia@example.test',
    perfil: 'profissional' as const,
    estado: 'vinculada' as const,
    habilitado: false,
    versao: 3,
  };
}

it('positivo: habilita quem tem acesso ativo, sob a versão lida', async () => {
  const raiz = document.createElement('div');
  const gravar = vi.fn(async () => pessoa({ habilitado: true, versao: 4 }));
  const listar = vi.fn(async () => [pessoa()]);
  const desmontar = montarHabilitacaoPlanoCrise(raiz, { listar, gravar });
  try {
    await vi.waitFor(() => expect(raiz.textContent).toContain('equipe.ficticia@example.test'));
    const caixa = raiz.querySelector('input[type="checkbox"]');
    if (!(caixa instanceof HTMLInputElement)) throw new Error('Caixa ausente');
    expect(caixa.disabled).toBe(false);
    caixa.checked = true;
    raiz.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() =>
      expect(gravar).toHaveBeenCalledWith({
        concessao_id: concessaoId,
        habilitado: true,
        versao_esperada: 3,
      }),
    );
  } finally {
    desmontar();
  }
});

it('negativo: acesso encerrado não pode ser habilitado pela tela', async () => {
  const raiz = document.createElement('div');
  const gravar = vi.fn();
  const listar = vi.fn(async () => [pessoa({ estado: 'revogada' as const })]);
  const desmontar = montarHabilitacaoPlanoCrise(raiz, { listar, gravar });
  try {
    await vi.waitFor(() => expect(raiz.textContent).toContain('Acesso encerrado'));
    const caixa = raiz.querySelector('input[type="checkbox"]');
    if (!(caixa instanceof HTMLInputElement)) throw new Error('Caixa ausente');
    expect(caixa.disabled).toBe(true);
    expect(raiz.textContent).toContain('Só quem tem acesso ativo pode ser habilitado.');
    // Esconder o controle não é autorizar: mesmo forçando o envio, nada é gravado.
    caixa.checked = true;
    raiz.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(gravar).not.toHaveBeenCalled();
  } finally {
    desmontar();
  }
});

it('negativo: recusa do servidor não afirma sucesso e desfaz a marca na tela', async () => {
  const raiz = document.createElement('div');
  const gravar = vi.fn().mockRejectedValue(new FalhaApi('sem_permissao', 403));
  const listar = vi.fn(async () => [pessoa()]);
  const desmontar = montarHabilitacaoPlanoCrise(raiz, { listar, gravar });
  try {
    await vi.waitFor(() => expect(raiz.textContent).toContain('equipe.ficticia@example.test'));
    const caixa = raiz.querySelector('input[type="checkbox"]');
    if (!(caixa instanceof HTMLInputElement)) throw new Error('Caixa ausente');
    caixa.checked = true;
    raiz.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() =>
      expect(raiz.textContent).toContain('Sua conta não pode alterar quem aprova plano de crise.'),
    );
    expect(raiz.textContent).not.toContain('Salvo.');
    expect(caixa.checked).toBe(false);
    expect(listar).toHaveBeenCalledOnce();
  } finally {
    desmontar();
  }
});
