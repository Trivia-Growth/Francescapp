// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { createElement, type ComponentProps } from 'react';
import { render } from '@testing-library/react';
import { TelaAdministracaoPlano } from './campo-extra-plano-administracao.js';
import type { ServicoPlanoCuidado } from './plano-cuidado.js';
import { ClienteFFCM, FalhaApi } from './api.ts';
import { clienteConsultas, esquecerConsultas } from './consultas.js';

// O cache de leitura é um módulo único: cada teste começa com ele vazio.
beforeEach(() => esquecerConsultas());

function montarAdministracaoPlano(
  raiz: HTMLElement,
  servico: ComponentProps<typeof TelaAdministracaoPlano>['servico'],
  acessoPerdido: ComponentProps<typeof TelaAdministracaoPlano>['acessoPerdido'],
  consultarEquipe: ComponentProps<typeof TelaAdministracaoPlano>['consultarEquipe'],
) {
  return render(
    createElement(TelaAdministracaoPlano, { servico, acessoPerdido, consultarEquipe }),
    { container: raiz },
  ).unmount;
}

const id = 'a0000000-0000-4000-8000-000000000001';
function servico() {
  return {
    identidade: { usuario_id: id, session_id: id },
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

/* Fatia 9b (28/11/2026), política A, a mesma da Equipe: o catálogo, quem aprova e a equipe
 * ficam guardados por até 60 s; a volta mostra o guardado no primeiro quadro e relê. Nada
 * sobrevive à identidade, à recusa ou à gravação. */
const outra = 'b0000000-0000-4000-8000-00000000000b';
const campoDe = (nome: string) => ({
  campo_id: 'c0000000-0000-4000-8000-000000000001',
  nome,
  tipo: 'texto' as const,
  opcoes: null,
  ativo: true,
  versao: 1,
});
function servicoCom(consultarCatalogo: ReturnType<typeof vi.fn>, conta = id) {
  return { ...servico(), identidade: { usuario_id: conta, session_id: conta }, consultarCatalogo };
}
const equipeVazia = () => Promise.resolve([]);
const chaves = () =>
  clienteConsultas
    .getQueryCache()
    .getAll()
    .map((q) => q.queryKey);
const guardado = () =>
  vi.waitFor(() => expect(clienteConsultas.getQueryCache().getAll()[0]?.state.data).toBeDefined());

it('volta ao Plano de cuidado: o guardado aparece no primeiro quadro e é relido', async () => {
  const consultar = vi
    .fn()
    .mockResolvedValueOnce([campoDe('Campo antes')])
    .mockResolvedValueOnce([campoDe('Campo depois')]);
  const api = servicoCom(consultar);
  montarAdministracaoPlano(document.createElement('div'), api, vi.fn(), equipeVazia)();
  await guardado();
  const volta = document.createElement('div');
  const desmontar = montarAdministracaoPlano(volta, api, vi.fn(), equipeVazia);
  expect(volta.textContent).toContain('Campo antes');
  await vi.waitFor(() => expect(volta.textContent).toContain('Campo depois'));
  expect(consultar).toHaveBeenCalledTimes(2);
  desmontar();
});

it('revogação: a sessão esquecida pela API leva o guardado', async () => {
  const api = servicoCom(vi.fn().mockResolvedValue([campoDe('Campo antes')]));
  montarAdministracaoPlano(document.createElement('div'), api, vi.fn(), equipeVazia)();
  await guardado();
  new ClienteFFCM().limpar();
  const volta = document.createElement('div');
  const desmontar = montarAdministracaoPlano(volta, api, vi.fn(), equipeVazia);
  expect(volta.textContent).not.toContain('Campo antes');
  await vi.waitFor(() => expect(volta.textContent).toContain('Campo antes'));
  desmontar();
});

it('negativo: 403 na releitura da volta esvazia a tela e descarta o guardado', async () => {
  const consultar = vi
    .fn()
    .mockResolvedValueOnce([campoDe('Campo antes')])
    .mockRejectedValueOnce(new FalhaApi('sem_permissao', 403));
  const api = servicoCom(consultar);
  montarAdministracaoPlano(document.createElement('div'), api, vi.fn(), equipeVazia)();
  await guardado();
  const volta = document.createElement('div');
  const perdido = vi.fn();
  montarAdministracaoPlano(volta, api, perdido, equipeVazia);
  await vi.waitFor(() => expect(perdido).toHaveBeenCalledOnce());
  expect(volta.textContent).toBe('');
  expect(chaves()).toHaveLength(0);
});

it('troca de conta: a conta nova não vê o guardado da anterior', async () => {
  montarAdministracaoPlano(
    document.createElement('div'),
    servicoCom(vi.fn().mockResolvedValue([campoDe('Da conta A')])),
    vi.fn(),
    equipeVazia,
  )();
  await guardado();
  const raiz = document.createElement('div');
  const desmontar = montarAdministracaoPlano(
    raiz,
    servicoCom(vi.fn().mockResolvedValue([campoDe('Da conta B')]), outra),
    vi.fn(),
    equipeVazia,
  );
  expect(raiz.textContent).not.toContain('Da conta A');
  await vi.waitFor(() => expect(raiz.textContent).toContain('Da conta B'));
  expect(chaves()).toEqual([['sessao', outra, outra, 'admin', 'plano-cuidado']]);
  desmontar();
});

it('resposta atrasada da conta anterior é descartada', async () => {
  let resolver!: (valor: unknown) => void;
  const atrasada = new Promise((r) => {
    resolver = r;
  });
  montarAdministracaoPlano(
    document.createElement('div'),
    servicoCom(vi.fn().mockReturnValue(atrasada)),
    vi.fn(),
    equipeVazia,
  )();
  const raiz = document.createElement('div');
  const desmontar = montarAdministracaoPlano(
    raiz,
    servicoCom(vi.fn().mockResolvedValue([campoDe('Da conta B')]), outra),
    vi.fn(),
    equipeVazia,
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('Da conta B'));
  resolver([campoDe('Da conta A')]);
  await new Promise((r) => setTimeout(r, 0));
  expect(raiz.textContent).not.toContain('Da conta A');
  expect(chaves()).toEqual([['sessao', outra, outra, 'admin', 'plano-cuidado']]);
  desmontar();
});
