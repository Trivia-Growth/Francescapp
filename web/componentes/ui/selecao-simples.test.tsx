// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import usuario from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { SelecaoSimples } from './selecao-simples.js';

afterEach(cleanup);

function montar(props: Record<string, unknown> = {}) {
  return render(
    <SelecaoSimples id="perfil" rotulo="Perfil" {...props}>
      <option value="">Selecione…</option>
      <option value="cuidadora">Cuidadora</option>
      <option value="administrador">Administrador</option>
    </SelecaoSimples>,
  );
}

it('é o select nativo, dono do valor e na ordem de tabulação', async () => {
  montar();
  const controle = screen.getByLabelText('Perfil') as HTMLSelectElement;
  expect(controle.tagName).toBe('SELECT');
  expect(controle.getAttribute('aria-hidden')).toBeNull();
  expect(controle.tabIndex).toBe(0);
  await usuario.selectOptions(controle, 'cuidadora');
  expect(controle.value).toBe('cuidadora');
});

it('o valor escolhido chega ao formulário que será enviado', async () => {
  render(
    <form aria-label="cadastro">
      <SelecaoSimples id="perfil" rotulo="Perfil" name="perfil" defaultValue="">
        <option value="">Selecione…</option>
        <option value="cuidadora">Cuidadora</option>
      </SelecaoSimples>
    </form>,
  );
  await usuario.selectOptions(screen.getByLabelText('Perfil'), 'cuidadora');
  const formulario = screen.getByRole('form') as HTMLFormElement;
  expect(new FormData(formulario).get('perfil')).toBe('cuidadora');
});

it('dispara change ao escolher', async () => {
  const aoMudar = vi.fn();
  montar({ onChange: aoMudar, defaultValue: '' });
  await usuario.selectOptions(screen.getByLabelText('Perfil'), 'administrador');
  expect(aoMudar).toHaveBeenCalledTimes(1);
});

it('usa as medidas do campo e o alvo de toque do controle padrão', () => {
  montar();
  const classes = screen.getByLabelText('Perfil').className;
  expect(classes).toContain('min-h-controle-md');
  expect(classes).toContain('rounded-campo');
  expect(classes).toContain('border-borda-forte');
  expect(classes).toContain('--texto-2');
  expect(classes).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
});

it('mantém a seta do navegador: não há appearance-none sem reposição', () => {
  montar();
  expect(screen.getByLabelText('Perfil').className).not.toContain('appearance-none');
});

it('dica e erro são descritos juntos, e o nó do erro existe sempre', () => {
  const { rerender } = montar({ dica: 'Define o que a pessoa pode ver.' });
  const controle = screen.getByLabelText('Perfil');
  expect(controle.getAttribute('aria-describedby')).toBe('perfil-dica perfil-erro');
  const no = document.getElementById('perfil-erro');
  expect(no?.textContent).toBe('');
  rerender(
    <SelecaoSimples
      id="perfil"
      rotulo="Perfil"
      dica="Define o que a pessoa pode ver."
      erro="Escolha um perfil."
    >
      <option value="">Selecione…</option>
    </SelecaoSimples>,
  );
  expect(document.getElementById('perfil-erro')).toBe(no);
  expect(no?.textContent).toBe('Escolha um perfil.');
  expect(controle.getAttribute('aria-invalid')).toBe('true');
});

it('desabilitado não muda de valor e recua por token', async () => {
  montar({ disabled: true, defaultValue: '' });
  const controle = screen.getByLabelText('Perfil') as HTMLSelectElement;
  await usuario.click(controle);
  expect(controle.value).toBe('');
  expect(controle.disabled).toBe(true);
  expect(controle.className).toContain('disabled:bg-superficie-3');
});

it('não anula o foco visível global', async () => {
  montar();
  const controle = screen.getByLabelText('Perfil');
  expect(controle.className).not.toMatch(/outline-none|ring-0|focus:outline-0/);
  await usuario.tab();
  expect(document.activeElement).toBe(controle);
});
