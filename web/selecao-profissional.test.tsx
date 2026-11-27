// @vitest-environment jsdom
import usuario from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { responderConfirmacoes } from './confirmacao-prova.ts';
import { montarSelecaoProfissional } from './selecao-profissional.js';
import type { ClienteFFCM } from './api.ts';

/* A lista de vínculos deixou de colar nome, situação e versão numa frase só separada por
   ` · ` e passou a ser linha com colunas (VIS-016). As afirmações abaixo deixaram de
   procurar aquela frase e passaram a procurar a LINHA do profissional e o que ela diz —
   que é o comportamento observável, e continua valendo seja qual for a apresentação. */
const linhaDe = (raiz: HTMLElement, nome: string): string =>
  [...raiz.querySelectorAll('li')].find((linha) => linha.textContent?.includes(nome))
    ?.textContent ?? '';

const barreiraIndisponivel = {
  identidadeAtual: () => ({
    usuario_id: 'a0000000-0000-4000-8000-000000000001',
    session_id: 'a0000000-0000-4000-8000-000000000001',
  }),
  consultarBarreiraAcesso: async () => {
    throw new Error('indisponível');
  },
};

it('mostra vínculos retornados e mantém concessão bloqueada', async () => {
  const raiz = document.createElement('div');
  const api = {
    ...barreiraIndisponivel,
    listarProfissionais: vi.fn().mockResolvedValue({
      itens: [
        {
          perfil: 'profissional',
          estado: 'vinculada',
          ativo: true,
          usuario_id: 'profissional-ficticio',
          email: 'pessoa@example.test',
        },
      ],
      proximo_cursor: null,
    }),
    listarVinculosProfissionais: vi.fn().mockResolvedValue({
      itens: [{ id: 'a', usuario_id: 'profissional-ficticio', revogado: false, versao: 1 }],
      proximo_cursor: null,
    }),
  } as unknown as ClienteFFCM;
  montarSelecaoProfissional(raiz, 'paciente-ficticio', api, () => false);
  await vi.waitFor(() => expect(raiz.textContent).toContain('pessoa@example.test'));
  expect(raiz.textContent).not.toContain('profissional-ficticio');
  expect(api.listarVinculosProfissionais).toHaveBeenCalledWith('paciente-ficticio', undefined);
  expect(
    [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Conceder acesso')?.disabled,
  ).toBe(true);
});

it('não expõe identificador quando profissional não consta na página consultada', async () => {
  const raiz = document.createElement('div');
  const api = {
    ...barreiraIndisponivel,
    listarProfissionais: vi.fn().mockResolvedValue({ itens: [], proximo_cursor: null }),
    listarVinculosProfissionais: vi.fn().mockResolvedValue({
      itens: [
        {
          id: 'vinculo-ficticio',
          usuario_id: 'profissional-ficticio',
          revogado: false,
          versao: 1,
        },
      ],
      proximo_cursor: null,
    }),
  } as unknown as ClienteFFCM;
  montarSelecaoProfissional(raiz, 'paciente-ficticio', api, () => false);
  await vi.waitFor(() =>
    expect(raiz.textContent).toContain('Identificação indisponível nesta página'),
  );
  expect(raiz.textContent).not.toContain('profissional-ficticio');
});

it('identifica profissional de concessão revogada sem oferecê-lo para concessão', async () => {
  const raiz = document.createElement('div');
  const api = {
    ...barreiraIndisponivel,
    listarProfissionais: vi.fn().mockResolvedValue({
      itens: [
        {
          perfil: 'profissional',
          estado: 'revogada',
          ativo: false,
          usuario_id: 'profissional-revogado',
          email: 'historico@example.test',
        },
      ],
      proximo_cursor: null,
    }),
    listarVinculosProfissionais: vi.fn().mockResolvedValue({
      itens: [{ id: 'vinculo', usuario_id: 'profissional-revogado', revogado: true, versao: 2 }],
      proximo_cursor: null,
    }),
  } as unknown as ClienteFFCM;
  montarSelecaoProfissional(raiz, 'paciente-ficticio', api, () => false);
  await vi.waitFor(() => expect(linhaDe(raiz, 'historico@example.test')).toContain('Revogado'));
  expect(
    [...raiz.querySelectorAll('option')].some((opcao) => opcao.value === 'profissional-revogado'),
  ).toBe(false);
});

it('bloqueia nova tentativa quando envio perde resposta', async () => {
  const raiz = document.createElement('div');
  const id = 'a0000000-0000-4000-8000-000000000001';
  let epoca = 1;
  const api = {
    identidadeAtual: () => ({ usuario_id: id, session_id: id }),
    consultarBarreiraAcesso: async () => ({ epoca, reserva: null, resultado_pendente: null }),
    encerrarBarreiraAcesso: async () => {
      epoca++;
      return { estado: 'vazia' };
    },
    reservarBarreiraAcesso: async () => ({ estado: 'aberta' }),
    criarAcessoPaciente: async () => {
      throw new Error('resposta perdida');
    },
    listarProfissionais: async () => ({
      itens: [
        {
          perfil: 'profissional',
          estado: 'vinculada',
          ativo: true,
          usuario_id: id,
          email: 'pessoa@example.test',
        },
      ],
      proximo_cursor: null,
    }),
    listarVinculosProfissionais: async () => ({ itens: [], proximo_cursor: null }),
  } as unknown as ClienteFFCM;
  montarSelecaoProfissional(raiz, id, api, () => false);
  await vi.waitFor(() =>
    expect(raiz.textContent).toContain('Tudo conferido. Você já pode conceder acesso.'),
  );
  const selecao = raiz.querySelector('select') as HTMLSelectElement;
  selecao.value = id;
  selecao.dispatchEvent(new Event('change'));
  (raiz.querySelector('textarea') as HTMLTextAreaElement).value = 'Motivo fictício';
  const botao = [...raiz.querySelectorAll('button')].find(
    (b) => b.textContent === 'Conceder acesso',
  ) as HTMLButtonElement;
  botao.click();
  await vi.waitFor(() =>
    expect(raiz.textContent).toContain('Não deu para saber se a concessão foi registrada'),
  );
  expect(botao.disabled).toBe(true);
});

it('não encerra reserva existente sem confirmação e informa rascunho digitado', async () => {
  const raiz = document.createElement('div');
  const id = 'a0000000-0000-4000-8000-000000000001';
  const confirmacoes = responderConfirmacoes(false);
  const encerrar = vi.fn();
  const pendente = vi.fn();
  const api = {
    identidadeAtual: () => ({ usuario_id: id, session_id: id }),
    consultarBarreiraAcesso: async () => ({
      epoca: 1,
      reserva: { id, estado: 'aberta' },
      resultado_pendente: null,
    }),
    encerrarBarreiraAcesso: encerrar,
    listarProfissionais: async () => ({ itens: [], proximo_cursor: null }),
    listarVinculosProfissionais: async () => ({ itens: [], proximo_cursor: null }),
  } as unknown as ClienteFFCM;
  montarSelecaoProfissional(raiz, id, api, () => false, pendente);
  await vi.waitFor(() => expect(confirmacoes.chamadas).not.toHaveLength(0));
  expect(confirmacoes.chamadas[0]).toContain('Encerrar a tentativa em andamento?');
  expect(encerrar).not.toHaveBeenCalled();
  const motivo = raiz.querySelector('textarea') as HTMLTextAreaElement;
  motivo.value = 'Motivo fictício';
  motivo.dispatchEvent(new Event('input'));
  expect(pendente).toHaveBeenLastCalledWith(true);
  expect(
    [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Conceder acesso')?.disabled,
  ).toBe(true);
  confirmacoes.encerrar();
});

it('resposta tardia não apaga motivo editado depois do envio', async () => {
  const raiz = document.createElement('div');
  const id = 'a0000000-0000-4000-8000-000000000001';
  let resolver!: (valor: { id: string; versao: number }) => void;
  const resposta = new Promise<{ id: string; versao: number }>((resolve) => {
    resolver = resolve;
  });
  const pendente = vi.fn();
  let epoca = 1;
  const api = {
    identidadeAtual: () => ({ usuario_id: id, session_id: id }),
    consultarBarreiraAcesso: async () => ({ epoca, reserva: null, resultado_pendente: null }),
    encerrarBarreiraAcesso: async () => {
      epoca++;
      return { estado: 'vazia' };
    },
    reservarBarreiraAcesso: async () => ({ estado: 'aberta' }),
    criarAcessoPaciente: async (_paciente: string, entrada: { acesso_id: string }) => {
      const valor = await resposta;
      return { ...valor, id: entrada.acesso_id };
    },
    listarProfissionais: async () => ({
      itens: [
        {
          perfil: 'profissional',
          estado: 'vinculada',
          ativo: true,
          usuario_id: id,
          email: 'pessoa@example.test',
        },
      ],
      proximo_cursor: null,
    }),
    listarVinculosProfissionais: async () => ({ itens: [], proximo_cursor: null }),
  } as unknown as ClienteFFCM;
  montarSelecaoProfissional(raiz, id, api, () => false, pendente);
  await vi.waitFor(() =>
    expect(raiz.textContent).toContain('Tudo conferido. Você já pode conceder acesso.'),
  );
  const selecao = raiz.querySelector('select') as HTMLSelectElement;
  selecao.value = id;
  selecao.dispatchEvent(new Event('change'));
  const motivo = raiz.querySelector('textarea') as HTMLTextAreaElement;
  motivo.value = 'Motivo inicial';
  motivo.dispatchEvent(new Event('input'));
  const botao = [...raiz.querySelectorAll('button')].find(
    (b) => b.textContent === 'Conceder acesso',
  ) as HTMLButtonElement;
  botao.click();
  await vi.waitFor(() => expect(botao.disabled).toBe(true));
  motivo.value = 'Motivo revisado';
  motivo.dispatchEvent(new Event('input'));
  resolver({ id, versao: 1 });
  await vi.waitFor(() => expect(raiz.textContent).toContain('Concessão enviada.'));
  expect(motivo.value).toBe('Motivo revisado');
  expect(pendente).toHaveBeenLastCalledWith(true);
});

it('atualiza vínculos após concessão sem apagar rascunho mais recente', async () => {
  const raiz = document.createElement('div');
  const id = 'a0000000-0000-4000-8000-000000000001';
  let epoca = 1;
  const listar = vi.fn().mockResolvedValue({ itens: [], proximo_cursor: null });
  const api = {
    identidadeAtual: () => ({ usuario_id: id, session_id: id }),
    consultarBarreiraAcesso: async () => ({ epoca, reserva: null, resultado_pendente: null }),
    encerrarBarreiraAcesso: async () => {
      epoca++;
      return { estado: 'vazia' };
    },
    reservarBarreiraAcesso: async () => ({ estado: 'aberta' }),
    criarAcessoPaciente: async (_paciente: string, entrada: { acesso_id: string }) => ({
      id: entrada.acesso_id,
      versao: 1,
    }),
    listarProfissionais: async () => ({
      itens: [
        {
          perfil: 'profissional',
          estado: 'vinculada',
          ativo: true,
          usuario_id: id,
          email: 'pessoa@example.test',
        },
      ],
      proximo_cursor: null,
    }),
    listarVinculosProfissionais: listar,
  } as unknown as ClienteFFCM;
  montarSelecaoProfissional(raiz, id, api, () => false);
  await vi.waitFor(() =>
    expect(raiz.textContent).toContain('Tudo conferido. Você já pode conceder acesso.'),
  );
  const anteriores = listar.mock.calls.length;
  listar.mockResolvedValue({
    itens: [{ id, usuario_id: id, revogado: false, versao: 1 }],
    proximo_cursor: null,
  });
  const selecao = raiz.querySelector('select') as HTMLSelectElement;
  selecao.value = id;
  selecao.dispatchEvent(new Event('change'));
  (raiz.querySelector('textarea') as HTMLTextAreaElement).value = 'Motivo fictício';
  [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Conceder acesso')?.click();
  await vi.waitFor(() => expect(listar.mock.calls.length).toBeGreaterThan(anteriores));
  await vi.waitFor(() => expect(linhaDe(raiz, 'pessoa@example.test')).toContain('Ativo'));
});

it('aguarda atualização concorrente e repete reinício após falha sem usar cursor antigo', async () => {
  const raiz = document.createElement('div');
  const id = 'a0000000-0000-4000-8000-000000000001';
  let resolverPrimeira!: (v: { itens: never[]; proximo_cursor: string | null }) => void;
  let resolverReinicio!: (v: { itens: never[]; proximo_cursor: string | null }) => void;
  const primeira = new Promise<{ itens: never[]; proximo_cursor: string | null }>((r) => {
    resolverPrimeira = r;
  });
  const reinicio = new Promise<{ itens: never[]; proximo_cursor: string | null }>((r) => {
    resolverReinicio = r;
  });
  const listar = vi
    .fn()
    .mockReturnValueOnce(primeira)
    .mockReturnValueOnce(reinicio)
    .mockResolvedValueOnce({ itens: [], proximo_cursor: 'cursor-antigo' })
    .mockRejectedValueOnce(new Error('falha'))
    .mockResolvedValueOnce({ itens: [], proximo_cursor: null });
  let epoca = 1;
  const api = {
    identidadeAtual: () => ({ usuario_id: id, session_id: id }),
    consultarBarreiraAcesso: async () => ({ epoca, reserva: null, resultado_pendente: null }),
    encerrarBarreiraAcesso: async () => {
      epoca++;
      return { estado: 'vazia' };
    },
    reservarBarreiraAcesso: async () => ({ estado: 'aberta' }),
    criarAcessoPaciente: async (_paciente: string, entrada: { acesso_id: string }) => ({
      id: entrada.acesso_id,
      versao: 1,
    }),
    listarProfissionais: async () => ({
      itens: [
        {
          perfil: 'profissional',
          estado: 'vinculada',
          ativo: true,
          usuario_id: id,
          email: 'pessoa@example.test',
        },
      ],
      proximo_cursor: null,
    }),
    listarVinculosProfissionais: listar,
  } as unknown as ClienteFFCM;
  montarSelecaoProfissional(raiz, id, api, () => false);
  resolverPrimeira({ itens: [], proximo_cursor: null });
  await vi.waitFor(() => expect(listar).toHaveBeenCalledTimes(2));
  expect(raiz.textContent).not.toContain('Tudo conferido. Você já pode conceder acesso.');
  resolverReinicio({ itens: [], proximo_cursor: 'cursor-inicial' });
  await vi.waitFor(() =>
    expect(raiz.textContent).toContain('Tudo conferido. Você já pode conceder acesso.'),
  );
  [...raiz.querySelectorAll('button')]
    .find((b) => b.textContent === 'Carregar mais vínculos')
    ?.click();
  await vi.waitFor(() => expect(listar).toHaveBeenCalledTimes(3));
  const selecao = raiz.querySelector('select') as HTMLSelectElement;
  selecao.value = id;
  selecao.dispatchEvent(new Event('change'));
  (raiz.querySelector('textarea') as HTMLTextAreaElement).value = 'Motivo fictício';
  [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Conceder acesso')?.click();
  await vi.waitFor(() => expect(listar).toHaveBeenCalledTimes(4));
  expect(listar.mock.calls[3]).toEqual([id, undefined]);
  const tentar = [...raiz.querySelectorAll('button')].find(
    (b) => b.textContent === 'Tentar consultar vínculos novamente',
  ) as HTMLButtonElement;
  await vi.waitFor(() => expect(tentar.hidden).toBe(false));
  tentar.click();
  await vi.waitFor(() => expect(listar).toHaveBeenCalledTimes(5));
  expect(listar.mock.calls[4]).toEqual([id, undefined]);
});

it('identifica vínculos em outras páginas e não escolhe entre identidades ambíguas', async () => {
  const raiz = document.createElement('div');
  const id = 'a0000000-0000-4000-8000-000000000001';
  const outro = 'a0000000-0000-4000-8000-000000000002';
  const item = (usuario_id: string, email: string) => ({
    perfil: 'profissional',
    estado: 'revogada',
    ativo: false,
    usuario_id,
    email,
  });
  const listar = vi.fn(async (cursor?: string) =>
    cursor
      ? {
          itens: [
            item(id, 'antigo@example.test'),
            item(id, 'novo@example.test'),
            item(outro, 'outro@example.test'),
          ],
          proximo_cursor: null,
        }
      : { itens: [], proximo_cursor: 'proxima' },
  );
  let epoca = 1;
  const api = {
    identidadeAtual: () => ({ usuario_id: id, session_id: id }),
    consultarBarreiraAcesso: async () => ({ epoca, reserva: null, resultado_pendente: null }),
    encerrarBarreiraAcesso: async () => {
      epoca++;
      return { estado: 'vazia' };
    },
    listarProfissionais: listar,
    listarVinculosProfissionais: async () => ({
      itens: [
        { id, usuario_id: id, revogado: true, versao: 2 },
        { id: outro, usuario_id: outro, revogado: false, versao: 1 },
      ],
      proximo_cursor: null,
    }),
  } as unknown as ClienteFFCM;
  montarSelecaoProfissional(raiz, id, api, () => false);
  await vi.waitFor(() => expect(linhaDe(raiz, 'outro@example.test')).toContain('Ativo'));
  expect(linhaDe(raiz, 'Identificação indisponível nesta página')).toContain('Revogado');
  // Identidade ambígua não é escolhida nem exibida: duas contas para o mesmo usuário.
  expect(linhaDe(raiz, 'antigo@example.test')).toBe('');
  expect(linhaDe(raiz, 'novo@example.test')).toBe('');
  expect(
    listar.mock.calls.filter(([cursor]) => cursor === 'proxima').length,
  ).toBeGreaterThanOrEqual(1);
});

it('encaminha erro de autorização ao identificar vínculos', async () => {
  const raiz = document.createElement('div');
  const negado = new Error('403');
  const acessoPerdido = vi.fn().mockReturnValue(true);
  const api = {
    ...barreiraIndisponivel,
    listarProfissionais: vi.fn().mockRejectedValue(negado),
    listarVinculosProfissionais: vi.fn().mockResolvedValue({
      itens: [{ id: 'vinculo', usuario_id: 'pessoa', revogado: false, versao: 1 }],
      proximo_cursor: null,
    }),
  } as unknown as ClienteFFCM;
  montarSelecaoProfissional(raiz, 'paciente', api, acessoPerdido);
  await vi.waitFor(() => expect(acessoPerdido).toHaveBeenCalledWith(negado));
});

it('atualiza identificação após consultar novamente vínculos', async () => {
  const raiz = document.createElement('div');
  const id = 'a0000000-0000-4000-8000-000000000001';
  let nome = 'antes@example.test';
  let epoca = 1;
  const api = {
    identidadeAtual: () => ({ usuario_id: id, session_id: id }),
    consultarBarreiraAcesso: async () => ({ epoca, reserva: null, resultado_pendente: null }),
    encerrarBarreiraAcesso: async () => {
      epoca++;
      return { estado: 'vazia' };
    },
    listarProfissionais: async () => ({
      itens: [
        { perfil: 'profissional', estado: 'vinculada', ativo: true, usuario_id: id, email: nome },
      ],
      proximo_cursor: null,
    }),
    listarVinculosProfissionais: async () => ({
      itens: [{ id, usuario_id: id, revogado: false, versao: 1 }],
      proximo_cursor: null,
    }),
  } as unknown as ClienteFFCM;
  montarSelecaoProfissional(raiz, id, api, () => false);
  await vi.waitFor(() => expect(linhaDe(raiz, 'antes@example.test')).toContain('Ativo'));
  await vi.waitFor(() =>
    expect(raiz.textContent).toContain('Tudo conferido. Você já pode conceder acesso.'),
  );
  nome = 'depois@example.test';
  [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Conferir novamente')?.click();
  await vi.waitFor(() => expect(linhaDe(raiz, 'depois@example.test')).toContain('Ativo'));
  // A identificação antiga sai da LISTA; a opção do seletor é outra região, com seu
  // próprio ciclo de consulta, e sempre foi assim.
  expect(linhaDe(raiz, 'antes@example.test')).toBe('');
});

it('revoga vínculo selecionado com motivo e atualiza estado observado', async () => {
  const raiz = document.createElement('div');
  // No documento porque a pessoa digita de verdade: fora dele o campo não é alcançável.
  document.body.append(raiz);
  const id = 'a0000000-0000-4000-8000-000000000001';
  let revogado = false;
  const confirmacoes = responderConfirmacoes(true);
  const revogar = vi.fn().mockImplementation(async () => {
    revogado = true;
    return { id, versao: 2 };
  });
  const api = {
    identidadeAtual: () => ({ usuario_id: id, session_id: id }),
    consultarBarreiraAcesso: async () => ({ epoca: 1, reserva: null, resultado_pendente: null }),
    encerrarBarreiraAcesso: async () => ({ estado: 'vazia' }),
    reservarBarreiraAcesso: async () => ({ estado: 'aberta' }),
    listarProfissionais: async () => ({
      itens: [
        {
          perfil: 'profissional',
          estado: 'vinculada',
          ativo: true,
          usuario_id: id,
          email: 'pessoa@example.test',
        },
      ],
      proximo_cursor: null,
    }),
    listarVinculosProfissionais: async () => ({
      itens: [{ id, usuario_id: id, revogado, versao: revogado ? 2 : 1 }],
      proximo_cursor: null,
    }),
    revogarAcessoPaciente: revogar,
  } as unknown as ClienteFFCM;
  montarSelecaoProfissional(raiz, id, api, () => false);
  await vi.waitFor(() => expect(linhaDe(raiz, 'pessoa@example.test')).toContain('Ativo'));
  await vi.waitFor(() =>
    expect(raiz.textContent).toContain('Tudo conferido. Você já pode conceder acesso.'),
  );
  [...raiz.querySelectorAll('button')]
    .find((b) => b.textContent === 'Selecionar para revogação')
    ?.click();
  /* O motivo é DIGITADO, não atribuído. O painel de revogação passou a ser React e o
     campo é controlado: `textarea.value = …` não dispara evento nem atualiza o rastreador
     do React, então o componente continua com o motivo vazio, a guarda `!razao.trim()`
     barra o envio e o próximo render apaga o texto. Digitar é o que a pessoa faz, e é o
     que exercita o mesmo caminho em qualquer das duas implementações. A garantia do teste
     não mudou: segue cobrindo que a revogação viaja com motivo e versão esperada e que a
     lista passa a mostrar o estado observado depois. */
  const motivo = document.getElementById('revogacao-motivo') as HTMLTextAreaElement;
  // A seleção do vínculo é assíncrona (pode perguntar antes de trocar de alvo) e é ela
  // que revela o painel. Digitar antes disso seria digitar em campo escondido.
  await vi.waitFor(() => expect(motivo.closest('[hidden]')).toBeNull());
  await usuario.setup().type(motivo, 'Motivo fictício');
  expect(motivo.value).toBe('Motivo fictício');
  [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Revogar acesso')?.click();
  await vi.waitFor(() => expect(linhaDe(raiz, 'pessoa@example.test')).toContain('Revogado'));
  expect(revogar).toHaveBeenCalledWith(
    id,
    id,
    { versao_esperada: 1, motivo: 'Motivo fictício' },
    expect.any(String),
    { reserva_id: expect.any(String), geracao_reserva: 1 },
  );
  confirmacoes.encerrar();
  raiz.remove();
});
