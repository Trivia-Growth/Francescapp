// @vitest-environment jsdom
// PREPARADO, NÃO EXECUTADO. Provas locais não demonstram provisionamento Auth real.
import { fireEvent } from '@testing-library/dom';
import { afterEach, expect, it, vi } from 'vitest';
import { createElement, type ComponentProps } from 'react';
import { render } from '@testing-library/react';
import { TelaAcessos } from './acessos-administracao.js';
import { criarServicoAcessosHttp } from './servico-acessos-http.js';
import { FalhaApi } from './api.js';
import { criarErroPublicoSemCampos } from '../packages/contracts/src/erros.js';
import type { Acesso } from '../packages/contracts/src/acessos.js';

function montarAcessosAdministracao(
  raiz: HTMLElement,
  servico: ComponentProps<typeof TelaAcessos>['servico'],
  opcoes: ComponentProps<typeof TelaAcessos>['opcoes'],
) {
  return render(createElement(TelaAcessos, { servico, opcoes }), { container: raiz }).unmount;
}

const usuario = '10000000-0000-4000-8000-000000000001';
const sessao = '20000000-0000-4000-8000-000000000001';
const operacao = '30000000-0000-4000-8000-000000000001';
const acesso: Acesso = {
  operacao_id: operacao,
  usuario_id: null,
  nome: 'Pessoa fictícia',
  email: 'pessoa@example.test',
  funcao: 'case_manager',
  metodo: 'interno',
  estado: 'aguardando_confirmacao_email',
  criado_em: '2026-11-18T12:00:00Z',
  criado_por_usuario_id: usuario,
};
let desmontar: (() => void) | undefined;
afterEach(() => {
  desmontar?.();
  desmontar = undefined;
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function preparar(falhaLista = false) {
  const identidadeAtual = () => ({ usuario_id: usuario, session_id: sessao });
  const servico = criarServicoAcessosHttp(identidadeAtual);
  const listar = vi
    .spyOn(servico, 'listar')
    .mockResolvedValue({ itens: [acesso], proximo_cursor: null });
  if (falhaLista) listar.mockRejectedValueOnce(new FalhaApi('servico_indisponivel', 503));
  const criar = vi.spyOn(servico, 'criar').mockRejectedValue(new FalhaApi('pendencia_externa'));
  const consultar = vi.spyOn(servico, 'consultarOperacao').mockResolvedValue(acesso);
  const raiz = document.createElement('div');
  desmontar = montarAcessosAdministracao(raiz, servico, {
    identidadeAtual,
    acessoPerdido: vi.fn(),
  });
  return { raiz, criar, consultar, servico };
}
/* REESCRITO na migração para React (VIS-018 manda nomear).
 *
 * O auxiliar antigo procurava o controle DENTRO do `<label>`, porque a versão imperativa
 * aninhava um no outro. Isso é a forma do nó, não o comportamento: a camada de componente
 * põe rótulo e controle lado a lado, ligados por `for`/`id`, que é o que dá nome acessível
 * a um campo e o que um leitor de tela usa. O auxiliar passou a seguir essa ligação —
 * continua achando o campo "pelo rótulo", como a prova sempre quis, e agora sem depender
 * de quem é filho de quem. */
function campo(raiz: HTMLElement, nome: string) {
  const label = [...raiz.querySelectorAll('label')].find((item) =>
    item.textContent?.startsWith(nome),
  );
  const controle = label?.htmlFor
    ? raiz.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        `#${label.htmlFor}`,
      )
    : null;
  if (!controle) throw new Error('Campo ausente');
  return controle;
}

/* REESCRITO pelo mesmo motivo. Escrever `.value` e despachar um `Event` cru imita por fora
 * a implementação de um campo não controlado; `fireEvent` produz o evento que o navegador
 * produz quando alguém digita ou escolhe, e vale para campo controlado ou não. */
function preencher(raiz: HTMLElement, nome: string, valor: string) {
  const controle = campo(raiz, nome);
  fireEvent.change(controle, { target: { value: valor } });
  return controle;
}

function enviarFormulario(raiz: HTMLElement) {
  const formulario = raiz.querySelector('form');
  if (!formulario) throw new Error('Formulário ausente');
  fireEvent.submit(formulario);
}

/** A região da tela, que é quem declara `aria-busy`. Antes era a própria raiz recebida de
 *  `main.ts`; agora a raiz é só o hospedeiro da ilha e quem fala é o conteúdo. */
function regiao(raiz: HTMLElement) {
  const alvo = raiz.querySelector('[data-tela="acessos"]');
  if (!alvo) throw new Error('Região da tela ausente');
  return alvo;
}

/** As linhas da listagem pelo nome acessível que a tela publica, não pela forma do nó. */
const linhas = (raiz: HTMLElement) => [
  ...raiz.querySelectorAll('ul[aria-label="Acessos criados por esta administração"] > li'),
];
function botao(raiz: HTMLElement, texto: string) {
  const item = [...raiz.querySelectorAll('button')].find((b) => b.textContent === texto);
  if (!item) throw new Error('Ação ausente');
  return item;
}
it('limpa senha antes da chamada e cerca resposta perdida sem repetir escrita, inclusive após remontar', async () => {
  const p = preparar();
  await vi.waitFor(() => expect(p.raiz.textContent).toContain('Acessos consultados'));
  for (const [nome, valor] of [
    ['Nome', 'Pessoa fictícia'],
    ['E-mail', 'nova@example.test'],
    ['Função', 'case_manager'],
    ['Como', 'interno'],
    ['Motivo', 'Teste fictício'],
  ])
    preencher(p.raiz, nome, valor);
  const senha = preencher(p.raiz, 'Senha', 'senha-ficticia-sem-valor');
  p.criar.mockImplementation(async () => {
    expect(senha.value).toBe('');
    throw new FalhaApi('pendencia_externa');
  });
  enviarFormulario(p.raiz);
  await vi.waitFor(() => expect(p.raiz.textContent).toContain('Cadastro sem confirmação'));
  expect(p.criar).toHaveBeenCalledOnce();
  expect(p.raiz.querySelector('fieldset')?.disabled).toBe(true);
  expect(JSON.stringify({ ...sessionStorage })).not.toContain('senha-ficticia-sem-valor');
  enviarFormulario(p.raiz);
  expect(p.criar).toHaveBeenCalledOnce();
  const id = p.criar.mock.calls[0]?.[0].operacao_id;
  if (!id) throw new Error('Operação ausente');
  desmontar?.();
  const seguinte = preparar();
  seguinte.consultar.mockResolvedValue({ ...acesso, operacao_id: id });
  await vi.waitFor(() => expect(seguinte.raiz.textContent).toContain('cadastro pendente'));
  await vi.waitFor(() => expect(regiao(seguinte.raiz).getAttribute('aria-busy')).toBe('false'));
  expect(campo(seguinte.raiz, 'Senha').value).toBe('');
  botao(seguinte.raiz, 'Conferir cadastro pendente').click();
  await vi.waitFor(() =>
    expect(seguinte.raiz.textContent).toContain('Nenhuma senha foi reenviada'),
  );
  expect(seguinte.criar).not.toHaveBeenCalled();
  expect(seguinte.consultar).toHaveBeenCalledWith(id);
});
it('Google não envia senha e função não ganha valor padrão', async () => {
  const p = preparar();
  await vi.waitFor(() => expect(p.raiz.textContent).toContain('Acessos consultados'));
  expect(campo(p.raiz, 'Função').value).toBe('');
  preencher(p.raiz, 'Como', 'interno');
  preencher(p.raiz, 'Senha', 'senha-ficticia-sem-valor');
  preencher(p.raiz, 'Como', 'google_workspace');
  expect(campo(p.raiz, 'Senha').value).toBe('');
  expect(campo(p.raiz, 'Senha').disabled).toBe(true);
});
it('paginação consulta próximo cursor sem perder acessos anteriores', async () => {
  const p = preparar();
  await vi.waitFor(() => expect(p.raiz.textContent).toContain('Acessos consultados'));
  vi.mocked(p.servico.listar).mockResolvedValueOnce({ itens: [acesso], proximo_cursor: operacao });
  botao(p.raiz, 'Atualizar acessos').click();
  await vi.waitFor(() => expect(botao(p.raiz, 'Carregar mais acessos').hidden).toBe(false));
  vi.mocked(p.servico.listar).mockResolvedValueOnce({
    itens: [{ ...acesso, operacao_id: usuario, nome: 'Outra pessoa fictícia' }],
    proximo_cursor: null,
  });
  botao(p.raiz, 'Carregar mais acessos').click();
  await vi.waitFor(() => expect(p.raiz.textContent).toContain('Outra pessoa fictícia'));
  expect(p.raiz.textContent).toContain('Pessoa fictícia');
  expect(p.servico.listar).toHaveBeenLastCalledWith(operacao);
});
it('rejeição definitiva libera novo cadastro, mas GET nulo após incerteza não libera', async () => {
  const p = preparar();
  await vi.waitFor(() => expect(p.raiz.textContent).toContain('Acessos consultados'));
  for (const [nome, valor] of [
    ['Nome', 'Pessoa fictícia'],
    ['E-mail', 'nova@example.test'],
    ['Função', 'familia'],
    ['Como', 'google_workspace'],
    ['Motivo', 'Teste fictício'],
  ])
    preencher(p.raiz, nome, valor);
  p.criar.mockRejectedValueOnce(new FalhaApi('conflito', 409));
  enviarFormulario(p.raiz);
  await vi.waitFor(() => expect(p.raiz.textContent).toContain('Cadastro recusado'));
  expect(p.raiz.querySelector('fieldset')?.disabled).toBe(false);
  enviarFormulario(p.raiz);
  await vi.waitFor(() => expect(p.raiz.textContent).toContain('Cadastro sem confirmação'));
  p.consultar.mockResolvedValueOnce(null);
  botao(p.raiz, 'Conferir cadastro pendente').click();
  await vi.waitFor(() => expect(p.raiz.textContent).toContain('Resultado ainda não confirmado'));
  expect(p.raiz.querySelector('fieldset')?.disabled).toBe(true);
});
it('falha ao ler recuperação mantém criação fechada mesmo após listar', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('storage indisponível');
  });
  const p = preparar();
  await vi.waitFor(() => expect(p.raiz.textContent).toContain('Recuperação local indisponível'));
  expect(p.raiz.querySelector('fieldset')?.disabled).toBe(true);
});

it('lista indisponível não aceita cadastro nem conserva skeleton e só libera após consulta autorizada', async () => {
  const p = preparar(true);
  expect(p.raiz.querySelector('fieldset')?.disabled).toBe(true);
  await vi.waitFor(() => expect(p.raiz.textContent).toContain('Não foi possível consultar'));
  expect(p.raiz.querySelector('fieldset')?.disabled).toBe(true);
  // REESCRITO: contar filhos do primeiro `<ul>` era contar nós. A listagem tem nome
  // acessível, e é por ele que a prova a encontra agora.
  expect(linhas(p.raiz)).toHaveLength(0);
  enviarFormulario(p.raiz);
  expect(p.criar).not.toHaveBeenCalled();
  botao(p.raiz, 'Atualizar acessos').click();
  await vi.waitFor(() => expect(p.raiz.querySelector('fieldset')?.disabled).toBe(false));
});

// R-07: só um resultado terminal comprovado libera uma NOVA operação manual.
it.each(['reservado', 'falha_confirmada'] as const)(
  'recuperação %s não repete senha ou cadastro e respeita estado terminal',
  async (estado) => {
    const chave = `acesso-operacao:${usuario}:${sessao}`;
    sessionStorage.setItem(chave, operacao);
    const p = preparar();
    p.consultar.mockResolvedValueOnce({ ...acesso, estado });
    await vi.waitFor(() => expect(p.raiz.textContent).toContain('cadastro pendente'));
    await vi.waitFor(() => expect(regiao(p.raiz).getAttribute('aria-busy')).toBe('false'));
    expect(p.raiz.querySelector('fieldset')?.disabled).toBe(true);
    botao(p.raiz, 'Conferir cadastro pendente').click();
    await vi.waitFor(() =>
      expect(p.raiz.textContent).toContain(
        estado === 'falha_confirmada'
          ? 'Criação recusada; nenhuma conta criada'
          : 'Resultado ainda não confirmado',
      ),
    );
    expect(p.raiz.querySelector('fieldset')?.disabled).toBe(estado === 'reservado');
    expect(sessionStorage.getItem(chave)).toBe(estado === 'reservado' ? operacao : null);
    expect(campo(p.raiz, 'Senha').value).toBe('');
    expect(p.criar).not.toHaveBeenCalled();
    if (estado === 'falha_confirmada')
      expect(p.raiz.textContent).toContain('Confira a política da senha');
  },
);

it('recusa confirmada pela linha também encerra a pendência correspondente, sem novo POST', async () => {
  const chave = `acesso-operacao:${usuario}:${sessao}`;
  sessionStorage.setItem(chave, operacao);
  const p = preparar();
  p.consultar.mockResolvedValueOnce({ ...acesso, estado: 'falha_confirmada' });
  await vi.waitFor(() => expect(p.raiz.textContent).toContain('cadastro pendente'));
  await vi.waitFor(() => expect(regiao(p.raiz).getAttribute('aria-busy')).toBe('false'));
  botao(p.raiz, 'Conferir situação').click();
  await vi.waitFor(() =>
    expect(p.raiz.textContent).toContain('Criação recusada; nenhuma conta criada'),
  );
  expect(p.raiz.querySelector('fieldset')?.disabled).toBe(false);
  expect(sessionStorage.getItem(chave)).toBeNull();
  expect(p.criar).not.toHaveBeenCalled();
});
it('estado terminal de outra operação não descarta a pendência em recuperação', async () => {
  const chave = `acesso-operacao:${usuario}:${sessao}`;
  sessionStorage.setItem(chave, operacao);
  const p = preparar();
  p.consultar.mockResolvedValueOnce({
    ...acesso,
    operacao_id: usuario,
    estado: 'falha_confirmada',
  });
  await vi.waitFor(() => expect(p.raiz.textContent).toContain('cadastro pendente'));
  await vi.waitFor(() => expect(regiao(p.raiz).getAttribute('aria-busy')).toBe('false'));
  botao(p.raiz, 'Conferir cadastro pendente').click();
  await vi.waitFor(() => expect(p.raiz.textContent).toContain('Cadastro sem confirmação'));
  expect(p.raiz.querySelector('fieldset')?.disabled).toBe(true);
  expect(sessionStorage.getItem(chave)).toBe(operacao);
  expect(p.criar).not.toHaveBeenCalled();
});

// R-08: atravessa UI + serviço real; mocks de serviço ocultavam o terceiro
// argumento de FalhaApi e transformavam incerteza de rede em perda de sessão.
it.each([
  'transporte interrompido',
  'aceito 202',
  'pendência 503',
  'código/status contraditórios',
] as const)('mantém conferência na mesma sessão após %s', async (caso) => {
  sessionStorage.setItem('modo-acesso', 'interno');
  sessionStorage.setItem('fluxo-interno', 'a'.repeat(22));
  let op: string | undefined;
  let postagens = 0;
  let consultas = 0;
  vi.stubGlobal('fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') {
      postagens += 1;
      op = JSON.parse(String(init.body)).operacao_id;
      if (caso === 'transporte interrompido')
        throw new DOMException('Timeout fictício', 'AbortError');
      if (caso === 'aceito 202') return new Response(null, { status: 202 });
      return Response.json(
        criarErroPublicoSemCampos(
          caso === 'pendência 503' ? 'pendencia_externa' : 'entrada_invalida',
          usuario,
        ),
        { status: caso === 'pendência 503' ? 503 : 500 },
      );
    }
    if (String(url).includes('/operacoes/')) {
      consultas += 1;
      return Response.json({
        dados: { ...acesso, operacao_id: op, estado: 'reservado' },
        request_id: usuario,
      });
    }
    return Response.json({ dados: { itens: [acesso], proximo_cursor: null }, request_id: usuario });
  });
  const identidadeAtual = () => ({ usuario_id: usuario, session_id: sessao });
  const acessoPerdido = vi.fn();
  const raiz = document.createElement('div');
  desmontar = montarAcessosAdministracao(raiz, criarServicoAcessosHttp(identidadeAtual), {
    identidadeAtual,
    acessoPerdido,
  });
  await vi.waitFor(() => expect(raiz.textContent).toContain('Acessos consultados'));
  for (const [nome, valor] of [
    ['Nome', 'Pessoa fictícia'],
    ['E-mail', 'nova@example.test'],
    ['Função', 'familia'],
    ['Como', 'interno'],
    ['Motivo', 'Teste fictício'],
  ])
    preencher(raiz, nome, valor);
  preencher(raiz, 'Senha', 'senha-ficticia-sem-valor');
  enviarFormulario(raiz);
  await vi.waitFor(() => expect(raiz.textContent).toContain('Cadastro sem confirmação'));
  expect(acessoPerdido).not.toHaveBeenCalled();
  expect(raiz.querySelector('fieldset')?.disabled).toBe(true);
  expect(campo(raiz, 'Senha').value).toBe('');
  expect(postagens).toBe(1);
  botao(raiz, 'Conferir cadastro pendente').click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Resultado ainda não confirmado'));
  expect(consultas).toBe(1);
  expect(postagens).toBe(1);
  expect(acessoPerdido).not.toHaveBeenCalled();
});
