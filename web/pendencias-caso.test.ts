// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { montarPendenciasCaso } from './pendencias-caso';
import { montarFiltrosCarteira, montarSinalCarteira } from './filtros-carteira';
import type { SinalOperacional } from '../packages/contracts/src/pendencia';

const PACIENTE = '40000000-0000-4000-8000-000000000001';
const EQUIPE = [
  { usuario_id: '10000000-0000-4000-8000-000000000002', rotulo: 'Pessoa Fictícia', ativo: true },
  { usuario_id: '10000000-0000-4000-8000-000000000003', rotulo: 'Saiu Fictício', ativo: false },
];

const sinal = (ajustes: Partial<SinalOperacional> = {}): SinalOperacional => ({
  paciente_id: PACIENTE,
  estado: 'atencao_operacional',
  acordo: {
    versao: 1,
    dias_entre_atualizacoes: 30,
    dias_antecedencia_revisao: 14,
    dias_retorno_encaminhamento: 21,
    proxima_revisao_em: '2026-12-01',
  },
  ultima_atualizacao_em: '2026-11-01T12:00:00+00:00',
  pendencias: [
    {
      tipo: 'revisao_proxima',
      chave_origem: 'revisao:2026-12-01',
      motivo: 'Revisão acordada para 01/12/2026.',
      desde: '2026-11-17',
      estado: 'aberta',
      atribuido_usuario_id: null,
      tratada_em: null,
    },
  ],
  perfil_escrita_acordo: true,
  ...ajustes,
});

it('resolver grava a tratativa contra a chave de origem e mantém a origem listada', async () => {
  const raiz = document.createElement('div');
  const consultar = vi.fn(async () => sinal());
  const tratar = vi.fn(async () =>
    sinal({
      estado: 'em_dia',
      pendencias: [
        {
          tipo: 'revisao_proxima',
          chave_origem: 'revisao:2026-12-01',
          motivo: 'Revisão acordada para 01/12/2026.',
          desde: '2026-11-17',
          estado: 'resolvida',
          atribuido_usuario_id: null,
          tratada_em: '2026-11-18T10:00:00+00:00',
        },
      ],
    }),
  );
  montarPendenciasCaso(
    raiz,
    PACIENTE,
    { consultar, acordar: vi.fn(), tratar },
    () => {},
    async () => EQUIPE,
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('Revisão acordada para 01/12/2026.'));

  const resolver = [...raiz.querySelectorAll('button')].find(
    (botao) => botao.textContent === 'Resolver',
  ) as HTMLButtonElement;
  resolver.click();
  await vi.waitFor(() => expect(tratar).toHaveBeenCalled());
  expect(tratar).toHaveBeenCalledWith(PACIENTE, {
    tipo: 'revisao_proxima',
    chave_origem: 'revisao:2026-12-01',
    acao: 'resolvida',
    atribuido_usuario_id: null,
  });

  // FR-027: resolver não apaga a origem — ela continua visível e pode ser reaberta.
  await vi.waitFor(() => expect(raiz.textContent).toContain('Resolvidas'));
  expect(raiz.textContent).toContain('Revisão acordada para 01/12/2026.');
  expect(
    [...raiz.querySelectorAll('button')].some((botao) => botao.textContent === 'Reabrir'),
  ).toBe(true);
});

it('atribuir só oferece pessoa ativa da equipe e envia o destinatário escolhido', async () => {
  const raiz = document.createElement('div');
  const tratar = vi.fn(async () => sinal());
  montarPendenciasCaso(
    raiz,
    PACIENTE,
    { consultar: async () => sinal(), acordar: vi.fn(), tratar },
    () => {},
    async () => EQUIPE,
  );
  await vi.waitFor(() => expect(raiz.querySelector('.pendencia-atribuir select')).not.toBeNull());
  const selecao = raiz.querySelector('.pendencia-atribuir select') as HTMLSelectElement;
  expect([...selecao.options].map((opcao) => opcao.value)).toEqual([
    '',
    '10000000-0000-4000-8000-000000000002',
  ]);
  selecao.value = '10000000-0000-4000-8000-000000000002';
  selecao.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(tratar).toHaveBeenCalled());
  expect(tratar.mock.calls[0]?.[1]).toMatchObject({
    acao: 'atribuida',
    atribuido_usuario_id: '10000000-0000-4000-8000-000000000002',
  });
});

it('sem periodicidade acordada o estado é informação insuficiente, nunca "em dia"', async () => {
  const raiz = document.createElement('div');
  montarPendenciasCaso(
    raiz,
    PACIENTE,
    {
      consultar: async () =>
        sinal({ estado: 'informacao_insuficiente', acordo: null, pendencias: [] }),
      acordar: vi.fn(),
      tratar: vi.fn(),
    },
    () => {},
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('Informação insuficiente'));
  expect(raiz.textContent).toContain('Não é avaliação clínica');
  expect(raiz.textContent).not.toContain('Compromissos operacionais em dia');
});

it('quem não pode acordar a periodicidade não recebe o formulário', async () => {
  const raiz = document.createElement('div');
  montarPendenciasCaso(
    raiz,
    PACIENTE,
    {
      consultar: async () => sinal({ perfil_escrita_acordo: false }),
      acordar: vi.fn(),
      tratar: vi.fn(),
    },
    () => {},
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('Periodicidade acordada'));
  expect(raiz.querySelector('.pendencia-acordo form')).toBeNull();
});

it('acordar envia a versão vigente e aceita periodicidade em branco', async () => {
  const raiz = document.createElement('div');
  const acordar = vi.fn(async () => sinal());
  montarPendenciasCaso(
    raiz,
    PACIENTE,
    { consultar: async () => sinal(), acordar, tratar: vi.fn() },
    () => {},
  );
  await vi.waitFor(() => expect(raiz.querySelector('.pendencia-acordo form')).not.toBeNull());
  const formulario = raiz.querySelector('.pendencia-acordo form') as HTMLFormElement;
  (formulario.elements.namedItem('dias_entre_atualizacoes') as HTMLInputElement).value = '';
  formulario.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(acordar).toHaveBeenCalled());
  expect(acordar).toHaveBeenCalledWith(PACIENTE, {
    versao_esperada: 1,
    dias_entre_atualizacoes: null,
    dias_antecedencia_revisao: 14,
    dias_retorno_encaminhamento: 21,
    proxima_revisao_em: '2026-12-01',
  });
});

it('a barra de filtros entrega o recorte escolhido e esconde responsável fora do Administrador', () => {
  const raiz = document.createElement('div');
  const aoFiltrar = vi.fn();
  montarFiltrosCarteira(raiz, { administrador: true, responsaveis: EQUIPE }, aoFiltrar);
  const revisao = raiz.querySelector('select[name="revisao"]') as HTMLSelectElement;
  revisao.value = 'vencida';
  revisao.dispatchEvent(new Event('change'));
  expect(aoFiltrar).toHaveBeenCalledWith({ revisao: 'vencida' });

  const pendencia = raiz.querySelector('select[name="pendencia"]') as HTMLSelectElement;
  pendencia.value = 'abertas';
  pendencia.dispatchEvent(new Event('change'));
  expect(aoFiltrar).toHaveBeenLastCalledWith({ revisao: 'vencida', pendencia: 'abertas' });

  (
    [...raiz.querySelectorAll('button')].find(
      (botao) => botao.textContent === 'Limpar filtros',
    ) as HTMLButtonElement
  ).click();
  expect(aoFiltrar).toHaveBeenLastCalledWith({});

  const outra = document.createElement('div');
  montarFiltrosCarteira(outra, { administrador: false }, vi.fn());
  expect(outra.querySelector('select[name="responsavel"]')).toBeNull();
  expect(outra.querySelector('select[name="situacao"]')).toBeNull();
  expect(outra.querySelector('select[name="revisao"]')).not.toBeNull();
});

it('o selo do sinal sempre carrega motivo e o aviso de que não é leitura clínica', () => {
  const selo = montarSinalCarteira({
    estado: 'em_dia',
    motivos: ['Nenhum compromisso operacional em atraso.'],
  });
  expect(selo.dataset.estado).toBe('em_dia');
  expect(selo.textContent).toContain('Nenhum compromisso operacional em atraso.');
  expect(selo.textContent).toContain('Não é avaliação clínica');
  expect(selo.title).toContain('Não é avaliação clínica');
});
