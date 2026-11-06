// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { FalhaApi } from './api.js';
import { montarPlanoCuidado, type ServicoPlanoCuidado } from './plano-cuidado.js';

it('carrega próxima página e remove dados após revogação', async () => {
  const raiz = document.createElement('div');
  const acesso = vi.fn();
  const consultarObjetivos = vi
    .fn()
    .mockResolvedValueOnce({ itens: [], proximo_cursor: 'cursor' })
    .mockRejectedValueOnce(new FalhaApi('negado', 403));
  montarPlanoCuidado(
    raiz,
    'paciente',
    {
      consultarObjetivos,
      consultarHistorico: vi.fn(),
      revisarObjetivo: vi.fn(),
      ciclo: {} as ServicoPlanoCuidado['ciclo'],
    },
    acesso,
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('Próxima página de objetivos'));
  [...raiz.querySelectorAll('button')]
    .find((botao) => botao.textContent === 'Próxima página de objetivos')
    ?.click();
  await vi.waitFor(() => expect(acesso).toHaveBeenCalledOnce());
  expect(consultarObjetivos).toHaveBeenLastCalledWith('paciente', 'cursor');
  expect(raiz.childElementCount).toBe(0);
});

const objetivo = {
  objetivo_id: 'objetivo',
  versao: 1,
  objetivo: {
    descricao: 'Primeiro',
    area: 'Área',
    responsavel: 'Equipe',
    situacaoInicial: 'Inicial',
    observacaoProgresso: 'Progresso',
    dataRevisao: '2026-12-01',
    estado: 'proposto' as const,
  },
};
const servicoBase = () => ({
  consultarObjetivos: vi.fn().mockResolvedValue({ itens: [objetivo], proximo_cursor: 'cursor' }),
  consultarHistorico: vi.fn(),
  revisarObjetivo: vi.fn(),
  ciclo: {} as ServicoPlanoCuidado['ciclo'],
});
const clicar = (raiz: HTMLElement, texto: string) => {
  const botao = [...raiz.querySelectorAll('button')].find((item) => item.textContent === texto);
  if (!botao) throw new Error(`Botão ausente: ${texto}`);
  botao.click();
};

it('não navega enquanto há rascunho aberto', async () => {
  const raiz = document.createElement('div');
  const servico = servicoBase();
  montarPlanoCuidado(raiz, 'paciente', servico, vi.fn());
  await vi.waitFor(() => expect(raiz.textContent).toContain('Revisar objetivo'));
  clicar(raiz, 'Revisar objetivo');
  const campo = raiz.querySelector('textarea');
  if (!campo) throw new Error('Campo ausente');
  campo.value = 'Rascunho';
  clicar(raiz, 'Próxima página de objetivos');
  expect(servico.consultarObjetivos).toHaveBeenCalledTimes(1);
  expect(campo.value).toBe('Rascunho');
  expect(raiz.contains(campo)).toBe(true);
});

it('ignora resposta tardia de paciente anterior após desmontagem', async () => {
  const raiz = document.createElement('div');
  let resolver!: (pagina: { itens: (typeof objetivo)[]; proximo_cursor: null }) => void;
  const anterior = servicoBase();
  anterior.consultarObjetivos.mockReturnValue(
    new Promise((resolve) => {
      resolver = resolve;
    }),
  );
  const desmontar = montarPlanoCuidado(raiz, 'anterior', anterior, vi.fn());
  desmontar();
  const atual = servicoBase();
  atual.consultarObjetivos.mockResolvedValue({ itens: [], proximo_cursor: null });
  montarPlanoCuidado(raiz, 'atual', atual, vi.fn());
  await vi.waitFor(() => expect(raiz.textContent).toContain('Nenhum objetivo'));
  resolver({ itens: [objetivo], proximo_cursor: null });
  await Promise.resolve();
  expect(raiz.textContent).not.toContain('Primeiro');
});

it('acumula histórico em ordem sem repetir versões entre páginas', async () => {
  const raiz = document.createElement('div');
  const servico = servicoBase();
  const registro = { ...objetivo, ator_usuario_id: 'autor', data: '2026-11-04T12:00:00Z' };
  servico.consultarHistorico
    .mockResolvedValueOnce({ itens: [registro], proximo_cursor: 'historico-cursor' })
    .mockResolvedValueOnce({ itens: [{ ...registro, versao: 2 }], proximo_cursor: null });
  montarPlanoCuidado(raiz, 'paciente', servico, vi.fn());
  await vi.waitFor(() => expect(raiz.textContent).toContain('Consultar histórico'));
  clicar(raiz, 'Consultar histórico');
  await vi.waitFor(() => expect(raiz.textContent).toContain('Carregar mais versões'));
  clicar(raiz, 'Carregar mais versões');
  await vi.waitFor(() => expect(raiz.textContent).toContain('Versão 2'));
  expect(servico.consultarHistorico).toHaveBeenLastCalledWith(
    'paciente',
    'objetivo',
    'historico-cursor',
  );
  expect([...raiz.querySelectorAll('h5')].map((h) => h.textContent)).toEqual([
    'Versão 1',
    'Versão 2',
  ]);
});
