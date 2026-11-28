// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { createElement, useEffect } from 'react';
import { expect, it, vi } from 'vitest';
import { FalhaApi } from './api.js';
import { TarefasComDisponibilidade } from './integracao-tarefas-disponibilidade.js';
const usuario = '11111111-1111-4111-8111-111111111111';
const paciente = '22222222-2222-4222-8222-222222222222';
const outro = '33333333-3333-4333-8333-333333333333';
const esperar = () => new Promise((resolve) => setTimeout(resolve, 0));
function preparar() {
  const raiz = document.createElement('div');
  const estado = { identidade: { usuario_id: usuario, session_id: usuario }, caso: paciente };
  const consultarDisponibilidade = vi.fn(async (_paciente: string) => ({
    escrita_disponivel: false,
  }));
  const desmontarTela = vi.fn();
  function TelaDeTeste({ escrita }: { escrita: boolean }) {
    useEffect(() => () => desmontarTela(), []);
    return createElement('p', null, escrita ? 'Leitura e escrita' : 'Somente leitura');
  }
  const compor = vi.fn(
    (escrita: boolean, _identidade: () => { usuario_id: string; session_id: string } | null) =>
      createElement(TelaDeTeste, { escrita }),
  );
  const acessoPerdido = vi.fn();
  const iniciar = () =>
    render(
      createElement(TarefasComDisponibilidade, {
        pacienteId: paciente,
        portas: {
          identidadeAtual: () => estado.identidade,
          casoAtual: () => estado.caso,
          consultarDisponibilidade,
          compor,
          acessoPerdido,
        },
      }),
      { container: raiz },
    ).unmount;
  return { raiz, estado, consultarDisponibilidade, compor, acessoPerdido, desmontarTela, iniciar };
}

it('inicia fechado e monta somente leitura quando servidor responde false', async () => {
  const p = preparar();
  p.iniciar();
  expect(p.raiz.textContent).toContain('Conferindo disponibilidade');
  expect(p.compor).not.toHaveBeenCalled();
  await esperar();
  expect(p.consultarDisponibilidade).toHaveBeenCalledWith(paciente);
  expect(p.compor).toHaveBeenCalledWith(false, expect.any(Function));
  expect(p.raiz.textContent).toContain('indisponíveis neste caso');
});

it('habilita montagem com ciclo apenas após true do mesmo caso e sessão', async () => {
  const p = preparar();
  p.consultarDisponibilidade.mockResolvedValue({ escrita_disponivel: true });
  p.iniciar();
  await esperar();
  expect(p.compor).toHaveBeenCalledWith(true, expect.any(Function));
  const identidadeDoCiclo = p.compor.mock.calls[0]?.[1];
  expect(identidadeDoCiclo?.()).toEqual(p.estado.identidade);
  p.estado.caso = outro;
  expect(identidadeDoCiclo?.()).toBeNull();
  p.estado.caso = paciente;
  p.estado.identidade = { usuario_id: usuario, session_id: outro };
  expect(identidadeDoCiclo?.()).toBeNull();
});

it('falha mantém leitura e oferece nova tentativa, sem falso true', async () => {
  const p = preparar();
  document.body.append(p.raiz);
  p.consultarDisponibilidade.mockRejectedValueOnce(new Error('falha fictícia'));
  p.consultarDisponibilidade.mockResolvedValue({ escrita_disponivel: true });
  p.iniciar();
  await esperar();
  expect(p.compor.mock.calls[0]?.[0]).toBe(false);
  expect(p.raiz.textContent).toContain('Não foi possível conferir');
  const tentar = p.raiz.querySelector('button');
  tentar?.focus();
  tentar?.click();
  await vi.waitFor(() => expect(p.raiz.textContent).toContain('Leitura e escrita'));
  expect(p.compor.mock.calls[1]?.[0]).toBe(true);
  expect(p.desmontarTela).toHaveBeenCalledOnce();
  expect(document.activeElement?.textContent).toBe('Leitura e escrita');
});

it('esvazia os dados renderizados antes de avisar a perda de acesso', async () => {
  const p = preparar();
  p.consultarDisponibilidade
    .mockRejectedValueOnce(new Error('falha fictícia'))
    .mockRejectedValueOnce(new FalhaApi('sem_permissao', 403));
  const conteudoAoAvisar: (string | null)[] = [];
  p.acessoPerdido.mockImplementation(() => {
    conteudoAoAvisar.push(p.raiz.textContent);
  });
  p.iniciar();
  await vi.waitFor(() => expect(p.raiz.textContent).toContain('Somente leitura'));
  p.raiz.querySelector('button')?.click();
  await vi.waitFor(() => expect(p.acessoPerdido).toHaveBeenCalledOnce());
  expect(conteudoAoAvisar).toEqual(['']);
});

it('cancela a montagem já obsoleta fora do efeito de renderização', async () => {
  const p = preparar();
  p.estado.caso = outro;
  const erros = vi.spyOn(console, 'error');
  try {
    p.iniciar();
    await vi.waitFor(() => expect(p.raiz.textContent).toBe(''));
    expect(p.consultarDisponibilidade).not.toHaveBeenCalled();
    expect(erros).not.toHaveBeenCalledWith(expect.stringContaining('flushSync'));
  } finally {
    erros.mockRestore();
  }
});

for (const troca of ['caso', 'identidade'] as const) {
  it(`resposta antiga não libera escrita após troca de ${troca}`, async () => {
    const p = preparar();
    let resolver!: (valor: { escrita_disponivel: boolean }) => void;
    p.consultarDisponibilidade.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolver = resolve;
        }),
    );
    p.iniciar();
    await vi.waitFor(() => expect(p.consultarDisponibilidade).toHaveBeenCalledOnce());
    if (troca === 'caso') p.estado.caso = outro;
    else p.estado.identidade = { usuario_id: outro, session_id: outro };
    resolver({ escrita_disponivel: true });
    await esperar();
    expect(p.compor).not.toHaveBeenCalled();
    if (troca === 'caso') expect(p.acessoPerdido).not.toHaveBeenCalled();
    else expect(p.acessoPerdido).toHaveBeenCalledOnce();
  });
}

it('descarte ignora resposta atrasada e invalida identidade entregue ao ciclo', async () => {
  const p = preparar();
  p.consultarDisponibilidade.mockResolvedValue({ escrita_disponivel: true });
  const desmontar = p.iniciar();
  await esperar();
  const identidadeDoCiclo = p.compor.mock.calls[0]?.[1];
  expect(identidadeDoCiclo?.()).not.toBeNull();
  desmontar();
  expect(identidadeDoCiclo?.()).toBeNull();
  expect(p.desmontarTela).toHaveBeenCalledOnce();
  const atrasada = preparar();
  let resolver!: (valor: { escrita_disponivel: boolean }) => void;
  atrasada.consultarDisponibilidade.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolver = resolve;
      }),
  );
  const descartar = atrasada.iniciar();
  await vi.waitFor(() => expect(atrasada.consultarDisponibilidade).toHaveBeenCalledOnce());
  descartar();
  resolver({ escrita_disponivel: true });
  await esperar();
  expect(atrasada.compor).not.toHaveBeenCalled();
  expect(atrasada.raiz.childElementCount).toBe(0);
});
