// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { montarSubstituicaoCaseManager } from './substituicao-case-manager.tsx';
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
      motivo: 'Titular em férias programadas.',
      motivo_encerramento: null,
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
    disponibilidade: vi.fn(async () => ({ disponivel: true })),
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
  // Procurado pelo rótulo, e não pela classe: o desenho do botão é da camada de
  // componente e pode mudar de nome; o que a prova guarda é que a ação continua ali.
  const registrar = [...raiz.querySelectorAll('button')].find(
    (item) => item.textContent === 'Registrar substituição',
  );
  expect(registrar?.disabled).toBe(false);
});

it('diz quem é o titular, quem substitui e até quando', async () => {
  const servico = {
    disponibilidade: vi.fn(async () => ({ disponivel: true })),
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
    disponibilidade: vi.fn(async () => ({ disponivel: true })),
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
  const porque = raiz.querySelector<HTMLTextAreaElement>('.substituicao-cm__formulario textarea');
  if (porque) porque.value = 'Titular em férias programadas.';
  raiz.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(servico.registrar).toHaveBeenCalledTimes(1));
  const [idEnviado, corpo] = servico.registrar.mock.calls[0] as [string, Record<string, string>];
  expect(idEnviado).toBe(paciente);
  expect(corpo.substituto_usuario_id).toBe(substituta);
  expect(corpo.motivo).toBe('Titular em férias programadas.');
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
    disponibilidade: vi.fn(async () => ({ disponivel: true })),
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
  const porqueSobreposto = raiz.querySelector<HTMLTextAreaElement>(
    '.substituicao-cm__formulario textarea',
  );
  if (porqueSobreposto) porqueSobreposto.value = 'Cobertura de plantão.';
  raiz.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(raiz.querySelector('.substituicao-cm__aviso')?.textContent).toContain(
      'Já existe substituição registrada para parte desse período',
    ),
  );
});

it('encerra a substituição vigente e devolve o caso ao titular', async () => {
  const servico = {
    disponibilidade: vi.fn(async () => ({ disponivel: true })),
    consultar: vi.fn(async () => comVigente),
    registrar: vi.fn(),
    encerrar: vi.fn(async () => vazio),
  };
  const { raiz } = montar(servico);
  await vi.waitFor(() => expect(raiz.querySelector('.substituicao-cm__item')).not.toBeNull());
  const campoFim = raiz.querySelector<HTMLTextAreaElement>(
    '.substituicao-cm__encerramento textarea',
  );
  if (campoFim) campoFim.value = 'Titular voltou antes do previsto.';
  raiz
    .querySelector('.substituicao-cm__encerramento')
    ?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(servico.encerrar).toHaveBeenCalledWith(paciente, {
      substituicao_id: substituicao,
      motivo: 'Titular voltou antes do previsto.',
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
    disponibilidade: vi.fn(async () => ({ disponivel: true })),
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

it('com a fatia desligada mostra indisponibilidade honesta, sem erro e sem formulário', () => {
  const { raiz } = montar(null);
  const secao = raiz.querySelector('.substituicao-cm');
  expect(secao).not.toBeNull();
  expect(raiz.querySelector('.substituicao-cm__status')?.textContent).toContain(
    'ainda não está disponível neste ambiente',
  );
  // Nem erro de carregamento nem controle que falharia: a seção só explica o estado.
  expect(raiz.textContent).not.toContain('Não foi possível');
  expect(raiz.querySelector('form')).toBeNull();
  expect(raiz.querySelector('button')).toBeNull();
  expect(raiz.textContent).toContain('não concede acesso ao conteúdo do caso');
});

it('mostra o motivo do registro e o do encerramento antecipado', async () => {
  const encerrada: PainelSubstituicao = {
    ...vazio,
    substituicoes: [
      {
        ...(comVigente.substituicoes[0] as PainelSubstituicao['substituicoes'][number]),
        encerrada_em: '2026-11-21T09:00:00+00:00',
        motivo_encerramento: 'Titular voltou antes do previsto.',
      },
    ],
  };
  const servico = {
    disponibilidade: vi.fn(async () => ({ disponivel: true })),
    consultar: vi.fn(async () => encerrada),
    registrar: vi.fn(),
    encerrar: vi.fn(),
  };
  const { raiz } = montar(servico);
  await vi.waitFor(() => expect(raiz.querySelector('.substituicao-cm__item')).not.toBeNull());
  const motivos = [...raiz.querySelectorAll('.substituicao-cm__motivo')].map(
    (no) => no.textContent ?? '',
  );
  expect(motivos[0]).toContain('Titular em férias programadas.');
  expect(motivos[1]).toContain('Titular voltou antes do previsto.');
  // Encerrada não oferece encerrar de novo.
  expect(raiz.querySelector('.substituicao-cm__encerramento')).toBeNull();
});

it('não registra nem encerra sem motivo, e diz o que falta', async () => {
  const servico = {
    disponibilidade: vi.fn(async () => ({ disponivel: true })),
    consultar: vi.fn(async () => comVigente),
    registrar: vi.fn(),
    encerrar: vi.fn(),
  };
  const { raiz } = montar(servico);
  await vi.waitFor(() => expect(raiz.querySelector('.substituicao-cm__item')).not.toBeNull());
  const escolha = raiz.querySelector<HTMLSelectElement>('select');
  const campos = raiz.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]');
  if (escolha) escolha.value = substituta;
  campos[0]?.setAttribute('value', '2026-12-01T09:00');
  campos[1]?.setAttribute('value', '2026-12-08T09:00');
  raiz.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(servico.registrar).not.toHaveBeenCalled();
  expect(raiz.querySelector('.substituicao-cm__aviso')?.textContent).toContain('motivo');
  raiz
    .querySelector('.substituicao-cm__encerramento')
    ?.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(servico.encerrar).not.toHaveBeenCalled();
  expect(raiz.querySelector('.substituicao-cm__aviso')?.textContent).toBe(
    'Informe o motivo do encerramento.',
  );
});
