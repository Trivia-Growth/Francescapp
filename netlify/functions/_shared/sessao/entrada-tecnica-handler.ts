import type { criarLeitorEntradaTecnica } from './entrada-tecnica-http.ts';
import { responderFalhaEntradaTecnica } from './entrada-tecnica-http.ts';
import type { criarTransporteHttpSessaoComProva } from './http-prova.ts';
import { limparCookiesDesafio } from './limpar-desafio.ts';

/** Composição local não exposta. Admissão e consulta devem usar autoridade real;
 * dependências de teste não são evidência de autorização ou S-02. */
export function criarHandlerEntradaTecnica(
  dependencias: Readonly<{
    ler: ReturnType<typeof criarLeitorEntradaTecnica>;
    transporte: ReturnType<typeof criarTransporteHttpSessaoComProva>;
    entrar: (
      entrada: Readonly<{ email: string; senha: string; requestId: string; signal: AbortSignal }>,
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
    const noPrazo = async <T>(operacao: Promise<T>): Promise<T> => {
      if (controle.signal.aborted) {
        void operacao.catch(() => undefined);
        throw new Error();
      }
      let abortar!: () => void;
      const prazo = new Promise<never>((_, rejeitar) => {
        abortar = () => rejeitar(new Error());
        controle.signal.addEventListener('abort', abortar, { once: true });
      });
      try {
        const resultado = await Promise.race([operacao, prazo]);
        if (controle.signal.aborted) throw new Error();
        return resultado;
      } finally {
        controle.signal.removeEventListener('abort', abortar);
      }
    };
    let seletorValidado: string | undefined;
    try {
      const credenciais = await noPrazo(ler(request));
      seletorValidado = request.headers.get('x-desafio') ?? undefined;
      const entrada = Object.freeze(
        Object.defineProperties(
          { requestId: crypto.randomUUID() },
          {
            email: { value: credenciais.email, enumerable: false },
            senha: { value: credenciais.senha, enumerable: false },
            signal: { value: controle.signal, enumerable: false },
          },
        ),
      ) as Readonly<{ email: string; senha: string; requestId: string; signal: AbortSignal }>;
      const resultado = await noPrazo(entrar(entrada));
      const { accessToken, prova, geracao } = resultado;
      const consulta = Object.freeze(
        Object.defineProperties(
          {},
          {
            accessToken: { value: accessToken, enumerable: false },
            prova: { value: prova, enumerable: false },
            geracao: { value: geracao, enumerable: true },
          },
        ),
      ) as Readonly<{ accessToken: string; prova: string; geracao: number }>;
      const sessao = await noPrazo(consultar(consulta));
      const resposta = await noPrazo(
        transporte.responderEntrada({ sessao, accessToken, prova, geracao }),
      );
      return seletorValidado ? limparCookiesDesafio(resposta, seletorValidado, false) : resposta;
    } catch (erro) {
      const resposta = responderFalhaEntradaTecnica(erro);
      return seletorValidado ? limparCookiesDesafio(resposta, seletorValidado, false) : resposta;
    } finally {
      clearTimeout(temporizador);
    }
  };
}
