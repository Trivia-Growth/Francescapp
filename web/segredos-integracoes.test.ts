// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { montarSegredosIntegracoes } from './segredos-integracoes.ts';

it('envia uma vez, limpa campo imediatamente e mostra somente metadados', async () => {
  const raiz = document.createElement('div');
  const item = {
    chave: 'ffcmapp.integracao.openrouter' as const,
    cadastrado: false,
    versao: 0,
    atualizado_por_usuario_id: null,
    atualizado_em: null,
  };
  let concluir!: (valor: typeof item) => void;
  const gravar = vi.fn(
    () =>
      new Promise<typeof item>((resolver) => {
        concluir = resolver;
      }),
  );
  const listar = vi.fn().mockResolvedValue([item]);
  const desmontar = montarSegredosIntegracoes(raiz, { listar, gravar });
  await vi.waitFor(() => expect(raiz.querySelector('input')).not.toBeNull());
  const campo = raiz.querySelector('input');
  if (!campo) throw new Error('Campo ausente');
  campo.value = 'valor-ficticio-invalido';
  raiz
    .querySelector('form')
    ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  expect(campo.value).toBe('');
  expect(campo.disabled).toBe(true);
  expect(gravar).toHaveBeenCalledWith({
    segredo_chave: item.chave,
    valor: 'valor-ficticio-invalido',
    versao_esperada: 0,
  });
  expect(raiz.textContent).not.toContain('valor-ficticio-invalido');
  concluir(item);
  await vi.waitFor(() => expect(listar).toHaveBeenCalledTimes(2));
  desmontar();
  expect(raiz.childElementCount).toBe(0);
});
