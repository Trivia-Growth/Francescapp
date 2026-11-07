// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { montarConcessaoEquipe } from './concessao-equipe.ts';
import { FalhaApi, type ClienteFFCM } from './api.ts';

function preparar(
  criar: ReturnType<typeof vi.fn>,
  identidadeAtual = () => ({ usuario_id: 'ator', session_id: 'sessao' }),
) {
  const raiz = document.createElement('div');
  montarConcessaoEquipe(raiz, {
    criarConcessaoEquipe: criar,
    identidadeAtual,
  } as unknown as ClienteFFCM);
  const email = raiz.querySelector('input');
  const motivo = raiz.querySelector('textarea');
  const formulario = raiz.querySelector('form');
  if (!email || !motivo || !formulario) throw new Error('Campos ausentes');
  email.value = 'equipe@example.test';
  motivo.value = 'Admissão aprovada';
  const enviar = () => formulario.dispatchEvent(new Event('submit', { cancelable: true }));
  return { raiz, email, enviar };
}

it('repete resultado incerto com mesma chave e informa estado vigente devolvido', async () => {
  const criar = vi.fn().mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce({
    estado: 'revogada',
    perfil: 'profissional',
    versao: 2,
  });
  const { raiz, email, enviar } = preparar(criar);
  enviar();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Resultado não confirmado'));
  expect(email.value).toBe('equipe@example.test');
  expect(raiz.querySelector('fieldset')?.disabled).toBe(true);
  enviar();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Estado atual: Revogada'));
  expect(criar.mock.calls[1]).toEqual(criar.mock.calls[0]);
});

it.each([
  [401, 'nao_autenticado'],
  [403, 'sem_permissao'],
  [422, 'entrada_invalida'],
  [409, 'conflito'],
])('libera edição após resposta definitiva %s %s', async (status, codigo) => {
  const criar = vi.fn().mockRejectedValue(new FalhaApi(codigo, status));
  const { raiz, email, enviar } = preparar(criar);
  enviar();
  await vi.waitFor(() => expect(raiz.querySelector('fieldset')?.disabled).toBe(false));
  expect(email.value).toBe('equipe@example.test');
  expect(raiz.textContent).not.toContain('Resultado não confirmado');
});

it('preserva pendência anterior se repetição for negada', async () => {
  const criar = vi
    .fn()
    .mockRejectedValueOnce(new Error('rede'))
    .mockRejectedValueOnce(new FalhaApi('sem_permissao', 403));
  const { raiz, enviar } = preparar(criar);
  enviar();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Resultado não confirmado'));
  enviar();
  await vi.waitFor(() => expect(criar).toHaveBeenCalledTimes(2));
  expect(raiz.querySelector('fieldset')?.disabled).toBe(true);
  expect(criar.mock.calls[1]).toEqual(criar.mock.calls[0]);
});

it('bloqueia reconciliação ao receber conflito de idempotência', async () => {
  const criar = vi.fn().mockRejectedValue(new FalhaApi('conflito_idempotencia', 409));
  const { raiz, enviar } = preparar(criar);
  enviar();
  await vi.waitFor(() =>
    expect(raiz.textContent).toContain('Identificação da operação já utilizada'),
  );
  expect(raiz.querySelector('fieldset')?.disabled).toBe(true);
  expect(raiz.querySelector('button')?.disabled).toBe(true);
  enviar();
  expect(criar).toHaveBeenCalledTimes(1);
});

it('não repete solicitação incerta após troca de sessão', async () => {
  let sessao = 'original';
  const criar = vi.fn().mockRejectedValue(new Error('rede'));
  const { raiz, enviar } = preparar(criar, () => ({ usuario_id: 'ator', session_id: sessao }));
  enviar();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Resultado não confirmado'));
  sessao = 'outra';
  enviar();
  expect(raiz.textContent).toContain('Sessão alterada');
  expect(criar).toHaveBeenCalledTimes(1);
  expect(raiz.querySelector('button')?.disabled).toBe(true);
});
