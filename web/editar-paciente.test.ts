// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { montarEdicaoPaciente } from './editar-paciente.js';
import { FalhaApi } from './api.js';

const paciente = {
  id: '00000000-0000-4000-8000-000000000001',
  nome: 'Paciente fictício',
  nome_preferencia: 'Nome anterior',
  data_nascimento: null,
  versao: 2,
  contatos: [],
};

async function preparar(atualizarPaciente: ReturnType<typeof vi.fn>, acessoPerdido = vi.fn()) {
  const raiz = document.createElement('div');
  montarEdicaoPaciente(
    raiz,
    paciente.id,
    {
      consultarPaciente: vi.fn().mockResolvedValue(paciente),
      atualizarPaciente,
    },
    acessoPerdido,
  );
  await vi.waitFor(() => expect(raiz.querySelector('form')).not.toBeNull());
  const campos = raiz.querySelectorAll('input');
  const preferencia = campos[1];
  const motivo = raiz.querySelector('textarea');
  if (!preferencia || !motivo) throw new Error('Campos ausentes');
  preferencia.value = '';
  motivo.value = 'Correção solicitada';
  raiz.querySelector('form')?.requestSubmit();
  return raiz;
}

it('preserva comando e chave após resposta incerta e confirma apenas por ação explícita', async () => {
  const atualizar = vi
    .fn()
    .mockRejectedValueOnce(new Error())
    .mockResolvedValue({ ...paciente, nome_preferencia: null, versao: 3 });
  const raiz = await preparar(atualizar);
  await vi.waitFor(() => expect(raiz.textContent).toContain('Não foi possível confirmar'));
  expect(atualizar).toHaveBeenCalledTimes(1);
  expect(atualizar.mock.calls[0]?.[1]).toEqual({
    nome_preferencia: null,
    versao_esperada: 2,
    motivo: 'Correção solicitada',
  });
  expect(raiz.querySelector('fieldset')?.disabled).toBe(true);
  [...raiz.querySelectorAll('button')]
    .find((botao) => botao.textContent === 'Tentar confirmar salvamento')
    ?.click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Cadastro atualizado.'));
  expect(atualizar.mock.calls[1]).toEqual(atualizar.mock.calls[0]);
});

it('mantém rascunho e impede sobrescrita após conflito', async () => {
  const atualizar = vi.fn().mockRejectedValue(new FalhaApi('conflito_versao', 409));
  const raiz = await preparar(atualizar);
  await vi.waitFor(() => expect(raiz.textContent).toContain('Copie seu rascunho'));
  expect(raiz.querySelector('textarea')?.value).toBe('Correção solicitada');
  expect(raiz.querySelectorAll('input')[1]?.value).toBe('');
  raiz.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(atualizar).toHaveBeenCalledTimes(1);
});

it('descarta dados após perda de acesso', async () => {
  const acessoPerdido = vi.fn();
  const raiz = await preparar(
    vi.fn().mockRejectedValue(new FalhaApi('sem_permissao', 403)),
    acessoPerdido,
  );
  await vi.waitFor(() => expect(acessoPerdido).toHaveBeenCalledOnce());
  expect(raiz.childElementCount).toBe(0);
});
