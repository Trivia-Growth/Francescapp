import type { CifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';

/** A chave HMAC vem do cofre; o domínio separa este uso de outros HMACs. */
export function criarIdempotenciaNativa(cifra: Pick<CifraAutenticada, 'calcularHmac'>) {
  return Object.freeze({
    calcularDigestIdempotencia(comandoLogico: string): Promise<string> {
      if (typeof comandoLogico !== 'string' || comandoLogico.length === 0) {
        throw new Error('Comando inválido.');
      }
      return cifra.calcularHmac(`ffcmapp:idempotencia:v1:${comandoLogico}`);
    },
  });
}
