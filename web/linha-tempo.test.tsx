// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { createElement, type ComponentProps } from 'react';
import { fireEvent } from '@testing-library/dom';
import { afterEach, expect, it, vi } from 'vitest';
import type { ItemLinhaTempo, LinhaTempo } from '../packages/contracts/src/linha-tempo.js';
import { FalhaApi } from './api.js';
import { TelaLinhaTempo, type ServicoLinhaTempo } from './linha-tempo.js';

function montarLinhaTempo(
  raiz: HTMLElement,
  pacienteId: ComponentProps<typeof TelaLinhaTempo>['pacienteId'],
  servico: ComponentProps<typeof TelaLinhaTempo>['servico'],
  acessoPerdido: ComponentProps<typeof TelaLinhaTempo>['acessoPerdido'],
) {
  const painel = render(createElement(TelaLinhaTempo, { pacienteId, servico, acessoPerdido }), {
    container: raiz,
  });
  return () => painel.rerender(null);
}

const pacienteId = '10000000-0000-4000-8000-000000000001';

function item(parcial: Partial<ItemLinhaTempo> = {}): ItemLinhaTempo {
  return {
    id: crypto.randomUUID(),
    fonte: 'diario',
    subtipo: null,
    tipo_evento: 'registro',
    registrado_em: '2026-11-20T12:00:00Z',
    aconteceu_em: '2026-11-19',
    autor_usuario_id: null,
    audiencia: 'equipe',
    versao: 1,
    registro_id: crypto.randomUUID(),
    objetivo_id: null,
    area: null,
    detalhe: {},
    ...parcial,
  };
}

let desmontar: (() => void) | undefined;
afterEach(() => {
  desmontar?.();
  desmontar = undefined;
  vi.restoreAllMocks();
});

function montar(consultar: ServicoLinhaTempo['consultar'], acessoPerdido = vi.fn()) {
  const raiz = document.createElement('div');
  desmontar = montarLinhaTempo(raiz, pacienteId, { consultar }, acessoPerdido);
  return { raiz, acessoPerdido };
}

/** Acha o controle pelo rótulo, seguindo `for`/`id` — não pela posição no DOM. */
function campo(raiz: HTMLElement, nome: string) {
  const label = [...raiz.querySelectorAll('label')].find((item) =>
    item.textContent?.startsWith(nome),
  );
  const controle = label?.htmlFor
    ? raiz.querySelector<HTMLInputElement | HTMLSelectElement>(`#${label.htmlFor}`)
    : null;
  if (!controle) throw new Error('Campo ausente');
  return controle;
}

const linhas = (raiz: HTMLElement) => [...raiz.querySelectorAll('ol > li')];

function botao(raiz: HTMLElement, texto: string) {
  const achado = [...raiz.querySelectorAll('button')].find((b) => b.textContent?.startsWith(texto));
  if (!achado) throw new Error('Ação ausente');
  return achado;
}

it('consulta ao montar, mostra os itens e "Carregar mais" pagina pelo cursor mantendo os já exibidos', async () => {
  const cursor = { registrado_em: '2026-11-20T12:00:00Z', id: crypto.randomUUID() };
  const primeira: LinhaTempo = {
    paciente_id: pacienteId,
    papel: 'colaborador',
    itens: [item({ area: 'Saúde' })],
    proximo_cursor: cursor,
  };
  const segunda: LinhaTempo = {
    paciente_id: pacienteId,
    papel: 'colaborador',
    itens: [item({ fonte: 'tarefa', tipo_evento: 'atualizacao' })],
    proximo_cursor: null,
  };
  const consultar = vi.fn().mockResolvedValueOnce(primeira).mockResolvedValueOnce(segunda);
  const { raiz } = montar(consultar);

  await vi.waitFor(() => expect(raiz.textContent).toContain('1 registros.'));
  expect(linhas(raiz)).toHaveLength(1);
  expect(botao(raiz, 'Carregar mais').hidden).toBe(false);

  botao(raiz, 'Carregar mais').click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('2 registros.'));
  expect(linhas(raiz)).toHaveLength(2);
  // Sem próximo cursor na segunda página, o botão volta a ficar escondido.
  expect(botao(raiz, 'Carregar mais').hidden).toBe(true);
  expect(consultar).toHaveBeenCalledTimes(2);
  expect(consultar.mock.calls[1]?.[1]).toMatchObject({
    cursor_em: cursor.registrado_em,
    cursor_id: cursor.id,
  });
});

it('trocar o filtro de tipo descarta o cursor acumulado e refaz a consulta do zero', async () => {
  const semFiltro: LinhaTempo = {
    paciente_id: pacienteId,
    papel: 'colaborador',
    itens: [item()],
    proximo_cursor: { registrado_em: '2026-11-20T12:00:00Z', id: crypto.randomUUID() },
  };
  const comFiltro: LinhaTempo = {
    paciente_id: pacienteId,
    papel: 'colaborador',
    itens: [item({ fonte: 'tarefa' })],
    proximo_cursor: null,
  };
  const consultar = vi.fn().mockResolvedValueOnce(semFiltro).mockResolvedValueOnce(comFiltro);
  const { raiz } = montar(consultar);
  await vi.waitFor(() => expect(raiz.textContent).toContain('1 registros.'));

  fireEvent.change(campo(raiz, 'Tipo de registro'), { target: { value: 'tarefa' } });
  await vi.waitFor(() => expect(consultar).toHaveBeenCalledTimes(2));
  // O cursor da consulta anterior não vaza para a consulta filtrada: ela recomeça do zero.
  expect(consultar.mock.calls[1]?.[1]).toEqual({ fontes: ['tarefa'] });
});

it('nenhum registro, sem falha, mostra o estado vazio — não texto cru nem serifado', async () => {
  const vazia: LinhaTempo = {
    paciente_id: pacienteId,
    papel: 'colaborador',
    itens: [],
    proximo_cursor: null,
  };
  const { raiz } = montar(vi.fn().mockResolvedValue(vazia));
  await vi.waitFor(() => expect(raiz.textContent).toContain('Nada registrado neste caso ainda.'));
  expect(linhas(raiz)).toHaveLength(0);
  const titulo = [...raiz.querySelectorAll('p')].find(
    (p) => p.textContent === 'Nada registrado neste caso ainda.',
  );
  expect(titulo?.className).not.toContain('font-serifada');
});

it('acesso perdido (401/403) só avisa acessoPerdido, sem mensagem de falha genérica no lugar', async () => {
  const acessoPerdido = vi.fn();
  const consultar = vi.fn().mockRejectedValueOnce(new FalhaApi('nao_autenticado', 401));
  const { raiz } = montar(consultar, acessoPerdido);

  await vi.waitFor(() => expect(acessoPerdido).toHaveBeenCalledTimes(1));
  expect(acessoPerdido.mock.calls[0]?.[0]).toBeInstanceOf(FalhaApi);
  expect(raiz.textContent).not.toContain('Serviço indisponível');
  // Autorização é do servidor: a tela só repassa o aviso, não tenta decidir ou repetir.
  expect(consultar).toHaveBeenCalledTimes(1);
});

it('falha sem revalidação mostra a mensagem do servidor e esvazia a lista, sem confundir com "nada registrado"', async () => {
  const consultar = vi.fn().mockRejectedValueOnce(new FalhaApi('servico_indisponivel', 503));
  const { raiz } = montar(consultar);

  await vi.waitFor(() =>
    expect(raiz.textContent).toContain('Serviço temporariamente indisponível.'),
  );
  expect(raiz.textContent).not.toContain('Nada registrado neste caso ainda.');
  expect(linhas(raiz)).toHaveLength(0);
});

it('desmontar durante uma consulta em voo não escreve mais nada na raiz', async () => {
  let resolver: ((valor: LinhaTempo) => void) | undefined;
  const consultar = vi.fn(
    () =>
      new Promise<LinhaTempo>((resolve) => {
        resolver = resolve;
      }),
  );
  const { raiz } = montar(consultar);
  desmontar?.();
  desmontar = undefined;
  resolver?.({
    paciente_id: pacienteId,
    papel: 'colaborador',
    itens: [item()],
    proximo_cursor: null,
  });
  // Drena a macrotarefa, não só microtarefas: é quando o React repintaria se a guarda de
  // geração/vida não tivesse impedido a escrita numa raiz já desmontada.
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(raiz.querySelector('section')).toBeNull();
  expect(raiz.textContent).toBe('');
});
