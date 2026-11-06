// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { type EncaminhamentoLocal, montarEncaminhamentosLocais } from './encaminhamentos-local';

it('registra e atualiza somente após gravação, preservando rascunho em falha', async () => {
  const raiz = document.createElement('div');
  const encaminhamentos: EncaminhamentoLocal[] = [];
  const registrar = vi
    .fn()
    .mockRejectedValueOnce(new Error('falha'))
    .mockImplementation(async (dados) => ({ id: '1', ...dados }));
  const atualizar = vi.fn(async () => {});
  montarEncaminhamentosLocais(raiz, {
    encaminhamentos,
    aoRegistrar: registrar,
    aoAtualizar: atualizar,
  });
  const campos = raiz.querySelectorAll('input');
  campos[0].value = '<destino fictício>';
  campos[1].value = 'Motivo fictício';
  campos[2].value = 'Profissional fictício';
  const form = raiz.querySelector('form') as HTMLFormElement;
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(raiz.textContent).toContain('rascunho foi preservado'));
  expect(encaminhamentos).toHaveLength(0);
  expect(campos[0].value).toBe('<destino fictício>');
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(encaminhamentos).toHaveLength(1));
  expect(raiz.textContent).toContain('<destino fictício>');
  expect(raiz.querySelector('destino')).toBeNull();
  (raiz.querySelector('li button') as HTMLButtonElement).click();
  (raiz.querySelector('select') as HTMLSelectElement).value = 'retorno pendente';
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(encaminhamentos[0].estado).toBe('retorno pendente'));
  expect(atualizar).toHaveBeenCalledWith(
    '1',
    expect.objectContaining({ estado: 'retorno pendente' }),
  );
});

it('filtra encaminhamentos com retorno pendente', () => {
  const raiz = document.createElement('div');
  const encaminhamentos: EncaminhamentoLocal[] = [
    {
      id: '1',
      destino: 'Destino A',
      motivo: 'Motivo',
      responsavel: 'Profissional',
      estado: 'sugerido',
    },
    {
      id: '2',
      destino: 'Destino B',
      motivo: 'Motivo',
      responsavel: 'Profissional',
      estado: 'retorno pendente',
    },
  ];
  montarEncaminhamentosLocais(raiz, {
    encaminhamentos,
    aoRegistrar: async (dados) => ({ id: '3', ...dados }),
    aoAtualizar: async () => {},
  });
  const filtro = raiz.querySelector('input[type=checkbox]') as HTMLInputElement;
  filtro.checked = true;
  filtro.dispatchEvent(new Event('change'));
  expect(raiz.textContent).not.toContain('Destino A');
  expect(raiz.textContent).toContain('Destino B');
  filtro.checked = false;
  filtro.dispatchEvent(new Event('change'));
  expect(raiz.textContent).toContain('Destino A');
});

it('preserva rascunho ao recusar descarte e só pergunta quando alterado', () => {
  const raiz = document.createElement('div');
  const encaminhamentos: EncaminhamentoLocal[] = [
    {
      id: '1',
      destino: 'Destino A',
      motivo: 'Motivo',
      responsavel: 'Profissional',
      estado: 'sugerido',
    },
    {
      id: '2',
      destino: 'Destino B',
      motivo: 'Motivo',
      responsavel: 'Profissional',
      estado: 'agendado',
    },
  ];
  montarEncaminhamentosLocais(raiz, {
    encaminhamentos,
    aoRegistrar: async (dados) => ({ id: '3', ...dados }),
    aoAtualizar: async () => {},
  });
  const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const botoes = raiz.querySelectorAll('li button');
  (botoes[0] as HTMLButtonElement).click();
  expect(confirmar).not.toHaveBeenCalled();
  const destino = raiz.querySelector('input') as HTMLInputElement;
  destino.value = 'Rascunho';
  (botoes[1] as HTMLButtonElement).click();
  expect(destino.value).toBe('Rascunho');
  const cancelar = Array.from(raiz.querySelectorAll('form button')).find(
    (botao) => botao.textContent === 'Cancelar edição',
  ) as HTMLButtonElement;
  cancelar.click();
  expect(destino.value).toBe('Rascunho');
  expect(confirmar).toHaveBeenCalledTimes(2);
  confirmar.mockReturnValue(true);
  cancelar.click();
  expect(destino.value).toBe('');
  confirmar.mockRestore();
});

it('bloqueia filtro e edição enquanto salva, inclusive após renderização da lista', async () => {
  const raiz = document.createElement('div');
  const encaminhamentos: EncaminhamentoLocal[] = [
    {
      id: '1',
      destino: 'Destino',
      motivo: 'Motivo',
      responsavel: 'Profissional',
      estado: 'retorno pendente',
    },
  ];
  let concluir: () => void = () => {};
  montarEncaminhamentosLocais(raiz, {
    encaminhamentos,
    aoRegistrar: async (dados) => ({ id: '2', ...dados }),
    aoAtualizar: () =>
      new Promise<void>((resolve) => {
        concluir = resolve;
      }),
  });
  (raiz.querySelector('li button') as HTMLButtonElement).click();
  raiz.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  const filtro = raiz.querySelector('input[type=checkbox]') as HTMLInputElement;
  expect(filtro.disabled).toBe(true);
  filtro.dispatchEvent(new Event('change'));
  expect((raiz.querySelector('li button') as HTMLButtonElement).disabled).toBe(true);
  concluir();
  await vi.waitFor(() => expect(filtro.disabled).toBe(false));
  expect((raiz.querySelector('li button') as HTMLButtonElement).disabled).toBe(false);
});
