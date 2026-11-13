// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { montarHomeProfissional, type PaginaCarteira } from './home-profissional';
import type { FiltrosCarteira, PacienteLista } from '../packages/contracts/src/cadastro';
import { avisoSinalOperacional } from '../packages/contracts/src/pendencia';
import { FalhaApi } from './api';

const ID = (n: number) => `40000000-0000-4000-8000-00000000000${n}`;

const caso = (n: number, sinal?: PacienteLista['sinal']): PacienteLista => ({
  id: ID(n),
  nome: `Paciente Fictício ${n}`,
  nome_preferencia: null,
  versao: 1,
  ...(sinal ? { sinal } : {}),
});

const pagina = (itens: PacienteLista[], proximo: string | null = null): PaginaCarteira => ({
  itens,
  proximo_cursor: proximo,
});

/** O serviço distingue os dois recortes pela presença do filtro, como a carteira faz. */
const servico = (
  comPendencia: () => Promise<PaginaCarteira>,
  todos: () => Promise<PaginaCarteira>,
) => ({
  listar: (filtros?: FiltrosCarteira) =>
    filtros?.pendencia === 'abertas' ? comPendencia() : todos(),
});

const esperar = () => new Promise((resolve) => setTimeout(resolve, 0));

it('responde a pergunta em palavras e leva cada caso à aba que resolve o motivo', async () => {
  const raiz = document.createElement('div');
  const atencao = caso(1, {
    estado: 'atencao_operacional',
    motivos: ['Revisão acordada para 01/12/2026.', 'Tarefa atrasada há 3 dias.'],
  });
  montarHomeProfissional(
    raiz,
    servico(
      async () => pagina([atencao]),
      async () => pagina([atencao, caso(2, { estado: 'em_dia', motivos: ['Tudo combinado.'] })]),
    ),
    vi.fn(),
  );
  await esperar();

  expect(raiz.querySelector('.home-saudacao')?.textContent).toBe('Um caso precisa de você');
  const link = raiz.querySelector<HTMLAnchorElement>('.home-caso-link');
  // A aba certa, não a ficha genérica: quem abre a home não deveria caçar a aba depois.
  expect(link?.getAttribute('href')).toBe(`#paciente/${ID(1)}/pendencias`);
  expect(link?.textContent).toContain('Revisão acordada para 01/12/2026.');
  expect(link?.textContent).toContain('Tarefa atrasada há 3 dias.');
  // FR-028 exige o aviso em toda superfície que mostra o sinal.
  expect(raiz.textContent).toContain(avisoSinalOperacional);
  // O caso "em dia" não vira linha: a home lista o que pede ação.
  expect(raiz.querySelectorAll('.home-caso')).toHaveLength(1);
});

it('plural acompanha a quantidade sem recorrer a "(s)"', async () => {
  const raiz = document.createElement('div');
  const casos = [1, 2, 3].map((n) =>
    caso(n, { estado: 'atencao_operacional', motivos: [`Motivo ${n}.`] }),
  );
  montarHomeProfissional(
    raiz,
    servico(
      async () => pagina(casos),
      async () => pagina(casos),
    ),
    vi.fn(),
  );
  await esperar();

  expect(raiz.querySelector('.home-saudacao')?.textContent).toBe('3 casos precisam de você');
  expect(raiz.textContent).not.toContain('(s)');
});

it('sem pendência aberta a tela afirma a calma em vez de parecer quebrada', async () => {
  const raiz = document.createElement('div');
  montarHomeProfissional(
    raiz,
    servico(
      async () => pagina([]),
      async () => pagina([caso(1, { estado: 'em_dia', motivos: ['Tudo combinado.'] })]),
    ),
    vi.fn(),
  );
  await esperar();

  expect(raiz.querySelector('.home-saudacao')?.textContent).toBe('Nada precisa de você agora');
  expect(raiz.querySelector('.home-sereno')).not.toBeNull();
  expect(raiz.querySelectorAll('.home-caso')).toHaveLength(0);
  expect(raiz.textContent).toContain('Você acompanha 1 pessoa.');
});

it('caso sem periodicidade acordada aparece, e o texto nega que silêncio seja tranquilidade', async () => {
  const raiz = document.createElement('div');
  const semAcordo = caso(2, {
    estado: 'informacao_insuficiente',
    motivos: ['Periodicidade de acompanhamento ainda não acordada para este caso.'],
  });
  montarHomeProfissional(
    raiz,
    servico(
      async () => pagina([]),
      async () => pagina([semAcordo]),
    ),
    vi.fn(),
  );
  await esperar();

  const bloco = raiz.querySelector('[data-bloco="Esperando combinar"]');
  expect(bloco).not.toBeNull();
  expect(bloco?.textContent).toContain('ausência de aviso aqui não é sinal de que está tudo bem');
  expect(bloco?.querySelector<HTMLAnchorElement>('.home-caso-link')?.getAttribute('href')).toBe(
    `#paciente/${ID(2)}/pendencias`,
  );
});

it('uma fonte que falha derruba só o próprio bloco, e o botão refaz a leitura', async () => {
  const raiz = document.createElement('div');
  let tentativas = 0;
  const comPendencia = vi.fn(async () => {
    tentativas += 1;
    if (tentativas === 1) throw new Error('rede');
    return pagina([caso(1, { estado: 'atencao_operacional', motivos: ['Voltou.'] })]);
  });
  const todos = vi.fn(async () =>
    pagina([caso(1, { estado: 'atencao_operacional', motivos: ['Voltou.'] })]),
  );
  montarHomeProfissional(raiz, servico(comPendencia, todos), vi.fn());
  await esperar();

  // O bloco quebrado não leva o resto da tela junto.
  expect(raiz.querySelector('.home-falha')).not.toBeNull();
  expect(raiz.textContent).toContain('Você acompanha 1 pessoa.');

  raiz.querySelector<HTMLButtonElement>('.home-falha button')?.click();
  await esperar();
  expect(raiz.querySelector('.home-falha')).toBeNull();
  expect(raiz.querySelector('.home-saudacao')?.textContent).toBe('Um caso precisa de você');
});

it('página parcial não afirma um total que o servidor não devolveu', async () => {
  const raiz = document.createElement('div');
  const casos = [1, 2].map((n) =>
    caso(n, { estado: 'atencao_operacional', motivos: [`Motivo ${n}.`] }),
  );
  montarHomeProfissional(
    raiz,
    servico(
      async () => pagina(casos, 'cursor-opaco'),
      async () => pagina(casos, 'cursor-opaco'),
    ),
    vi.fn(),
  );
  await esperar();

  expect(raiz.textContent).toContain('Você acompanha mais de 2 pessoas.');
  expect(raiz.textContent).toContain('abra a lista completa');
});

it('perder o acesso entrega a tela ao tratamento de sessão em vez de desenhar erro', async () => {
  const raiz = document.createElement('div');
  const acessoPerdido = vi.fn();
  const falha = new FalhaApi('nao_autenticado', 401);
  montarHomeProfissional(
    raiz,
    servico(
      async () => {
        throw falha;
      },
      async () => pagina([]),
    ),
    acessoPerdido,
  );
  await esperar();

  expect(acessoPerdido).toHaveBeenCalledWith(falha);
  expect(raiz.childElementCount).toBe(0);
});

it('desmontar interrompe a tela sem deixar resto no DOM', async () => {
  const raiz = document.createElement('div');
  const desmontar = montarHomeProfissional(
    raiz,
    servico(
      async () => pagina([]),
      async () => pagina([]),
    ),
    vi.fn(),
  );
  desmontar();
  await esperar();
  expect(raiz.childElementCount).toBe(0);
});
