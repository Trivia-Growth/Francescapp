import { assinaturasRpc, uuidSchema } from '../../../../packages/contracts/src/index.ts';
import type { criarCifraRefresh } from '../sessao/cifra-refresh.ts';
import { criarProvaGeracao } from '../sessao/prova-geracao.ts';
import type { criarEntradaGoogleComProva } from './entrada-google-prova.ts';
import { ErroIdTokenGoogleInvalido } from './google-id-token.ts';
import { ErroDesafioGoogleInvalido } from './desafio-google.ts';

type PedidoGoogle = ReturnType<typeof assinaturasRpc.entrarGoogle.entrada.parse>;

export class ErroEntradaGoogleNegada extends Error {
  constructor() {
    super('Não foi possível concluir a entrada Google.');
  }
}

/** Experimental sem endpoint: dependências são confiáveis e server-only.
 * HMAC precisa seguir a mesma política de normalização e chave da concessão;
 * executor ainda não existe em runtime. Não autentica entrada fornecida diretamente. */
export function criarEntradaGoogleAdmissao(
  dependencias: Readonly<{
    entradaGoogle: ReturnType<typeof criarEntradaGoogleComProva>;
    cifra: ReturnType<typeof criarCifraRefresh>;
    hmacEmail: (email: string) => Promise<string>;
    admitir: (
      entrada: Readonly<{ pedido: PedidoGoogle; provaHash: string; jwt: string }>,
    ) => Promise<unknown>;
  }>,
) {
  const entradaGoogle = dependencias.entradaGoogle;
  const hmacEmail = dependencias.hmacEmail;
  const cifrar = dependencias.cifra.cifrar.bind(dependencias.cifra);
  const admitir = dependencias.admitir;
  return async (
    entrada: Readonly<{
      desafioId: string;
      nonceSelado: string;
      idToken: string;
      requestId: string;
      signal?: AbortSignal;
    }>,
  ) => {
    try {
      const { desafioId, nonceSelado, idToken, requestId: requestIdOriginal, signal } = entrada;
      const conferir = () => {
        if (signal?.aborted) throw new Error();
      };
      conferir();
      const requestId = uuidSchema.parse(requestIdOriginal);
      const recebida = await entradaGoogle({ desafioId, nonceSelado, idToken }, signal);
      conferir();
      const {
        usuarioId,
        sessionId,
        subjectGoogle,
        emailGoogle,
        accessToken,
        refreshToken,
        desafioId: desafioValidado,
        nonceHash,
      } = recebida;
      const identidade = {
        usuarioId,
        sessionId,
        subjectGoogle,
        emailGoogle,
        accessToken,
        refreshToken,
        desafioId: desafioValidado,
        nonceHash,
      };
      if (identidade.desafioId !== desafioId || !/^[0-9a-f]{64}$/.test(identidade.nonceHash))
        throw new Error();
      const emailHmac = await hmacEmail(identidade.emailGoogle);
      conferir();
      const credencial = await cifrar(identidade.refreshToken, {
        usuario: identidade.usuarioId,
        sessao: identidade.sessionId,
      });
      conferir();
      const pedido = assinaturasRpc.entrarGoogle.entrada.parse({
        identidade: {
          usuario_id: identidade.usuarioId,
          session_id: identidade.sessionId,
          metodo: 'google_workspace',
          subject_google: identidade.subjectGoogle,
          email_hmac: emailHmac,
          desafio_id: identidade.desafioId,
          nonce_hash: identidade.nonceHash,
        },
        request_id: requestId,
        credencial_refresh: credencial,
      });
      Object.freeze(pedido.identidade);
      Object.freeze(pedido.credencial_refresh);
      Object.freeze(pedido);
      const { prova, provaHash } = await criarProvaGeracao();
      conferir();
      const contexto = Object.freeze(
        Object.defineProperties(
          {},
          {
            pedido: { value: pedido },
            jwt: { value: identidade.accessToken },
            provaHash: { value: provaHash },
          },
        ),
      ) as Readonly<{ pedido: PedidoGoogle; jwt: string; provaHash: string }>;
      const resposta = assinaturasRpc.entrarGoogle.saida.parse(await admitir(contexto));
      conferir();
      if (
        !resposta.ok &&
        resposta.request_id === requestId &&
        resposta.erro.codigo === 'sem_permissao'
      )
        throw new ErroEntradaGoogleNegada();
      if (
        !resposta.ok ||
        resposta.request_id !== requestId ||
        resposta.dados.usuario_id !== identidade.usuarioId ||
        resposta.dados.session_id !== identidade.sessionId
      )
        throw new Error();
      return Object.freeze(
        Object.defineProperties(
          { sessao: resposta.dados, geracao: 1 },
          {
            accessToken: { value: identidade.accessToken },
            prova: { value: prova },
          },
        ),
      ) as Readonly<{
        sessao: typeof resposta.dados;
        geracao: number;
        accessToken: string;
        prova: string;
      }>;
    } catch (erro) {
      if (
        erro instanceof ErroEntradaGoogleNegada ||
        erro instanceof ErroIdTokenGoogleInvalido ||
        erro instanceof ErroDesafioGoogleInvalido
      )
        throw erro;
      throw new Error('Não foi possível concluir a entrada Google.');
    }
  };
}
