import { afterEach, expect, it, vi } from 'vitest';
import anamnese, { config } from '../anamnese.ts';

afterEach(() => vi.unstubAllEnvs());

it('mantém histórico fechado por flag própria mesmo com anamnese ativa', async () => {
  vi.stubEnv('FFCM_ANAMNESE_ATIVADA', 'true');
  vi.stubEnv('FFCM_HISTORICO_ANAMNESE_ATIVADO', 'false');
  expect(config.path).toContain('/api/pacientes/:paciente_id/anamnese/historico');
  const resposta = await anamnese(
    new Request(
      'https://example.test/api/pacientes/11111111-1111-4111-8111-111111111111/anamnese/historico',
    ),
  );
  expect(resposta.status).toBe(503);
  expect(resposta.headers.get('cache-control')).toContain('no-store');
});

it.each([
  [undefined, undefined, false],
  ['true', undefined, false],
  [undefined, 'true', false],
  ['true', 'true', true],
])('disponibilidade exige ambas as flags', async (anamneseAtiva, historicoAtivo, esperado) => {
  vi.stubEnv('FFCM_ANAMNESE_ATIVADA', anamneseAtiva);
  vi.stubEnv('FFCM_HISTORICO_ANAMNESE_ATIVADO', historicoAtivo);
  const resposta = await anamnese(
    new Request('https://example.test/api/anamnese/historico/disponibilidade'),
  );
  expect((await resposta.json()).dados.disponivel).toBe(esperado);
  expect(resposta.headers.get('cache-control')).toContain('no-store');
});
