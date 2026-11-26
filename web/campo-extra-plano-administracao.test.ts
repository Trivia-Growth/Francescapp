// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { montarAdministracaoPlano } from './campo-extra-plano-administracao.js';
import type { ServicoPlanoCuidado } from './plano-cuidado.js';
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
/* Reescrito em 25/11/2026 na migração para React. A versão anterior pegava o formulário
 * do aprovador por POSIÇÃO — `raiz.querySelectorAll('form')[1]` — o que só funcionava
 * porque os dois assuntos da tela ficavam empilhados na mesma rolagem. Agora cada assunto
 * tem sua aba, e a posição deixou de ser um fato sobre o comportamento. O que a prova
 * verifica é o mesmo: campo global criado e aprovador indicado pelo nome, com a mesma
 * entrada chegando ao serviço. */
function abrirAba(raiz: HTMLElement, nome: string): void {
  const aba = [...raiz.querySelectorAll('[role="tab"]')].find((item) =>
    item.textContent?.startsWith(nome),
  );
  if (!(aba instanceof HTMLElement)) throw new Error(`Aba ausente: ${nome}`);
  // A aba responde ao apontador, não ao `click()` sintético do jsdom: é `mousedown` que
  // troca o painel, do mesmo jeito que o dedo e o mouse fazem na tela.
  aba.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  aba.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
}

function formularioDe(raiz: HTMLElement, acao: string): HTMLFormElement {
  const botao = [...raiz.querySelectorAll('button')].find((item) => item.textContent === acao);
  const form = botao?.closest('form');
  if (!form) throw new Error(`Formulário ausente: ${acao}`);
  return form;
}

it('cria campo global e indica aprovador selecionado pelo nome', async () => {
  const raiz = document.createElement('div');
  const api = servico();
  montarAdministracaoPlano(raiz, api, vi.fn(), async () => [
    { usuario_id: id, rotulo: 'Profissional fictício', ativo: true },
  ]);
  await vi.waitFor(() => expect(raiz.textContent).toContain('Catálogo e aprovadores atualizados'));
  const novoCampo = formularioDe(raiz, 'Criar campo');
  const nome = novoCampo.querySelector('input');
  if (!nome) throw new Error('Nome ausente');
  nome.value = 'Campo fictício';
  novoCampo.requestSubmit();
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
  abrirAba(raiz, 'Aprovadores');
  await vi.waitFor(() => expect(raiz.querySelector(`select option[value="${id}"]`)).not.toBeNull());
  await vi.waitFor(() =>
    expect(formularioDe(raiz, 'Indicar aprovador').querySelector('fieldset')?.disabled).toBe(false),
  );
  const indicacao = formularioDe(raiz, 'Indicar aprovador');
  const select = indicacao.querySelector('select');
  if (!select) throw new Error('Equipe ausente');
  select.value = id;
  indicacao.requestSubmit();
  await vi.waitFor(() =>
    expect(api.gravarAprovador).toHaveBeenCalledWith(
      { usuario_id_aprovador: id, ativo: true, versao_esperada: 0 },
      expect.any(String),
    ),
  );
});

/* O ganho que o solicitante pediu em 24/11/2026: *"clicando nas abas um loading para
 * montar a página, horrível"*. Trocar de aba não pode remontar a tela nem refazer a
 * consulta — os dois assuntos leem os mesmos dados já carregados. A prova é a IDENTIDADE
 * DO NÓ do título: se a moldura fosse remontada, o `h2` seria outro elemento. */
it('trocar de aba preserva a moldura e não refaz a consulta', async () => {
  const raiz = document.createElement('div');
  const api = servico();
  montarAdministracaoPlano(raiz, api, vi.fn(), async () => [
    { usuario_id: id, rotulo: 'Profissional fictício', ativo: true },
  ]);
  await vi.waitFor(() => expect(raiz.textContent).toContain('Catálogo e aprovadores atualizados'));
  const titulo = raiz.querySelector('h2');
  const faixa = raiz.querySelector('[role="tablist"]');
  expect(titulo?.textContent).toBe('Plano de cuidado — administração');
  const consultas = api.consultarCatalogo.mock.calls.length;

  abrirAba(raiz, 'Aprovadores');
  await vi.waitFor(() => expect(raiz.textContent).toContain('Indicar aprovador'));
  expect(raiz.querySelector('h2')).toBe(titulo);
  expect(raiz.querySelector('[role="tablist"]')).toBe(faixa);
  expect(raiz.querySelector('[aria-busy="true"]')).toBeNull();

  abrirAba(raiz, 'Campos adicionais');
  await vi.waitFor(() => expect(raiz.textContent).toContain('Novo campo adicional'));
  expect(raiz.querySelector('h2')).toBe(titulo);
  expect(raiz.querySelector('[aria-busy="true"]')).toBeNull();
  expect(api.consultarCatalogo).toHaveBeenCalledTimes(consultas);
  expect(api.consultarAprovadores).toHaveBeenCalledTimes(consultas);
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
