import { describe, expect, it } from 'vitest';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';

const aad = {
  tabela: 'cadastro.anamnese_versao',
  paciente_id: '11111111-1111-4111-8111-111111111111',
  registro_id: '22222222-2222-4222-8222-222222222222',
  versao: 1,
  campo: 'conteudo',
  formato: 1,
} as const;

describe('cifra de anamnese', () => {
  it('protege conteúdo e rejeita substituição de paciente, registro ou versão', async () => {
    const cifra = criarCifraAutenticada({
      keyIdAtiva: 'teste',
      chavesDeCifra: { teste: new Uint8Array(32).fill(1) },
      chaveHmac: new Uint8Array(32).fill(2),
    });
    const texto = JSON.stringify([{ id: 'ficticio', respostas: [] }]);
    const envelope = await cifra.cifrar(texto, aad);
    expect(envelope.ciphertext).not.toContain('ficticio');
    await expect(cifra.decifrar(envelope, aad)).resolves.toBe(texto);
    for (const alteracao of [
      { paciente_id: '33333333-3333-4333-8333-333333333333' },
      { registro_id: '33333333-3333-4333-8333-333333333333' },
      { versao: 2 },
    ]) {
      await expect(cifra.decifrar(envelope, { ...aad, ...alteracao })).rejects.toThrow();
    }
    await expect(cifra.cifrar(texto, { ...aad, versao: 0 })).rejects.toThrow();
  });
});
