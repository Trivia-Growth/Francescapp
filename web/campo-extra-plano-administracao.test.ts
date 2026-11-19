// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { montarAdministracaoPlano } from './campo-extra-plano-administracao.ts';
import type { ServicoPlanoCuidado } from './plano-cuidado.ts';
import { FalhaApi } from './api.ts';
const id = 'a0000000-0000-4000-8000-000000000001';
function servico() {
  return {
    consultarCatalogo: vi.fn().mockResolvedValue([]),
    consultarAprovadores: vi.fn().mockResolvedValue([]),
    gravarCampoExtra: vi.fn().mockResolvedValue(undefined),
    gravarAprovador: vi.fn().mockResolvedValue(undefined),
    consultarObjetivos: vi.fn(),
    consultarHistorico: vi.fn(),
    revisarObjetivo: vi.fn(),
    ciclo: {} as ServicoPlanoCuidado['ciclo'],
  };
}
it('cria campo global e indica aprovador selecionado pelo nome', async () => {
  const raiz = document.createElement('div');
  const api = servico();
  montarAdministracaoPlano(raiz, api, vi.fn(), async () => [
    { usuario_id: id, rotulo: 'Profissional fictício', ativo: true },
  ]);
  await vi.waitFor(() => expect(raiz.textContent).toContain('Catálogo e aprovadores atualizados'));
  const forms = raiz.querySelectorAll('form');
  const nome = forms[0]?.querySelector('input');
  if (!nome) throw new Error('Nome ausente');
  nome.value = 'Campo fictício';
  forms[0]?.requestSubmit();
  await vi.waitFor(() =>
    expect(api.gravarCampoExtra).toHaveBeenCalledWith(
      expect.objectContaining({
        nome: 'Campo fictício',
        tipo: 'texto',
        opcoes: null,
        ativo: true,
        versao_esperada: 0,
      }),
      expect.any(String),
    ),
  );
  await vi.waitFor(() => expect(raiz.querySelector(`select option[value="${id}"]`)).not.toBeNull());
  const novoForm = raiz.querySelectorAll('form')[1];
  const select = novoForm?.querySelector('select');
  if (!select) throw new Error('Equipe ausente');
  select.value = id;
  novoForm?.requestSubmit();
  await vi.waitFor(() =>
    expect(api.gravarAprovador).toHaveBeenCalledWith(
      { usuario_id_aprovador: id, ativo: true, versao_esperada: 0 },
      expect.any(String),
    ),
  );
});
it('falha de autorização limpa conteúdo administrativo e comunica perda de acesso', async () => {
  const raiz = document.createElement('div');
  const api = servico();
  const perdido = vi.fn();
  api.consultarCatalogo.mockRejectedValue(new FalhaApi('sem_permissao', 403));
  montarAdministracaoPlano(raiz, api, perdido, async () => []);
  await vi.waitFor(() => expect(perdido).toHaveBeenCalledOnce());
  expect(raiz.childElementCount).toBe(0);
});
it('lista com mais de 20 opções não dispara gravação', async () => {
  const raiz = document.createElement('div');
  const api = servico();
  montarAdministracaoPlano(raiz, api, vi.fn(), async () => []);
  await vi.waitFor(() => expect(raiz.querySelector('form')).not.toBeNull());
  const form = raiz.querySelector('form');
  const nome = form?.querySelector('input');
  const tipo = form?.querySelector('select');
  const opcoes = form?.querySelector('textarea');
  if (!nome || !tipo || !opcoes) throw new Error('Campos ausentes');
  nome.value = 'Lista fictícia';
  tipo.value = 'lista';
  tipo.dispatchEvent(new Event('change'));
  opcoes.value = Array.from({ length: 21 }, (_, i) => `Opção ${i}`).join('\n');
  form?.requestSubmit();
  expect(api.gravarCampoExtra).not.toHaveBeenCalled();
  expect(raiz.textContent).toContain('Confira nome, tipo e opções');
});

it('timeout seguido de lista anterior ao commit repete mesmo campo e chave sem criar outro', async () => {
  const raiz = document.createElement('div');
  const api = servico();
  api.gravarCampoExtra
    .mockRejectedValueOnce(new FalhaApi('pendencia_externa', 0, true))
    .mockResolvedValueOnce(undefined);
  montarAdministracaoPlano(raiz, api, vi.fn(), async () => []);
  await vi.waitFor(() => expect(raiz.querySelector('form')).not.toBeNull());
  const form = raiz.querySelector('form');
  const nome = form?.querySelector('input');
  if (!nome) throw new Error('Nome ausente');
  nome.value = 'Campo único';
  form?.requestSubmit();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Resultado aguardando confirmação'));
  const original = structuredClone(api.gravarCampoExtra.mock.calls[0]);
  expect(
    [...raiz.querySelectorAll('button')].find(
      (item) => item.textContent === 'Repetir exatamente o envio conferido',
    )?.disabled,
  ).toBe(true);
  [...raiz.querySelectorAll('button')]
    .find((item) => item.textContent === 'Atualizar catálogo e aprovadores')
    ?.click();
  await vi.waitFor(() =>
    expect(
      [...raiz.querySelectorAll('button')].find(
        (item) => item.textContent === 'Repetir exatamente o envio conferido',
      )?.disabled,
    ).toBe(false),
  );
  // Lista ainda vazia é estado anterior ao commit, não prova de rollback.
  expect(api.gravarCampoExtra).toHaveBeenCalledTimes(1);
  const novoNome = raiz.querySelector('form input');
  expect(
    (novoNome as HTMLInputElement).disabled ||
      (novoNome?.closest('fieldset') as HTMLFieldSetElement).disabled,
  ).toBe(true);
  [...raiz.querySelectorAll('button')]
    .find((item) => item.textContent === 'Repetir exatamente o envio conferido')
    ?.click();
  await vi.waitFor(() => expect(api.gravarCampoExtra).toHaveBeenCalledTimes(2));
  expect(api.gravarCampoExtra.mock.calls[1]).toEqual(original);
});
