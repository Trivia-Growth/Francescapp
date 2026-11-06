import { afterEach, expect, it, vi } from 'vitest';
import edicaoPaciente from '../edicao-paciente.ts';

afterEach(() => vi.unstubAllEnvs());
it('não anuncia edição com flag desligada ou configuração ausente', async () => {
  const request = () => new Request('https://example.test/api/pacientes/edicao/disponibilidade');
  vi.stubEnv('FFCM_EDICAO_PACIENTE_ATIVADA', 'false');
  expect((await (await edicaoPaciente(request())).json()).dados.disponivel).toBe(false);
  vi.stubEnv('FFCM_EDICAO_PACIENTE_ATIVADA', 'true');
  expect((await (await edicaoPaciente(request())).json()).dados.disponivel).toBe(false);
});
