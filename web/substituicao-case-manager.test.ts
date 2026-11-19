// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { montarSubstituicaoCaseManager } from './substituicao-case-manager';
import { FalhaApi } from './api';
import type { PainelSubstituicao } from '../packages/contracts/src/substituicao-case-manager.ts';

const paciente = '40000000-0000-4000-8000-000000000001';
const titular = '10000000-0000-4000-8000-000000000001';
const substituta = '10000000-0000-4000-8000-000000000002';
const substituicao = '70000000-0000-4000-8000-000000000001';

const equipe = [
  { usuario_id: titular, rotulo: 'Titular Fictícia · Administrador', ativo: true },
  { usuario_id: substituta, rotulo: 'Substituta Fictícia · Profissional', ativo: true },
];

const vazio: PainelSubstituicao = {
  paciente_id: paciente,
  titular_usuario_id: titular,
  case_manager_atual_id: titular,
  vigente: null,
  substituicoes: [],
};

const comVigente: PainelSubstituicao = {
  paciente_id: paciente,
  titular_usuario_id: titular,
  case_manager_atual_id: substituta,
  vigente: {
    id: substituicao,
    substituto_usuario_id: substituta,
    inicio: '2026-11-19T09:00:00+00:00',
    fim: '2026-11-26T09:00:00+00:00',
  },
  substituicoes: [
    {
      id: substituicao,
      versao: 1,
      substituto_usuario_id: substituta,
      responsavel_usuario_id: titular,
      inicio: '2026-11-19T09:00:00+00:00',
      fim: '2026-11-26T09:00:00+00:00',
      encerrada_em: null,
      registrada_por_usuario_id: titular,
      criado_em: '2026-11-19T08:00:00+00:00',
    },
  ],
};

const montar = (servico: Parameters<typeof montarSubstituicaoCaseManager>[1]) => {
  const raiz = document.createElement('div');
  document.body.replaceChildren(raiz);
  const desmontar = montarSubstituicaoCaseManager(raiz, servico, { paciente_id: paciente, equipe });
  return { raiz, desmontar };
};

it('mostra carregamento, depois estado vazio sem esconder o formulário', async () => {
  let liberar!: (valor: PainelSubstituicao) => void;
  const servico = {
    consultar: vi.fn(
      () =>
        new Promise<PainelSubstituicao>((resolve) => {
          liberar = resolve;
        }),
    ),
    registrar: vi.fn(),
    encerrar: vi.fn(),
  };
  const { raiz } = montar(servico);
  expect(raiz.querySelector('.substituicao-cm__historico')?.getAttribute('aria-busy')).toBe('true');
  expect(raiz.querySelector('.list-loading')).not.toBeNull();
  liberar(vazio);
  await vi.waitFor(() =>
    expect(raiz.querySelector('.substituicao-cm__vazio')?.textContent).toContain(
      'Nenhuma substituição registrada',
    ),
  );
  expect(raiz.querySelector('.substituicao-cm__status')?.textContent).toBe(
    'Sem substituição vigente.',
  );
  // Esconder controle não é autorização: o botão continua visível e habilitado.
  expect(raiz.querySelector<HTMLButtonElement>('.button-primary')?.disabled).toBe(false);
});

it('diz quem é o titular, quem substitui e até quando', async () => {
  const servico = {
    consultar: vi.fn(async () => comVigente),
    registrar: vi.fn(),
    encerrar: vi.fn(),
  };
  const { raiz } = montar(servico);
  await vi.waitFor(() => expect(raiz.querySelectorAll('dd').length).toBe(3));
  const valores = [...raiz.querySelectorAll('dd')].map((no) => no.textContent ?? '');
  expect(valores[0]).toContain('Titular Fictícia');
  expect(valores[1]).toContain('Substituta Fictícia');
  expect(valores[2]).toContain('Substituta Fictícia');
  expect(valores[2]).toMatch(/até/);
  expect(raiz.textContent).toContain('não concede acesso ao conteúdo do caso');
});

it('registra substituição e repassa início e fim como instantes com fuso', async () => {
  const servico = {
    consultar: vi.fn(async () => vazio),
    registrar: vi.fn(async () => comVigente),
    encerrar: vi.fn(),
  };
  const { raiz } = montar(servico);
  await vi.waitFor(() => expect(raiz.querySelector('.substituicao-cm__vazio')).not.toBeNull());
  const escolha = raiz.querySelector<HTMLSelectElement>('select');
  const campos = raiz.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]');
  // O titular não aparece como opção: ninguém substitui a si mesmo.
  expect([...(escolha?.options ?? [])].map((opcao) => opcao.value)).toEqual(['', substituta]);
  if (escolha) escolha.value = substituta;
  campos[0]?.setAttribute('value', '2026-11-20T09:00');
  campos[1]?.setAttribute('value', '2026-11-27T09:00');
  raiz.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(servico.registrar).toHaveBeenCalledTimes(1));
  const [idEnviado, corpo] = servico.registrar.mock.calls[0] as [string, Record<string, string>];
  expect(idEnviado).toBe(paciente);
  expect(corpo.substituto_usuario_id).toBe(substituta);
  expect(corpo.inicio).toMatch(/Z$/);
  expect(Date.parse(corpo.fim)).toBeGreaterThan(Date.parse(corpo.inicio));
  await vi.waitFor(() =>
    expect(raiz.querySelector('.substituicao-cm__aviso')?.textContent).toBe(
      'Substituição registrada.',
    ),
  );
});

it('explica a recusa de período sobreposto em vez de falar em erro genérico', async () => {
  const servico = {
    consultar: vi.fn(async () => vazio),
    registrar: vi.fn(async () => {
      throw new FalhaApi('conflito', 409);
    }),
    encerrar: vi.fn(),
  };
  const { raiz } = montar(servico);
  await vi.waitFor(() => expect(raiz.querySelector('.substituicao-cm__vazio')).not.toBeNull());
  const escolha = raiz.querySelector<HTMLSelectElement>('select');
  const campos = raiz.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]');
  if (escolha) escolha.value = substituta;
  campos[0]?.setAttribute('value', '2026-11-20T09:00');
  campos[1]?.setAttribute('value', '2026-11-27T09:00');
  raiz.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(raiz.querySelector('.substituicao-cm__aviso')?.textContent).toContain(
      'Já existe substituição registrada para parte desse período',
    ),
  );
});

it('encerra a substituição vigente e devolve o caso ao titular', async () => {
  const servico = {
    consultar: vi.fn(async () => comVigente),
    registrar: vi.fn(),
    encerrar: vi.fn(async () => vazio),
  };
  const { raiz } = montar(servico);
  await vi.waitFor(() => expect(raiz.querySelector('.substituicao-cm__item')).not.toBeNull());
  raiz.querySelector<HTMLButtonElement>('.substituicao-cm__item .button-secondary')?.click();
  await vi.waitFor(() =>
    expect(servico.encerrar).toHaveBeenCalledWith(paciente, {
      substituicao_id: substituicao,
    }),
  );
  await vi.waitFor(() =>
    expect(raiz.querySelector('.substituicao-cm__aviso')?.textContent).toContain(
      'O titular volta a responder',
    ),
  );
  expect([...raiz.querySelectorAll('dd')][1]?.textContent).toContain('Titular Fictícia');
});

it('mostra erro de carregamento sem derrubar a seção', async () => {
  const servico = {
    consultar: vi.fn(async () => {
      throw new FalhaApi('servico_indisponivel');
    }),
    registrar: vi.fn(),
    encerrar: vi.fn(),
  };
  const { raiz } = montar(servico);
  await vi.waitFor(() =>
    expect(raiz.querySelector('.substituicao-cm__status')?.textContent).toContain(
      'Não foi possível carregar',
    ),
  );
  expect(raiz.querySelector('.substituicao-cm')).not.toBeNull();
});
