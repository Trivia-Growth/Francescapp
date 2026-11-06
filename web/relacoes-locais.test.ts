// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { montarRelacoesLocais, type PessoaReferenciaLocal } from './relacoes-locais';

it('guarda pessoa somente após persistência, preserva rascunho em falha e permite edição', async () => {
  const raiz = document.createElement('div');
  const pessoas: PessoaReferenciaLocal[] = [];
  const registrar = vi
    .fn()
    .mockRejectedValueOnce(new Error('falha'))
    .mockImplementation(async (pessoa) => ({ id: '1', ...pessoa }));
  const atualizar = vi.fn(async () => {});
  montarRelacoesLocais(raiz, { pessoas, aoRegistrar: registrar, aoAtualizar: atualizar });
  expect(raiz.textContent).toContain('não cria conta nem concede acesso');
  const campos = raiz.querySelectorAll('input');
  campos[0].value = '<Pessoa fictícia>';
  campos[1].value = 'Amiga';
  const form = raiz.querySelector('form') as HTMLFormElement;
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(raiz.textContent).toContain('rascunho foi preservado'));
  expect(pessoas).toHaveLength(0);
  expect(campos[0].value).toBe('<Pessoa fictícia>');
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(pessoas).toHaveLength(1));
  expect(registrar).toHaveBeenLastCalledWith({
    nome: '<Pessoa fictícia>',
    relacao: 'Amiga',
    contato: '',
  });
  expect(raiz.querySelector('pessoa')).toBeNull();
  (raiz.querySelector('li button') as HTMLButtonElement).click();
  campos[2].value = 'Contato fictício';
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(pessoas[0].contato).toBe('Contato fictício'));
  expect(atualizar).toHaveBeenCalledWith('1', {
    nome: '<Pessoa fictícia>',
    relacao: 'Amiga',
    contato: 'Contato fictício',
  });
});

it('sinaliza descarte confirmado e mantém rascunho quando descarte é recusado', () => {
  const raiz = document.createElement('div');
  const aoLimpar = vi.fn();
  montarRelacoesLocais(raiz, {
    pessoas: [{ id: '1', nome: 'Pessoa fictícia', relacao: 'Amiga', contato: '' }],
    aoRegistrar: async (dados) => ({ id: '2', ...dados }),
    aoAtualizar: async () => {},
    aoLimpar,
  });
  (raiz.querySelector('li button') as HTMLButtonElement).click();
  aoLimpar.mockClear();
  (raiz.querySelector('input') as HTMLInputElement).value = 'Rascunho fictício';
  const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const cancelar = Array.from(raiz.querySelectorAll('button')).find(
    (b) => b.textContent === 'Cancelar edição',
  ) as HTMLButtonElement;
  cancelar.click();
  expect(aoLimpar).not.toHaveBeenCalled();
  confirmar.mockReturnValue(true);
  cancelar.click();
  expect(aoLimpar).toHaveBeenCalledOnce();
  expect((raiz.querySelector('input') as HTMLInputElement).value).toBe('');
  confirmar.mockRestore();
});

it('limpa estado sujo ao aceitar descarte na troca de pessoa', () => {
  const raiz = document.createElement('div');
  const aoLimpar = vi.fn();
  montarRelacoesLocais(raiz, {
    pessoas: [
      { id: '1', nome: 'Pessoa A', relacao: 'Amiga', contato: '' },
      { id: '2', nome: 'Pessoa B', relacao: 'Familiar', contato: '' },
    ],
    aoRegistrar: async (dados) => ({ id: '3', ...dados }),
    aoAtualizar: async () => {},
    aoLimpar,
  });
  const botoes = raiz.querySelectorAll('li button');
  (botoes[0] as HTMLButtonElement).click();
  aoLimpar.mockClear();
  (raiz.querySelector('input') as HTMLInputElement).value = 'Rascunho';
  const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
  (botoes[1] as HTMLButtonElement).click();
  expect(aoLimpar).not.toHaveBeenCalled();
  confirmar.mockReturnValue(true);
  (botoes[1] as HTMLButtonElement).click();
  expect(aoLimpar).toHaveBeenCalledOnce();
  expect((raiz.querySelector('input') as HTMLInputElement).value).toBe('Pessoa B');
  confirmar.mockRestore();
});
