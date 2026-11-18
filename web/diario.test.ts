// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import type { RegistroDiario } from '../packages/contracts/src/diario.ts';
import { montarDiario, type ServicoDiarioTela } from './diario.js';

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
