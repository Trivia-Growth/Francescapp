// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { montarTarefasComDisponibilidade } from './integracao-tarefas-disponibilidade.ts';
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
  const montar = vi.fn(
    (
      _destino: HTMLElement,
      _escrita: boolean,
      _identidade: () => { usuario_id: string; session_id: string } | null,
    ) => desmontarTela,
  );
  const acessoPerdido = vi.fn();
  const iniciar = () =>
    montarTarefasComDisponibilidade(raiz, paciente, {
      identidadeAtual: () => estado.identidade,
      casoAtual: () => estado.caso,
      consultarDisponibilidade,
      montar,
      acessoPerdido,
    });
  return { raiz, estado, consultarDisponibilidade, montar, acessoPerdido, desmontarTela, iniciar };
}

it('inicia fechado e monta somente leitura quando servidor responde false', async () => {
  const p = preparar();
  p.iniciar();
  expect(p.raiz.textContent).toContain('Conferindo disponibilidade');
  expect(p.montar).not.toHaveBeenCalled();
  await esperar();
  expect(p.consultarDisponibilidade).toHaveBeenCalledWith(paciente);
  expect(p.montar).toHaveBeenCalledWith(expect.any(HTMLElement), false, expect.any(Function));
  expect(p.raiz.textContent).toContain('indisponíveis neste caso');
});

it('habilita montagem com ciclo apenas após true do mesmo caso e sessão', async () => {
  const p = preparar();
  p.consultarDisponibilidade.mockResolvedValue({ escrita_disponivel: true });
  p.iniciar();
  await esperar();
  expect(p.montar).toHaveBeenCalledWith(expect.any(HTMLElement), true, expect.any(Function));
  const identidadeDoCiclo = p.montar.mock.calls[0]?.[2];
  expect(identidadeDoCiclo?.()).toEqual(p.estado.identidade);
  p.estado.caso = outro;
  expect(identidadeDoCiclo?.()).toBeNull();
  p.estado.caso = paciente;
  p.estado.identidade = { usuario_id: usuario, session_id: outro };
  expect(identidadeDoCiclo?.()).toBeNull();
});

it('falha mantém leitura e oferece nova tentativa, sem falso true', async () => {
  const p = preparar();
  p.consultarDisponibilidade.mockRejectedValueOnce(new Error('falha fictícia'));
  p.consultarDisponibilidade.mockResolvedValue({ escrita_disponivel: true });
  p.iniciar();
  await esperar();
  expect(p.montar.mock.calls[0]?.[1]).toBe(false);
  expect(p.raiz.textContent).toContain('Não foi possível conferir');
  p.raiz.querySelector('button')?.click();
  await esperar();
  expect(p.montar.mock.calls[1]?.[1]).toBe(true);
  expect(p.desmontarTela).toHaveBeenCalledOnce();
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
    if (troca === 'caso') p.estado.caso = outro;
    else p.estado.identidade = { usuario_id: outro, session_id: outro };
    resolver({ escrita_disponivel: true });
    await esperar();
    expect(p.montar).not.toHaveBeenCalled();
    if (troca === 'caso') expect(p.acessoPerdido).not.toHaveBeenCalled();
    else expect(p.acessoPerdido).toHaveBeenCalledOnce();
  });
}

it('descarte ignora resposta atrasada e invalida identidade entregue ao ciclo', async () => {
  const p = preparar();
  p.consultarDisponibilidade.mockResolvedValue({ escrita_disponivel: true });
  const desmontar = p.iniciar();
  await esperar();
  const identidadeDoCiclo = p.montar.mock.calls[0]?.[2];
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
  descartar();
  resolver({ escrita_disponivel: true });
  await esperar();
  expect(atrasada.montar).not.toHaveBeenCalled();
  expect(atrasada.raiz.childElementCount).toBe(0);
});
