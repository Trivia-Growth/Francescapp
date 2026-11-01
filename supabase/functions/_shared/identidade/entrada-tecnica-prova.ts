import { assinaturasRpc, uuidSchema } from '../../../../packages/contracts/src/index.ts';
import type { CampoCifrado } from '../cifra-autenticada.ts';
import type { criarCifraRefresh } from '../sessao/cifra-refresh.ts';
import { criarProvaGeracao } from '../sessao/prova-geracao.ts';
import { criarAutenticadorTecnico, ErroAutenticacaoNegada } from './auth-tecnica.ts';

type Admissao = Readonly<{
  identidade: Readonly<{ usuario_id: string; session_id: string; metodo: 'tecnica' }>;
  request_id: string;
  credencial_refresh: CampoCifrado;
}>;

/** Experimental, sem rota: o executor deve gravar hash e admissão na mesma transação.
 * O hash é credencial sensível do canal restrito, não pode ser logado ou público.
 * O formato base64url deve ser convertido para bytea de 32 bytes pelo adapter SQL.
 * Este contrato ainda não existe no banco real e não tem revisão S-02. */
export function criarEntradaTecnicaComProva(
  dependencias: Readonly<{
    auth: Parameters<typeof criarAutenticadorTecnico>[0];
    cifra: ReturnType<typeof criarCifraRefresh>;
    admitir: (
      entrada: Readonly<{ pedido: Admissao; provaHash: string; jwt: string }>,
    ) => Promise<unknown>;
  }>,
) {
  const autenticar = criarAutenticadorTecnico(dependencias.auth);
  const cifrar = dependencias.cifra.cifrar.bind(dependencias.cifra);
  const admitir = dependencias.admitir;
  return async (
    entrada: Readonly<{ email: string; senha: string; requestId: string; signal?: AbortSignal }>,
  ) => {
    try {
      const conferirPrazo = () => {
        if (entrada.signal?.aborted) throw new Error();
      };
      conferirPrazo();
      const requestId = uuidSchema.parse(entrada.requestId);
      const identidade = await autenticar({ email: entrada.email, senha: entrada.senha });
      conferirPrazo();
      const credencial = await cifrar(identidade.refreshToken, {
        usuario: identidade.usuarioId,
        sessao: identidade.sessionId,
      });
      conferirPrazo();
      const pedido = assinaturasRpc.entrarTecnico.entrada.parse({
        identidade: {
          usuario_id: identidade.usuarioId,
          session_id: identidade.sessionId,
          metodo: 'tecnica',
        },
        request_id: requestId,
        credencial_refresh: credencial,
      });
      Object.freeze(pedido.identidade);
      Object.freeze(pedido.credencial_refresh);
      Object.freeze(pedido);
      const { prova, provaHash } = await criarProvaGeracao();
      conferirPrazo();
      const contexto = Object.freeze(
        Object.defineProperties(
          { pedido },
          {
            jwt: { value: identidade.accessToken, enumerable: false },
            provaHash: { value: provaHash, enumerable: false },
          },
        ),
      ) as Readonly<{ pedido: Admissao; provaHash: string; jwt: string }>;
      const resposta = assinaturasRpc.entrarTecnico.saida.parse(await admitir(contexto));
      conferirPrazo();
      if (resposta.request_id !== requestId) throw new Error();
      if (
        !resposta.ok &&
        (resposta.erro.codigo === 'sem_permissao' || resposta.erro.codigo === 'nao_autenticado')
      )
        throw new ErroAutenticacaoNegada('entrada');
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
            accessToken: { value: identidade.accessToken, enumerable: false },
            prova: { value: prova, enumerable: false },
          },
        ),
      ) as Readonly<{
        accessToken: string;
        sessao: typeof resposta.dados;
        geracao: number;
        prova: string;
      }>;
    } catch (erro) {
      if (erro instanceof ErroAutenticacaoNegada) throw new ErroAutenticacaoNegada('entrada');
      throw new Error('Não foi possível concluir a entrada técnica.');
    }
  };
}
