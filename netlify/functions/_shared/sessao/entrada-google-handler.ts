import {
  responderFalhaEntradaGoogle,
  type criarLeitorEntradaGoogle,
} from './entrada-google-http.ts';
import type { criarTransporteHttpSessaoComProva } from './http-prova.ts';
import { limparCookiesDesafio } from './limpar-desafio.ts';

/** Não exposto. Admissão e consulta exigem autoridade real e revisão S-02. */
export function criarHandlerEntradaGoogle(
  dependencias: Readonly<{
    ler: ReturnType<typeof criarLeitorEntradaGoogle>;
    transporte: ReturnType<typeof criarTransporteHttpSessaoComProva>;
    entrar: (
      entrada: Readonly<{
        desafioId: string;
        idToken: string;
        nonceSelado: string;
        requestId: string;
        signal: AbortSignal;
      }>,
    ) => Promise<Readonly<{ accessToken: string; prova: string; geracao: number }>>;
    consultar: (
      entrada: Readonly<{ accessToken: string; prova: string; geracao: number }>,
    ) => Promise<unknown>;
  }>,
) {
  const { ler, entrar, consultar, transporte } = dependencias;
  return async (request: Request): Promise<Response> => {
    const controle = new AbortController();
    const temporizador = setTimeout(() => controle.abort(), 15_000);
    const noPrazo = async <T>(operacao: () => Promise<T>): Promise<T> => {
      if (controle.signal.aborted) throw new Error();
      let abortar: () => void = () => {};
      const prazo = new Promise<never>((_, rejeitar) => {
        abortar = () => rejeitar(new Error());
        controle.signal.addEventListener('abort', abortar, { once: true });
      });
      try {
        const resultado = await Promise.race([operacao(), prazo]);
        if (controle.signal.aborted) throw new Error();
        return resultado;
      } finally {
        controle.signal.removeEventListener('abort', abortar);
      }
    };
    let seletorValidado: string | undefined;
    try {
      const dados = await noPrazo(() => ler(request));
      seletorValidado = request.headers.get('x-desafio') ?? undefined;
      const entrada = Object.freeze(
        Object.defineProperties(
          { requestId: crypto.randomUUID() },
          {
            desafioId: { value: dados.desafioId },
            idToken: { value: dados.idToken },
            nonceSelado: { value: dados.nonceSelado },
            signal: { value: controle.signal },
          },
        ),
      ) as Readonly<{
        desafioId: string;
        idToken: string;
        nonceSelado: string;
        requestId: string;
        signal: AbortSignal;
      }>;
      const { accessToken, prova, geracao } = await noPrazo(() => entrar(entrada));
      const consulta = Object.freeze(
        Object.defineProperties(
          { geracao },
          { accessToken: { value: accessToken }, prova: { value: prova } },
        ),
      ) as Readonly<{ accessToken: string; prova: string; geracao: number }>;
      const sessao = await noPrazo(() => consultar(consulta));
      const resposta = await noPrazo(() =>
        transporte.responderEntrada({ sessao, accessToken, prova, geracao }),
      );
      return seletorValidado ? limparCookiesDesafio(resposta, seletorValidado, true) : resposta;
    } catch (erro) {
      const resposta = responderFalhaEntradaGoogle(erro);
      return seletorValidado ? limparCookiesDesafio(resposta, seletorValidado, true) : resposta;
    } finally {
      clearTimeout(temporizador);
    }
  };
}
