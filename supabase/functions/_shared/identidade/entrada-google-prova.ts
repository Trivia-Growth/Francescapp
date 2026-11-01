import type { criarTrocaGoogle } from './auth-google.ts';
import type { criarDesafiosGoogle } from './desafio-google.ts';
import { ErroIdTokenGoogleInvalido } from './google-id-token.ts';
import { ErroDesafioGoogleInvalido } from './desafio-google.ts';

/** Não admite sessão local nem substitui pré-concessão, auditoria ou S-02. */
export function criarEntradaGoogleComProva(
  desafios: Pick<ReturnType<typeof criarDesafiosGoogle>, 'consumir'>,
  trocar: ReturnType<typeof criarTrocaGoogle>,
) {
  return async (
    entrada: Readonly<{ desafioId: string; nonceSelado: string; idToken: string }>,
    sinal?: AbortSignal,
  ) => {
    try {
      if (sinal?.aborted) throw new Error();
      const { desafioId, nonceSelado, idToken } = entrada;
      const prova = await desafios.consumir(desafioId, nonceSelado);
      if (sinal?.aborted) throw new Error();
      const resultado = await trocar({ idToken, nonce: prova.nonce }, sinal);
      if (sinal?.aborted) throw new Error();
      const saida = Object.defineProperties({}, Object.getOwnPropertyDescriptors(resultado));
      return Object.freeze(
        Object.defineProperties(saida, {
          desafioId: { value: desafioId, enumerable: false },
          nonceHash: { value: prova.nonce_hash, enumerable: false },
        }),
      ) as typeof resultado & Readonly<{ desafioId: string; nonceHash: string }>;
    } catch (erro) {
      if (erro instanceof ErroIdTokenGoogleInvalido || erro instanceof ErroDesafioGoogleInvalido)
        throw erro;
      throw new Error('Entrada Google indisponível ou inválida.');
    }
  };
}
