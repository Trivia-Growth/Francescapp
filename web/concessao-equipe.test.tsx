// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { createElement, type ComponentProps } from 'react';
import { render } from '@testing-library/react';
import { TelaConcessaoEquipe } from './concessao-equipe.js';
import type { ClienteFFCM } from './api.ts';

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
