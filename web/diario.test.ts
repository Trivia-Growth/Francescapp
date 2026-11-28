// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { createElement, type ComponentProps } from 'react';
import { expect, it, vi } from 'vitest';
import type { RegistroDiario } from '../packages/contracts/src/diario.ts';
import { responderConfirmacoes } from './confirmacao-prova.js';
import { TelaDiario, type ServicoDiarioTela } from './diario.js';
import { FalhaApi } from './api.js';

function montarDiario(
  raiz: HTMLElement,
  pacienteId: ComponentProps<typeof TelaDiario>['pacienteId'],
  usuarioId: ComponentProps<typeof TelaDiario>['usuarioId'],
  servico: ComponentProps<typeof TelaDiario>['servico'],
  obterAreas: ComponentProps<typeof TelaDiario>['obterAreas'],
  acessoPerdido: ComponentProps<typeof TelaDiario>['acessoPerdido'],
  alteracaoPendente: ComponentProps<typeof TelaDiario>['alteracaoPendente'] = () => {},
  converterEmTarefa: ComponentProps<typeof TelaDiario>['converterEmTarefa'] = undefined,
  audio: ComponentProps<typeof TelaDiario>['audio'] = undefined,
  ehFamilia: ComponentProps<typeof TelaDiario>['ehFamilia'] = false,
) {
  const painel = render(
    createElement(TelaDiario, {
      pacienteId,
      usuarioId,
      servico,
      obterAreas,
      acessoPerdido,
      alteracaoPendente,
      converterEmTarefa,
      audio,
      ehFamilia,
    }),
    { container: raiz },
  );
  return () => painel.rerender(null);
}

const pacienteId = '10000000-0000-4000-8000-000000000001';
const familiaId = '30000000-0000-4000-8000-000000000001';
const profissionalId = '30000000-0000-4000-8000-000000000002';

const registro = (parcial: Partial<RegistroDiario> = {}): RegistroDiario =>
  ({
    diario_registro_id: '20000000-0000-4000-8000-000000000001',
    registro_id: '20000000-0000-4000-8000-000000000001',
    versao: 1,
    tipo: 'evolucao_profissional',
    autor_usuario_id: profissionalId,
    estado: 'publicado',
    audiencia: 'equipe_e_familia',
    atencao: false,
    retorno_solicitado: false,
    origem_conteudo: 'texto',
    responde_registro_id: null,
    tarefa_id: null,
    criado_em: '2026-11-05T12:00:00Z',
    consultas: 0,
    conteudo: { data: '2026-11-05', area: 'Psicologia', atividade: 'Encontro semanal.' },
    ...parcial,
  }) as RegistroDiario;

function servico(
  consultar: () => Promise<RegistroDiario[]> = async () => [],
  salvar: ServicoDiarioTela['salvar'] = async () => registro(),
): ServicoDiarioTela {
  return { consultar, salvar };
}

const esperar = () => new Promise((resolve) => setTimeout(resolve, 0));

it('mostra o formulário de relato da família, não o de evolução profissional', async () => {
  const raiz = document.createElement('div');
  montarDiario(
    raiz,
    pacienteId,
    familiaId,
    servico(),
    () => [],
    vi.fn(),
    undefined,
    undefined,
    undefined,
    true,
  );
  await esperar();

  expect(raiz.querySelector('h3')?.textContent).toBe('Registrar no diário');
  // Campos da evolução profissional (vocabulário da equipe) não aparecem para família.
  expect(raiz.textContent).not.toContain('Indicar necessidade de atenção');
  expect(raiz.textContent).not.toContain('Quem verá este registro');
  expect(raiz.textContent).not.toContain('Área (obrigatória)');
  // Campos do relato (FR-008) aparecem.
  expect(raiz.textContent).toContain('Quando aconteceu?');
  expect(raiz.textContent).toContain('O que aconteceu?');
  expect(raiz.textContent).toContain('Gostaria de um retorno da coordenação');
});

it('relato da família grava tipo relato_familiar com audiência equipe, nunca a da evolução', async () => {
  const raiz = document.createElement('div');
  const salvar = vi.fn(async (_paciente: string, entrada: unknown) => registro());
  montarDiario(
    raiz,
    pacienteId,
    familiaId,
    servico(undefined, salvar),
    () => [],
    vi.fn(),
    undefined,
    undefined,
    undefined,
    true,
  );
  await esperar();

  const data = raiz.querySelector<HTMLInputElement>('input[type="date"]');
  const [descricao] = [...raiz.querySelectorAll('textarea')];
  if (!data || !descricao) throw new Error('Campos do relato indisponíveis.');
  data.value = '2026-11-05';
  descricao.value = 'Uma caminhada depois do café.';
  raiz.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  await esperar();

  expect(salvar).toHaveBeenCalledTimes(1);
  const entrada = salvar.mock.calls[0]?.[1] as Record<string, unknown>;
  expect(entrada).toMatchObject({
    tipo: 'relato_familiar',
    estado: 'publicado',
    audiencia: 'equipe',
    atencao: false,
    conteudo: { dataAcontecimento: '2026-11-05', descricao: 'Uma caminhada depois do café.' },
  });
  // Nunca o vocabulário/estrutura da evolução profissional.
  expect(entrada.tipo).not.toBe('evolucao_profissional');
});

it('família não vê "Responder" numa evolução profissional compartilhada com ela', async () => {
  const raiz = document.createElement('div');
  const compartilhada = registro({ audiencia: 'equipe_e_familia' });
  montarDiario(
    raiz,
    pacienteId,
    familiaId,
    servico(async () => [compartilhada]),
    () => [],
    vi.fn(),
    undefined,
    undefined,
    undefined,
    true,
  );
  await esperar();

  expect(raiz.textContent).not.toContain('Responder');
});

it('fora da família, o formulário de evolução profissional continua aparecendo (regressão)', async () => {
  const raiz = document.createElement('div');
  montarDiario(raiz, pacienteId, profissionalId, servico(), () => []);
  await esperar();

  expect(raiz.querySelector('h3')?.textContent).toBe('Registrar evolução profissional');
  expect(raiz.textContent).toContain('Indicar necessidade de atenção');
});

it('família retoma e publica seu rascunho com categoria e versão existentes', async () => {
  const raiz = document.createElement('div');
  const proprio = registro({
    tipo: 'relato_familiar',
    autor_usuario_id: familiaId,
    estado: 'rascunho',
    versao: 3,
    audiencia: 'equipe',
    retorno_solicitado: true,
    origem_conteudo: 'audio_transcrito',
    conteudo: {
      dataAcontecimento: '2026-11-05',
      descricao: 'Relato fictício',
      categoria: 'Rotina',
      contexto: 'Ajudou',
      acaoTomada: 'Conversamos',
    },
  });
  const alheio = registro({
    ...proprio,
    diario_registro_id: '20000000-0000-4000-8000-000000000002',
    autor_usuario_id: profissionalId,
  });
  const salvar = vi.fn(async () => registro({ ...proprio, estado: 'publicado', versao: 4 }));
  const pendente = vi.fn();
  montarDiario(
    raiz,
    pacienteId,
    familiaId,
    servico(async () => [proprio, alheio], salvar),
    () => [],
    vi.fn(),
    pendente,
    undefined,
    undefined,
    true,
  );
  await esperar();
  const artigos = raiz.querySelectorAll('article');
  const botoes = [...artigos[0].querySelectorAll('button')];
  expect(artigos[1].textContent).not.toContain('Retomar rascunho');
  botoes.find((botao) => botao.textContent === 'Retomar rascunho')?.click();
  const form = raiz.querySelector('form');
  if (!form) throw new Error('Formulário de retomada indisponível.');
  const categoria = [...form.querySelectorAll('label')]
    .find((label) => label.textContent?.includes('Categoria'))
    ?.querySelector('input');
  if (!categoria) throw new Error('Categoria indisponível.');
  expect(categoria.value).toBe('Rotina');
  expect(form.querySelector('textarea')?.value).toBe('Relato fictício');
  categoria.value = 'Bem-estar';
  categoria.dispatchEvent(new Event('input', { bubbles: true }));
  expect(pendente).toHaveBeenCalledWith(true);
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await esperar();
  expect(salvar).toHaveBeenCalledWith(
    pacienteId,
    expect.objectContaining({
      diario_registro_id: proprio.diario_registro_id,
      versao_esperada: 3,
      estado: 'publicado',
      tipo: 'relato_familiar',
      audiencia: 'equipe',
      retorno_solicitado: true,
      origem_conteudo: 'audio_transcrito',
      conteudo: {
        dataAcontecimento: '2026-11-05',
        descricao: 'Relato fictício',
        categoria: 'Bem-estar',
        contexto: 'Ajudou',
        acaoTomada: 'Conversamos',
      },
    }),
  );
  expect(pendente).toHaveBeenLastCalledWith(false);
});

it('retomar rascunho confirma descarte e mantém somente um formulário familiar', async () => {
  const raiz = document.createElement('div');
  const proprio = registro({
    tipo: 'relato_familiar',
    autor_usuario_id: familiaId,
    estado: 'rascunho',
    audiencia: 'equipe',
    conteudo: { dataAcontecimento: '2026-11-05', descricao: 'Rascunho salvo' },
  });
  const pendente = vi.fn();
  const confirmacao = responderConfirmacoes(false);
  montarDiario(
    raiz,
    pacienteId,
    familiaId,
    servico(async () => [proprio]),
    () => [],
    vi.fn(),
    pendente,
    undefined,
    undefined,
    true,
  );
  await esperar();
  const descricao = raiz.querySelector('form textarea');
  if (!descricao) throw new Error('Descrição indisponível.');
  descricao.value = 'Novo relato pendente';
  descricao.dispatchEvent(new Event('input', { bubbles: true }));
  const retomar = [...raiz.querySelectorAll('button')].find(
    (botao) => botao.textContent === 'Retomar rascunho',
  );
  if (!retomar) throw new Error('Retomada indisponível.');
  retomar.click();
  await esperar();
  expect(raiz.querySelector('form textarea')?.value).toBe('Novo relato pendente');
  expect(pendente).toHaveBeenLastCalledWith(true);
  confirmacao.resposta = true;
  retomar.click();
  await esperar();
  expect(raiz.querySelectorAll('form')).toHaveLength(1);
  expect(raiz.querySelector('form textarea')?.value).toBe('Rascunho salvo');
  expect(pendente).toHaveBeenLastCalledWith(false);
  expect(confirmacao.chamadas).toHaveLength(2);
  confirmacao.encerrar();
});

it('oculta leituras antigas e reconsulta ao voltar sem perder edição familiar', async () => {
  const raiz = document.createElement('div');
  let resolver: (registros: RegistroDiario[]) => void = () => {};
  const consultar = vi
    .fn()
    .mockResolvedValueOnce([registro()])
    .mockImplementationOnce(
      () =>
        new Promise<RegistroDiario[]>((resolve) => {
          resolver = resolve;
        }),
    );
  const pendente = vi.fn();
  montarDiario(
    raiz,
    pacienteId,
    familiaId,
    servico(consultar),
    () => [],
    vi.fn(),
    pendente,
    undefined,
    undefined,
    true,
  );
  await esperar();
  const descricao = raiz.querySelector('textarea');
  if (!descricao) throw new Error('Descrição indisponível.');
  descricao.value = 'Edição pendente';
  descricao.dispatchEvent(new Event('input', { bubbles: true }));
  expect(raiz.textContent).toContain('Encontro semanal.');
  const visibilidade = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  expect(raiz.textContent).not.toContain('Encontro semanal.');
  visibilidade.mockReturnValue('visible');
  document.dispatchEvent(new Event('visibilitychange'));
  expect(raiz.textContent).not.toContain('Encontro semanal.');
  resolver([]);
  await esperar();
  expect(raiz.textContent).not.toContain('Encontro semanal.');
  expect(raiz.querySelector('textarea')?.value).toBe('Edição pendente');
  expect(raiz.querySelectorAll('form')).toHaveLength(1);
  expect(pendente).toHaveBeenLastCalledWith(true);
  visibilidade.mockRestore();
});

it('retificar troca editor familiar somente após confirmar descarte', async () => {
  const raiz = document.createElement('div');
  const proprio = registro({
    tipo: 'relato_familiar',
    autor_usuario_id: familiaId,
    audiencia: 'equipe',
    conteudo: { dataAcontecimento: '2026-11-05', descricao: 'Relato publicado' },
  });
  const confirmacao = responderConfirmacoes(false);
  const desmontar = montarDiario(
    raiz,
    pacienteId,
    familiaId,
    servico(async () => [proprio]),
    () => [],
    vi.fn(),
    undefined,
    undefined,
    undefined,
    true,
  );
  await esperar();
  const descricao = raiz.querySelector('textarea');
  if (!descricao) throw new Error('Descrição indisponível.');
  descricao.value = 'Texto pendente';
  descricao.dispatchEvent(new Event('input', { bubbles: true }));
  const retificar = [...raiz.querySelectorAll('button')].find(
    (botao) => botao.textContent === 'Retificar',
  );
  if (!retificar) throw new Error('Retificação indisponível.');
  retificar.click();
  await esperar();
  expect(raiz.querySelector('textarea')?.value).toBe('Texto pendente');
  confirmacao.resposta = true;
  retificar.click();
  await esperar();
  expect(raiz.querySelectorAll('form')).toHaveLength(1);
  expect(raiz.textContent).toContain('Motivo da retificação');
  desmontar();
  confirmacao.encerrar();
});

it('reconsulta familiar negada encerra acesso e remove conteúdo', async () => {
  const raiz = document.createElement('div');
  const erro = new FalhaApi('sem_permissao', 403);
  const acessoPerdido = vi.fn();
  const consultar = vi.fn().mockResolvedValueOnce([registro()]).mockRejectedValueOnce(erro);
  const desmontar = montarDiario(
    raiz,
    pacienteId,
    familiaId,
    servico(consultar),
    () => [],
    acessoPerdido,
    undefined,
    undefined,
    undefined,
    true,
  );
  await esperar();
  const visibilidade = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  visibilidade.mockReturnValue('visible');
  document.dispatchEvent(new Event('visibilitychange'));
  await esperar();
  expect(acessoPerdido).toHaveBeenCalledWith(erro);
  expect(raiz.childElementCount).toBe(0);
  desmontar();
  visibilidade.mockRestore();
});

it('anuncia carregamento até consulta inicial concluir antes de declarar diário vazio', async () => {
  const raiz = document.createElement('div');
  let resolver: (registros: RegistroDiario[]) => void = () => {};
  const desmontar = montarDiario(
    raiz,
    pacienteId,
    familiaId,
    servico(
      () =>
        new Promise((resolve) => {
          resolver = resolve;
        }),
    ),
    () => [],
    vi.fn(),
    undefined,
    undefined,
    undefined,
    true,
  );
  expect(raiz.textContent).toContain('Carregando o diário');
  expect(raiz.textContent).not.toContain('Nenhum registro');
  expect(raiz.querySelector('[aria-busy="true"]')).not.toBeNull();
  resolver([]);
  await esperar();
  expect(raiz.textContent).toContain('Nenhum registro');
  expect(raiz.textContent).not.toContain('Carregando o diário');
  expect(raiz.querySelector('[aria-busy="false"]')).not.toBeNull();
  desmontar();
});

it('mantém rascunho salvo enquanto consulta anterior ainda está pendente', async () => {
  const raiz = document.createElement('div');
  let resolverConsulta: (registros: RegistroDiario[]) => void = () => {};
  const salvo = registro({
    tipo: 'relato_familiar',
    autor_usuario_id: familiaId,
    estado: 'rascunho',
    audiencia: 'equipe',
    conteudo: { dataAcontecimento: '2026-11-05', descricao: 'Novo rascunho' },
  });
  const desmontar = montarDiario(
    raiz,
    pacienteId,
    familiaId,
    servico(
      () =>
        new Promise((resolve) => {
          resolverConsulta = resolve;
        }),
      async () => salvo,
    ),
    () => [],
    vi.fn(),
    undefined,
    undefined,
    undefined,
    true,
  );
  const data = raiz.querySelector<HTMLInputElement>('input[type="date"]');
  const descricao = raiz.querySelector('textarea');
  if (!data || !descricao) throw new Error('Campos indisponíveis.');
  data.value = '2026-11-05';
  descricao.value = 'Novo rascunho';
  const botao = [...raiz.querySelectorAll('button')].find(
    (item) => item.textContent === 'Salvar rascunho',
  );
  if (!botao) throw new Error('Salvar indisponível.');
  botao.click();
  await esperar();
  resolverConsulta([]);
  await esperar();
  expect(raiz.textContent).toContain('Novo rascunho');
  expect(raiz.textContent).toContain('Retomar rascunho');
  expect(raiz.textContent).not.toContain('Nenhum registro');
  desmontar();
});
