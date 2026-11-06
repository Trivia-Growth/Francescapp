// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { montarSelecaoProfissional } from './selecao-profissional.ts';
import type { ClienteFFCM } from './api.ts';

it('mostra vínculos retornados e mantém concessão bloqueada', async () => {
  const raiz = document.createElement('div');
  const api = {
    listarProfissionais: vi.fn().mockResolvedValue({
      itens: [
        {
          perfil: 'profissional',
          estado: 'vinculada',
          ativo: true,
          usuario_id: 'profissional-ficticio',
          email: 'pessoa@example.test',
        },
      ],
      proximo_cursor: null,
    }),
    listarVinculosProfissionais: vi.fn().mockResolvedValue({
      itens: [{ id: 'a', usuario_id: 'profissional-ficticio', revogado: false, versao: 1 }],
      proximo_cursor: null,
    }),
  } as unknown as ClienteFFCM;
  montarSelecaoProfissional(raiz, 'paciente-ficticio', api, () => false);
  await vi.waitFor(() => expect(raiz.textContent).toContain('pessoa@example.test'));
  expect(raiz.textContent).not.toContain('profissional-ficticio');
  expect(api.listarVinculosProfissionais).toHaveBeenCalledWith('paciente-ficticio', undefined);
  expect(
    [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Conceder acesso')?.disabled,
  ).toBe(true);
});

it('não expõe identificador quando profissional não consta na página consultada', async () => {
  const raiz = document.createElement('div');
  const api = {
    listarProfissionais: vi.fn().mockResolvedValue({ itens: [], proximo_cursor: null }),
    listarVinculosProfissionais: vi.fn().mockResolvedValue({
      itens: [
        {
          id: 'vinculo-ficticio',
          usuario_id: 'profissional-ficticio',
          revogado: false,
          versao: 1,
        },
      ],
      proximo_cursor: null,
    }),
  } as unknown as ClienteFFCM;
  montarSelecaoProfissional(raiz, 'paciente-ficticio', api, () => false);
  await vi.waitFor(() =>
    expect(raiz.textContent).toContain('Identificação indisponível nesta página'),
  );
  expect(raiz.textContent).not.toContain('profissional-ficticio');
});

it('identifica profissional de concessão revogada sem oferecê-lo para concessão', async () => {
  const raiz = document.createElement('div');
  const api = {
    listarProfissionais: vi.fn().mockResolvedValue({
      itens: [
        {
          perfil: 'profissional',
          estado: 'revogada',
          ativo: false,
          usuario_id: 'profissional-revogado',
          email: 'historico@example.test',
        },
      ],
      proximo_cursor: null,
    }),
    listarVinculosProfissionais: vi.fn().mockResolvedValue({
      itens: [{ id: 'vinculo', usuario_id: 'profissional-revogado', revogado: true, versao: 2 }],
      proximo_cursor: null,
    }),
  } as unknown as ClienteFFCM;
  montarSelecaoProfissional(raiz, 'paciente-ficticio', api, () => false);
  await vi.waitFor(() => expect(raiz.textContent).toContain('historico@example.test · Revogado'));
  expect(
    [...raiz.querySelectorAll('option')].some((opcao) => opcao.value === 'profissional-revogado'),
  ).toBe(false);
});
