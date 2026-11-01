import { describe, expect, it } from 'vitest';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { criarIdempotenciaNativa } from './idempotencia-nativa.ts';

describe('idempotência nativa', () => {
  it('mantém digest estável e separa comandos e outros usos da chave', async () => {
    const cifra = criarCifraAutenticada({
      keyIdAtiva: 'teste',
      chavesDeCifra: { teste: new Uint8Array(32).fill(1) },
      chaveHmac: new Uint8Array(32).fill(2),
    });
    const idempotencia = criarIdempotenciaNativa(cifra);
    const comando = '{"operacao":"criar"}';
    const digest = await idempotencia.calcularDigestIdempotencia(comando);
    expect(await idempotencia.calcularDigestIdempotencia(comando)).toBe(digest);
    expect(await idempotencia.calcularDigestIdempotencia(`${comando} `)).not.toBe(digest);
    expect(await cifra.calcularHmac(comando)).not.toBe(digest);
    expect(() => idempotencia.calcularDigestIdempotencia('')).toThrow();
  });
});
