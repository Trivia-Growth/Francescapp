import { afterEach, expect, it, vi } from 'vitest';
import acessoPaciente from '../acesso-paciente.ts';
import barreiraAcesso from '../barreira-acesso.ts';

afterEach(() => vi.unstubAllEnvs());
it('mantém reserva e concessão indisponíveis sem ativação específica', async () => {
  vi.stubEnv('FFCM_ACESSO_PACIENTE_ATIVADO', 'true');
  vi.stubEnv('FFCM_BARREIRA_ACESSO_ATIVADA', 'false');
  const barreira = await barreiraAcesso(new Request('https://example.test/api/acessos/barreira'));
  const concessao = await acessoPaciente(
    new Request('https://example.test/api/pacientes/a0000000-0000-4000-8000-000000000001/acessos', {
      method: 'POST',
    }),
  );
  expect(barreira.status).toBe(503);
  expect(concessao.status).toBe(503);
});
