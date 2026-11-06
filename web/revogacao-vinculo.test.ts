// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import type { ClienteFFCM } from './api.ts';
import { montarRevogacaoVinculo } from './revogacao-vinculo.ts';

it('exige confirmação, envia versão e reconsulta após resposta incerta sem repetir', async () => {
  const raiz = document.createElement('div');
  const confirmar = vi
    .spyOn(window, 'confirm')
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(true);
  const revogar = vi.fn().mockRejectedValue(new Error('resposta perdida'));
  const atualizar = vi.fn().mockResolvedValue(undefined);
  const pendente = vi.fn();
  const api = { revogarAcessoPaciente: revogar } as unknown as ClienteFFCM;
  const tela = montarRevogacaoVinculo(raiz, 'paciente', api, atualizar, () => false, pendente);
  tela.selecionar({ id: 'acesso', versao: 3, nome: 'Pessoa fictícia' });
  const motivo = raiz.querySelector('textarea') as HTMLTextAreaElement;
  motivo.value = 'Motivo fictício';
  motivo.dispatchEvent(new Event('input'));
  const botao = raiz.querySelector('button') as HTMLButtonElement;
  botao.click();
  expect(revogar).not.toHaveBeenCalled();
  botao.click();
  await vi.waitFor(() => expect(atualizar).toHaveBeenCalledOnce());
  expect(revogar).toHaveBeenCalledOnce();
  expect(revogar).toHaveBeenCalledWith(
    'paciente',
    'acesso',
    { versao_esperada: 3, motivo: 'Motivo fictício' },
    expect.any(String),
  );
  expect(raiz.textContent).toContain('O pedido ainda pode ser concluído');
  expect(motivo.value).toBe('Motivo fictício');
  expect(pendente).toHaveBeenLastCalledWith(true);
  await vi.waitFor(() => expect(botao.disabled).toBe(true));
  tela.selecionar({ id: 'outro', versao: 1, nome: 'Outra pessoa' });
  botao.click();
  expect(revogar).toHaveBeenCalledOnce();
  expect(raiz.textContent).toContain('O pedido ainda pode ser concluído');
  confirmar.mockRestore();
});

it('exige nova seleção após atualização para usar versão atual', async () => {
  const raiz = document.createElement('div');
  const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
  const revogar = vi.fn().mockResolvedValue({ id: 'acesso', versao: 3 });
  const tela = montarRevogacaoVinculo(
    raiz,
    'paciente',
    { revogarAcessoPaciente: revogar } as unknown as ClienteFFCM,
    async () => {},
    () => false,
    () => {},
  );
  tela.selecionar({ id: 'acesso', versao: 1, nome: 'Pessoa' });
  const motivo = raiz.querySelector('textarea') as HTMLTextAreaElement;
  motivo.value = 'Motivo fictício';
  const botao = raiz.querySelector('button') as HTMLButtonElement;
  tela.invalidarSelecao();
  botao.click();
  expect(revogar).not.toHaveBeenCalled();
  expect(motivo.value).toBe('Motivo fictício');
  tela.selecionar({ id: 'acesso', versao: 2, nome: 'Pessoa' });
  botao.click();
  await vi.waitFor(() => expect(revogar).toHaveBeenCalledOnce());
  expect(revogar).toHaveBeenCalledWith(
    'paciente',
    'acesso',
    { versao_esperada: 2, motivo: 'Motivo fictício' },
    expect.any(String),
  );
  confirmar.mockRestore();
});
