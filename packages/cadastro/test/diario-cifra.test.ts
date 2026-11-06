import { describe, expect, it } from 'vitest';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';

const aad = {
  tabela: 'cadastro.diario_rascunho_textual',
  paciente_id: '11111111-1111-4111-8111-111111111111',
  autor_usuario_id: '22222222-2222-4222-8222-222222222222',
  registro_id: '33333333-3333-4333-8333-333333333333',
  versao: 1,
  campo: 'conteudo',
  formato: 1,
} as const;

describe('cifra de rascunho do diário', () => {
  it('protege conteúdo e rejeita troca de paciente, autor, registro ou versão', async () => {
    const cifra = criarCifraAutenticada({
      keyIdAtiva: 'teste',
      chavesDeCifra: { teste: new Uint8Array(32).fill(1) },
      chaveHmac: new Uint8Array(32).fill(2),
    });
    const texto = JSON.stringify({ dataAcontecimento: '2026-01-01', descricao: 'fictício' });
    const envelope = await cifra.cifrar(texto, aad);
    expect(envelope.ciphertext).not.toContain('fictício');
    await expect(cifra.decifrar(envelope, aad)).resolves.toBe(texto);
    for (const alteracao of [
      { paciente_id: '44444444-4444-4444-8444-444444444444' },
      { autor_usuario_id: '44444444-4444-4444-8444-444444444444' },
      { registro_id: '44444444-4444-4444-8444-444444444444' },
      { versao: 2 },
    ]) {
      await expect(cifra.decifrar(envelope, { ...aad, ...alteracao })).rejects.toThrow();
    }
    await expect(cifra.cifrar(texto, { ...aad, versao: 0 })).rejects.toThrow();
  });
});
