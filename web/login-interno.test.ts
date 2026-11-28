// @vitest-environment jsdom
// Credenciais fictícias, com Auth substituído por dublês.
import { readFileSync } from 'node:fs';
import { cleanup, render } from '@testing-library/react';
import { createElement, createRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ClienteFFCM } from './api.ts';
import { type ComandoLoginInterno, TelaLoginInterno } from './login-interno.js';
const otp = vi.hoisted(() => ({
  solicitar: vi.fn(),
  verificar: vi.fn(),
  cancelar: vi.fn(),
  desmontar: vi.fn(),
}));
vi.mock('./servico-acessos-http.ts', () => ({ criarServicoConfirmacaoInterna: () => otp }));
const id = '10000000-0000-4000-8000-000000000001';
const sessao = {
  session_id: id,
  usuario: { id, perfil: 'familia' as const, ativo: true, versao: 1 },
  capacidades: [],
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  document.body.replaceChildren();
});
function preparar() {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  const raiz = document.getElementById('acesso-interno');
  if (!raiz) throw new Error('Login ausente');
  const api = new ClienteFFCM();
  const aoEntrar = vi.fn(async () => {});
  const destino = document.createElement('div');
  raiz.append(destino);
  const comando = createRef<ComandoLoginInterno>();
  render(createElement(TelaLoginInterno, { api, aoEntrar, comando }), { container: destino });
  const controle = comando.current;
  if (!controle) throw new Error('Comando de limpeza do login indisponível.');
  const obter = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  return { api, aoEntrar, controle, obter };
}
it('descarta senha antes do envio e ignora entrada tardia depois de limpar tela', async () => {
  const p = preparar();
  let liberar!: (valor: typeof sessao) => void;
  const senha = p.obter<HTMLInputElement>('interno-senha');
  const entrar = vi.spyOn(p.api, 'entrarInterno').mockImplementation(async () => {
    expect(senha.value).toBe('');
    return new Promise((resolve) => {
      liberar = resolve;
    });
  });
  p.obter<HTMLInputElement>('interno-email').value = 'familiar@example.test';
  senha.value = 'senha-ficticia';
  p.obter('interno-login-form').dispatchEvent(new Event('submit', { cancelable: true }));
  expect(entrar).toHaveBeenCalledWith('familiar@example.test', 'senha-ficticia');
  expect(p.obter<HTMLFieldSetElement>('interno-login-fields').disabled).toBe(true);
  p.controle.limpar();
  liberar(sessao);
  await vi.waitFor(() =>
    expect(p.obter<HTMLFieldSetElement>('interno-login-fields').disabled).toBe(false),
  );
  expect(p.aoEntrar).not.toHaveBeenCalled();
  expect(senha.value).toBe('');
});
it('ack OTP limpa código antes da chamada e orienta login sem declarar e-mail confirmado', async () => {
  const p = preparar();
  const codigo = p.obter<HTMLInputElement>('interno-confirmacao-codigo');
  p.obter<HTMLInputElement>('interno-confirmacao-email').value = 'pessoa@example.test';
  codigo.value = '000000';
  p.obter<HTMLInputElement>('interno-senha').value = 'senha-ficticia';
  otp.verificar.mockImplementation(async () => {
    expect(codigo.value).toBe('');
    expect(p.obter<HTMLInputElement>('interno-senha').value).toBe('');
  });
  p.obter('interno-confirmacao-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(p.obter('interno-confirmacao-feedback').textContent).toContain('Se for válido'),
  );
  expect(otp.verificar).toHaveBeenCalledWith('pessoa@example.test', '000000');
  expect(p.aoEntrar).not.toHaveBeenCalled();
  expect(p.obter('interno-confirmacao-feedback').textContent).not.toContain('e-mail confirmado');
});
it('indisponibilidade do envio não anuncia entrega de código', async () => {
  const p = preparar();
  otp.solicitar.mockRejectedValueOnce(new Error('SMTP fictício indisponível'));
  p.obter<HTMLInputElement>('interno-confirmacao-email').value = 'pessoa@example.test';
  p.obter<HTMLButtonElement>('interno-confirmacao-solicitar').click();
  await vi.waitFor(() =>
    expect(p.obter('interno-confirmacao-feedback').textContent).toContain(
      'pode estar indisponível',
    ),
  );
  expect(p.obter('interno-confirmacao-feedback').textContent).not.toContain('código será enviado');
});
