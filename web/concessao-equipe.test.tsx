// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { createElement, type ComponentProps } from 'react';
import { render } from '@testing-library/react';
import { TelaConcessaoEquipe } from './concessao-equipe.js';
import { ClienteFFCM as Cliente, type ClienteFFCM } from './api.ts';
import { clienteConsultas, esquecerConsultas } from './consultas.js';

// O cache de leitura é um módulo único: cada teste começa com ele vazio.
beforeEach(() => esquecerConsultas());

function montarConcessaoEquipe(
  raiz: HTMLElement,
  api: ComponentProps<typeof TelaConcessaoEquipe>['api'],
) {
  return render(createElement(TelaConcessaoEquipe, { api }), { container: raiz }).unmount;
}

const ator = '11111111-1111-4111-8111-111111111111';
const recibo = '33333333-3333-4333-8333-333333333333';
const concessao = '44444444-4444-4444-8444-444444444444';
const vazia = { epoca: 2, reserva: null, resultado_pendente: null };

/** As linhas da lista pelo nome acessível que a tela publica, não pela forma do nó. */
const linhasDaEquipe = (raiz: HTMLElement) => [
  ...raiz.querySelectorAll('ul[aria-label="Pessoas com acesso concedido"] > li'),
];

/** A área da equipe mostrava só o formulário de convite: não havia como ver quem já tem
 * acesso. A lista não concede nada — o servidor e o banco continuam autorizando cada
 * consulta —, mas sem ela a administração decidia às cegas.
 *
 * REESCRITO na migração para React (VIS-018 exige nomear). A versão anterior afirmava a
 * ESTRUTURA do DOM montado à mão: a classe `.lista-registros`, a contagem de filhos do
 * `<ul>` e, pior, que a marca de estado era o `lastElementChild` da linha. Nada disso é
 * comportamento — é a forma de um nó, e a camada de componente a desenha de outro jeito,
 * com cabeçalho de colunas e barreira por linha. O que a prova precisa afirmar continua
 * afirmado: a lista existe com o nome acessível de antes, indica que está consultando,
 * apresenta uma linha por pessoa com e-mail, perfil, situação da conta e estado, e conta
 * quantas são. */
it('lista quem já tem acesso concedido, com estado por linha e caso vazio', async () => {
  const raiz = document.createElement('div');
  const api = {
    identidadeAtual: () => ({ usuario_id: ator, session_id: ator }),
    consultarBarreiraEquipe: vi.fn().mockResolvedValue(vazia),
    listarProfissionais: vi.fn().mockResolvedValue({
      itens: [
        {
          id: concessao,
          email: 'equipe@example.test',
          estado: 'pendente',
          perfil: 'administrador',
          usuario_id: null,
          ativo: false,
          versao: 1,
        },
      ],
      proximo_cursor: null,
    }),
    reconhecerBarreiraEquipe: vi.fn(),
  } as unknown as ClienteFFCM;
  montarConcessaoEquipe(raiz, api);

  expect(raiz.querySelector('[aria-busy="true"]')).not.toBeNull();
  expect(raiz.textContent).toContain('Carregando a equipe…');

  await vi.waitFor(() => expect(raiz.textContent).toContain('1 pessoas com acesso concedido.'));
  const linhas = linhasDaEquipe(raiz);
  expect(linhas).toHaveLength(1);
  const linha = linhas[0] as HTMLElement;
  expect(linha.textContent).toContain('equipe@example.test');
  expect(linha.textContent).toContain('Administrador');
  expect(linha.textContent).toContain('Conta desativada');
  expect(linha.textContent).toContain('Convite pendente');
});

/** VIS-016: um registro que não pode ser apresentado degrada SOZINHO.
 *
 * Em 24/11/2026 uma única linha com conteúdo inválido apagou a lista de equipe inteira, e
 * a administração ficou sem ver ninguém. Aqui o servidor devolve um perfil que a tela não
 * conhece: aquela linha avisa, e a linha válida ao lado continua legível. */
it('um registro inválido degrada sozinho e os demais continuam legíveis', async () => {
  const raiz = document.createElement('div');
  const silencio = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const api = {
    identidadeAtual: () => ({ usuario_id: ator, session_id: ator }),
    consultarBarreiraEquipe: vi.fn().mockResolvedValue(vazia),
    listarProfissionais: vi.fn().mockResolvedValue({
      itens: [
        {
          id: concessao,
          email: 'quebrada@example.test',
          estado: 'pendente',
          perfil: 'perfil-que-a-tela-nao-conhece',
          versao: 1,
        },
        {
          id: recibo,
          email: 'intacta@example.test',
          estado: 'vinculada',
          perfil: 'profissional',
          versao: 1,
        },
      ],
      proximo_cursor: null,
    }),
    reconhecerBarreiraEquipe: vi.fn(),
  } as unknown as ClienteFFCM;
  montarConcessaoEquipe(raiz, api);
  await vi.waitFor(() => expect(linhasDaEquipe(raiz)).toHaveLength(2));
  const [quebrada, intacta] = linhasDaEquipe(raiz) as HTMLElement[];
  expect(quebrada?.textContent).toContain('Este registro não pôde ser apresentado.');
  expect(quebrada?.textContent).not.toContain('quebrada@example.test');
  expect(intacta?.textContent).toContain('intacta@example.test');
  expect(intacta?.textContent).toContain('Acesso ativo');
  silencio.mockRestore();
});

it('diz que a equipe não pôde ser carregada em vez de ficar com a lista muda', async () => {
  const raiz = document.createElement('div');
  const api = {
    identidadeAtual: () => ({ usuario_id: ator, session_id: ator }),
    consultarBarreiraEquipe: vi.fn().mockResolvedValue(vazia),
    listarProfissionais: vi.fn().mockRejectedValue(new Error('indisponível')),
    reconhecerBarreiraEquipe: vi.fn(),
  } as unknown as ClienteFFCM;
  montarConcessaoEquipe(raiz, api);
  await vi.waitFor(() => expect(raiz.textContent).toContain('Não foi possível carregar a equipe'));
  expect(raiz.querySelector('[aria-busy="true"]')).toBeNull();
  expect(linhasDaEquipe(raiz)).toHaveLength(0);
});

it('oferece o link para a página própria de convite', async () => {
  const raiz = document.createElement('div');
  const api = {
    identidadeAtual: () => ({ usuario_id: ator, session_id: ator }),
    listarProfissionais: vi.fn().mockResolvedValue({ itens: [], proximo_cursor: null }),
  } as unknown as ClienteFFCM;
  montarConcessaoEquipe(raiz, api);
  await vi.waitFor(() =>
    expect(raiz.querySelector('a[href="#administracao/convidar-equipe"]')).not.toBeNull(),
  );
});

/* Fatia 9b (28/11/2026), política da Equipe: a primeira página fica guardada por até 60 s;
 * a volta a mostra no primeiro quadro e relê em seguida. Nenhuma leitura sobrevive à
 * identidade, à recusa ou à falha. */
const contaB = '22222222-2222-4222-8222-222222222222';

function paginaDe(email: string) {
  return {
    itens: [
      {
        id: concessao,
        email,
        estado: 'vinculada',
        perfil: 'profissional',
        usuario_id: ator,
        ativo: true,
        versao: 1,
      },
    ],
    proximo_cursor: null,
  };
}

function apiDe(listar: ReturnType<typeof vi.fn>, conta = ator) {
  return {
    identidadeAtual: () => ({ usuario_id: conta, session_id: conta }),
    listarProfissionais: listar,
  } as unknown as ClienteFFCM;
}

function adiada<T>() {
  let resolver!: (valor: T) => void;
  const promessa = new Promise<T>((r) => {
    resolver = r;
  });
  return { promessa, resolver };
}

const ocioso = (raiz: HTMLElement) =>
  vi.waitFor(() => expect(raiz.querySelector('[aria-busy="true"]')).toBeNull());

it('volta à Equipe: a lista guardada aparece no primeiro quadro e é relida', async () => {
  const listar = vi
    .fn()
    .mockResolvedValueOnce(paginaDe('antes@example.test'))
    .mockResolvedValueOnce(paginaDe('depois@example.test'));
  const api = apiDe(listar);
  const raiz = document.createElement('div');
  montarConcessaoEquipe(raiz, api)();
  await vi.waitFor(() => expect(clienteConsultas.getQueryCache().getAll()).toHaveLength(1));
  await vi.waitFor(() =>
    expect(clienteConsultas.getQueryCache().getAll()[0]?.state.data).toBeDefined(),
  );

  const volta = document.createElement('div');
  const desmontar = montarConcessaoEquipe(volta, api);
  // Síncrono: a lista guardada já está lá, recuada enquanto relê.
  expect(volta.textContent).toContain('antes@example.test');
  expect(volta.querySelector('[data-forma="recuo"]')).not.toBeNull();
  await vi.waitFor(() => expect(volta.textContent).toContain('depois@example.test'));
  expect(volta.textContent).not.toContain('antes@example.test');
  expect(listar).toHaveBeenCalledTimes(2);
  desmontar();
});

it('a entrada some 60 s depois da última leitura', async () => {
  vi.useFakeTimers();
  try {
    const api = apiDe(vi.fn().mockResolvedValue(paginaDe('antes@example.test')));
    const raiz = document.createElement('div');
    montarConcessaoEquipe(raiz, api)();
    await vi.waitFor(() =>
      expect(clienteConsultas.getQueryCache().getAll()[0]?.state.data).toBeDefined(),
    );
    vi.advanceTimersByTime(59_000);
    expect(clienteConsultas.getQueryCache().getAll()).toHaveLength(1);
    vi.advanceTimersByTime(2_000);
    expect(clienteConsultas.getQueryCache().getAll()).toHaveLength(0);
  } finally {
    vi.useRealTimers();
  }
});

it('revogação: a sessão esquecida pela API leva a lista guardada', async () => {
  const listar = vi.fn().mockResolvedValue(paginaDe('antes@example.test'));
  const api = apiDe(listar);
  montarConcessaoEquipe(document.createElement('div'), api)();
  await vi.waitFor(() =>
    expect(clienteConsultas.getQueryCache().getAll()[0]?.state.data).toBeDefined(),
  );
  new Cliente().limpar();
  const volta = document.createElement('div');
  const desmontar = montarConcessaoEquipe(volta, api);
  expect(volta.textContent).not.toContain('antes@example.test');
  await ocioso(volta);
  desmontar();
});

it('negativo: recusa na releitura esconde a lista e descarta o guardado', async () => {
  const listar = vi
    .fn()
    .mockResolvedValueOnce(paginaDe('antes@example.test'))
    .mockRejectedValueOnce(Object.assign(new Error('recusa'), { status: 403 }));
  const api = apiDe(listar);
  montarConcessaoEquipe(document.createElement('div'), api)();
  await vi.waitFor(() =>
    expect(clienteConsultas.getQueryCache().getAll()[0]?.state.data).toBeDefined(),
  );
  const volta = document.createElement('div');
  const desmontar = montarConcessaoEquipe(volta, api);
  await vi.waitFor(() =>
    expect(volta.textContent).toContain('Não foi possível carregar a equipe.'),
  );
  expect(volta.textContent).not.toContain('antes@example.test');
  expect(clienteConsultas.getQueryCache().getAll()).toHaveLength(0);
  desmontar();
});

it('troca de conta: a conta nova não vê a lista da anterior', async () => {
  montarConcessaoEquipe(
    document.createElement('div'),
    apiDe(vi.fn().mockResolvedValue(paginaDe('da-conta-a@example.test'))),
  )();
  await vi.waitFor(() =>
    expect(clienteConsultas.getQueryCache().getAll()[0]?.state.data).toBeDefined(),
  );
  const raiz = document.createElement('div');
  const desmontar = montarConcessaoEquipe(
    raiz,
    apiDe(vi.fn().mockResolvedValue(paginaDe('da-conta-b@example.test')), contaB),
  );
  expect(raiz.textContent).not.toContain('da-conta-a@example.test');
  await vi.waitFor(() => expect(raiz.textContent).toContain('da-conta-b@example.test'));
  expect(
    clienteConsultas
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey),
  ).toEqual([['sessao', contaB, contaB, 'admin', 'equipe']]);
  desmontar();
});

it('resposta atrasada da conta anterior é descartada', async () => {
  const atrasada = adiada<ReturnType<typeof paginaDe>>();
  montarConcessaoEquipe(
    document.createElement('div'),
    apiDe(vi.fn().mockReturnValue(atrasada.promessa)),
  )();
  const raiz = document.createElement('div');
  const desmontar = montarConcessaoEquipe(
    raiz,
    apiDe(vi.fn().mockResolvedValue(paginaDe('da-conta-b@example.test')), contaB),
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('da-conta-b@example.test'));
  atrasada.resolver(paginaDe('da-conta-a@example.test'));
  await new Promise((r) => setTimeout(r, 0));
  expect(raiz.textContent).not.toContain('da-conta-a@example.test');
  expect(
    clienteConsultas
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey),
  ).toEqual([['sessao', contaB, contaB, 'admin', 'equipe']]);
  desmontar();
});
