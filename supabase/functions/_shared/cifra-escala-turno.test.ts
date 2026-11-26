import { expect, it } from 'vitest';
import { criarCifraAutenticada } from './cifra-autenticada.ts';

it('motivo não abre em outra escala, caso ou versão', async () => {
  const cifra = criarCifraAutenticada({
    keyIdAtiva: 'teste',
    chavesDeCifra: { teste: new Uint8Array(32).fill(17) },
    chaveHmac: new Uint8Array(32).fill(43),
  });
  const aad = {
    tabela: 'cadastro.turno_escala_versao' as const,
    paciente_id: '11111111-1111-4111-8111-111111111111',
    escala_id: '22222222-2222-4222-8222-222222222222',
    versao: 2,
    campo: 'motivo' as const,
    formato: 1 as const,
  };
  const campo = await cifra.cifrar('Motivo fictício reservado', aad);
  await expect(cifra.decifrar(campo, aad)).resolves.toBe('Motivo fictício reservado');
  for (const alterado of [
    { ...aad, paciente_id: aad.escala_id },
    { ...aad, escala_id: aad.paciente_id },
    { ...aad, versao: 3 },
  ])
    await expect(cifra.decifrar(campo, alterado)).rejects.toThrow();
});
