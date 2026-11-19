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

it('avisa falha operacional mesmo com descarte desligado, sem conteúdo privado', async () => {
  const raiz = document.createElement('div');
  montarSegredosIntegracoes(raiz, {
    listar: vi.fn().mockResolvedValue([]),
    gravar: vi.fn(),
    consultarExpurgo: vi.fn().mockResolvedValue({
      ativo: false,
      ultima_execucao: { executado_em: '2026-11-18T12:00:00Z', falhas: 2, apagados: 0 },
    }),
  });
  await vi.waitFor(() => expect(raiz.textContent).toContain('2 descartes falharam'));
  expect(raiz.textContent).toContain('Descarte automático desligado');
  expect(raiz.querySelectorAll('button').length).toBe(1);
});

it('bloqueia recarga e novas escritas até conferir metadados após resposta incerta', async () => {
  const raiz = document.createElement('div');
  const item = {
    chave: 'ffcmapp.integracao.openrouter' as const,
    cadastrado: false,
    versao: 0,
    atualizado_por_usuario_id: null,
    atualizado_em: null,
  };
  let falhar!: (erro: Error) => void;
  const gravar = vi.fn(
    () =>
      new Promise<typeof item>((_, rejeitar) => {
        falhar = rejeitar;
      }),
  );
  const listar = vi.fn().mockResolvedValue([item]);
  const desmontar = montarSegredosIntegracoes(raiz, { listar, gravar });
  await vi.waitFor(() => expect(raiz.querySelector('input')?.disabled).toBe(false));
  const formulario = raiz.querySelector('form');
  const campo = raiz.querySelector('input');
  if (!campo || !formulario) throw new Error('Formulário ausente');
  const recarregar = [...raiz.querySelectorAll('button')].find(
    (botao) => botao.textContent === 'Recarregar integrações',
  );
  campo.value = 'valor-ficticio-invalido';
  formulario.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(campo.value).toBe('');
  expect(recarregar?.disabled).toBe(true);
  recarregar?.click();
  formulario.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(listar).toHaveBeenCalledOnce();
  expect(gravar).toHaveBeenCalledOnce();
  falhar(new Error('resposta perdida'));
  await vi.waitFor(() => expect(raiz.textContent).toContain('confira a versão'));
  expect(campo.disabled).toBe(true);
  expect(recarregar?.disabled).toBe(false);
  campo.value = 'outro-valor-ficticio-invalido';
  formulario.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(gravar).toHaveBeenCalledOnce();
  listar.mockResolvedValue([{ ...item, cadastrado: true, versao: 1 }]);
  recarregar?.click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Versão 1'));
  expect(raiz.querySelector('input')?.disabled).toBe(false);
  expect(raiz.querySelector('input')?.value).toBe('');
  expect(gravar).toHaveBeenCalledOnce();
  desmontar();
});
