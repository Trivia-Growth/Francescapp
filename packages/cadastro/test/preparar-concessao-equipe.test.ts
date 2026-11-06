import { expect, it } from 'vitest';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { prepararConcessaoEquipe } from '../src/preparar-concessao-equipe.ts';

it('protege email e motivo e normaliza índice de concessão', async () => {
  const cifra = criarCifraAutenticada({
    keyIdAtiva: 'v1',
    chavesDeCifra: { v1: new Uint8Array(32).fill(1) },
    chaveHmac: new Uint8Array(32).fill(2),
  });
  const id = 'a0000000-0000-4000-8000-000000000001';
  const resultado = await prepararConcessaoEquipe(
    {
      concessaoId: id,
      corpo: {
        email: ' Pessoa@Example.test ',
        perfil: 'profissional',
        metodo: 'google_workspace',
        motivo: 'Admissão fictícia',
      },
    },
    cifra,
  );
  expect(JSON.stringify(resultado)).not.toContain('Pessoa@Example.test');
  expect(resultado.email_hmac).toBe(
    await cifra.calcularHmac('email-concessao:pessoa@example.test'),
  );
  await expect(
    cifra.decifrar(resultado.email, {
      tabela: 'identidade.concessao_equipe',
      registro_id: id,
      campo: 'email',
      formato: 1,
    }),
  ).resolves.toBe('pessoa@example.test');
  await expect(
    cifra.decifrar(resultado.motivo, {
      tabela: 'identidade.concessao_equipe',
      registro_id: id,
      campo: 'motivo',
      formato: 1,
    }),
  ).resolves.toBe('Admissão fictícia');
});
