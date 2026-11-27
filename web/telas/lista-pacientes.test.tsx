// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import type { PacienteLista } from '../../packages/contracts/src/cadastro.js';
import { montarListaPacientes } from './lista-pacientes.js';

/* Dados fictícios. Nenhum nome, contato ou conteúdo clínico real entra em teste. */
const ANA: PacienteLista = {
  id: '11111111-1111-4111-8111-111111111111',
  nome: 'Ana Fictícia Moreira',
  nome_preferencia: 'Aninha Fictícia',
  situacao: 'ativo',
  sinal: { estado: 'em_dia', motivos: ['Nenhum compromisso operacional em atraso.'] },
};
const BRUNO: PacienteLista = {
  id: '22222222-2222-4222-8222-222222222222',
  nome: 'Bruno Fictício Salles',
  situacao: null,
};
const CLARA: PacienteLista = {
  id: '33333333-3333-4333-8333-333333333333',
  nome: 'Clara Fictícia Tavares',
  situacao: 'pausado',
};
const PACIENTES: PacienteLista[] = [ANA, BRUNO, CLARA];

function montar(extra: Partial<Parameters<typeof montarListaPacientes>[1]> = {}) {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const aoAbrir = vi.fn();
  const aoFiltrar = vi.fn();
  const desmontar = montarListaPacientes(raiz, {
    pacientes: PACIENTES,
    administrador: true,
    aoFiltrar,
    aoAbrir,
    ...extra,
  });
  return {
    raiz,
    aoAbrir,
    aoFiltrar,
    encerrar: () => {
      desmontar();
      raiz.remove();
    },
  };
}

const lista = (raiz: HTMLElement) =>
  raiz.querySelector('ul[aria-label="Pessoas em acompanhamento"]') as HTMLUListElement;

it('apresenta cada pessoa como uma linha sob um cabeçalho, com as mesmas colunas', () => {
  const { raiz, encerrar } = montar();
  const linhas = [...lista(raiz).querySelectorAll('li')];
  expect(linhas).toHaveLength(3);
  // Cabeçalho único, fora da árvore de acessibilidade, e as colunas na mesma ordem.
  const cabecalho = raiz.querySelector('[aria-hidden="true"]') as HTMLElement;
  expect([...cabecalho.children].map((coluna) => coluna.textContent)).toEqual([
    'Nome',
    'Situação do caso',
    'Nome preferido',
    'Sinal operacional',
  ]);
  // Toda linha tem o mesmo número de células: é isso que permite comparar duas pessoas.
  const celulas = linhas.map((linha) => linha.querySelector('button')?.children.length);
  expect(celulas).toEqual([4, 4, 4]);
  encerrar();
});

it('abre a ficha pela linha e descreve a ação para quem ouve', () => {
  const { raiz, aoAbrir, encerrar } = montar();
  const linha = [...lista(raiz).querySelectorAll('button')].find((botao) =>
    botao.textContent?.includes('Ana Fictícia Moreira'),
  ) as HTMLButtonElement;
  const idDescricao = linha.getAttribute('aria-describedby');
  const descricao = [...raiz.querySelectorAll('[id]')].find((no) => no.id === idDescricao);
  expect(descricao?.textContent).toBe('Abrir ficha de Ana Fictícia Moreira. Situação: Ativo.');
  linha.click();
  expect(aoAbrir).toHaveBeenCalledWith(ANA);
  encerrar();
});

it('esconde situação de quem não a recebe do servidor', () => {
  /* Perfil sem autorização para ler a situação não recebe o campo: a coluna deixa de
     existir em vez de aparecer vazia. A recusa continua sendo do banco. */
  const { raiz, encerrar } = montar({
    pacientes: [{ id: ANA.id, nome: 'Ana Fictícia Moreira' }],
    administrador: false,
  });
  const cabecalho = raiz.querySelector('[aria-hidden="true"]') as HTMLElement;
  expect([...cabecalho.children].map((coluna) => coluna.textContent)).toEqual([
    'Nome',
    'Nome preferido',
  ]);
  expect(raiz.querySelector('select[name="responsavel"]')).toBeNull();
  expect(raiz.querySelector('select[name="situacao"]')).toBeNull();
  encerrar();
});

it('distingue preferência ausente de preferência em branco', () => {
  const { raiz, encerrar } = montar();
  const bruno = [...lista(raiz).querySelectorAll('li')].find((linha) =>
    linha.textContent?.includes('Bruno Fictício Salles'),
  ) as HTMLLIElement;
  expect(bruno.textContent).toContain('Preferência não informada');
  expect(bruno.textContent).toContain('A completar');
  encerrar();
});

it('busca dentro da página carregada e oferece saída do estado vazio', async () => {
  const { user } = await import('@testing-library/user-event').then((modulo) => ({
    user: modulo.default.setup(),
  }));
  const { raiz, encerrar } = montar();
  const busca = raiz.querySelector('input[type="search"]') as HTMLInputElement;
  await user.type(busca, 'clara');
  expect([...lista(raiz).querySelectorAll('li')]).toHaveLength(1);
  expect(lista(raiz).textContent).toContain('Clara Fictícia Tavares');

  await user.clear(busca);
  await user.type(busca, 'inexistente');
  expect(raiz.querySelector('ul[aria-label="Pessoas em acompanhamento"]')).toBeNull();
  expect(raiz.textContent).toContain('Nenhuma correspondência');
  const limpar = [...raiz.querySelectorAll('button')].find(
    (botao) => botao.dataset.acao === 'limpar-busca',
  ) as HTMLButtonElement;
  await user.click(limpar);
  expect([...lista(raiz).querySelectorAll('li')]).toHaveLength(3);
  encerrar();
});

it('mantém o recorte de filtros chegando a quem carrega a carteira', () => {
  const { raiz, aoFiltrar, encerrar } = montar();
  const revisao = raiz.querySelector('select[name="revisao"]') as HTMLSelectElement;
  revisao.value = 'vencida';
  revisao.dispatchEvent(new Event('change'));
  expect(aoFiltrar).toHaveBeenCalledWith({ revisao: 'vencida' });
  encerrar();
});

it('um registro que não pode ser apresentado degrada sozinho', () => {
  /* VIS-016. Em 24/11/2026 uma única linha com conteúdo inválido apagou a listagem
     inteira; aqui o registro quebrado some e os demais continuam acionáveis. */
  const quebrado = {
    ...ANA,
    id: '44444444-4444-4444-8444-444444444444',
    get nome(): string {
      throw new Error('conteúdo ilegível');
    },
  } as unknown as PacienteLista;
  const falhas: unknown[] = [];
  const anterior = console.error;
  console.error = () => {};
  const { raiz, encerrar } = montar({
    pacientes: [quebrado, BRUNO, CLARA],
    aoFalharLinha: (erro) => falhas.push(erro),
  });
  console.error = anterior;
  expect(falhas).toHaveLength(1);
  expect(raiz.textContent).toContain('Este registro não pôde ser apresentado');
  expect(raiz.textContent).toContain('Bruno Fictício Salles');
  expect(raiz.textContent).toContain('Clara Fictícia Tavares');
  encerrar();
});

it('erro traz causa e recuperação, sem substituir a moldura da tela', () => {
  const tentar = vi.fn();
  const { raiz, encerrar } = montar({
    pacientes: [],
    erro: 'A consulta não respondeu a tempo.',
    aoTentarNovamente: tentar,
  });
  expect(raiz.textContent).toContain('Pessoas em acompanhamento');
  expect(raiz.textContent).toContain('A consulta não respondeu a tempo.');
  const botao = [...raiz.querySelectorAll('button')].find(
    (item) => item.dataset.acao === 'tentar-carteira',
  ) as HTMLButtonElement;
  botao.click();
  expect(tentar).toHaveBeenCalled();
  encerrar();
});

it('indica carga sem desmontar a lista já apresentada', () => {
  const { raiz, encerrar } = montar({ carregando: true });
  expect(lista(raiz).getAttribute('aria-busy')).toBe('true');
  expect([...lista(raiz).querySelectorAll('li')]).toHaveLength(3);
  encerrar();
});
