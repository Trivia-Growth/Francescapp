import { assinaturasRpc, uuidSchema } from '../../../../packages/contracts/src/index.ts';
import type { CampoCifrado } from '../cifra-autenticada.ts';
import type { criarCifraRefresh } from '../sessao/cifra-refresh.ts';
import { criarAutenticadorTecnico, ErroAutenticacaoNegada } from './auth-tecnica.ts';

type EntradaAdmissao = Readonly<{
  identidade: Readonly<{ usuario_id: string; session_id: string; metodo: 'tecnica' }>;
  request_id: string;
  credencial_refresh: CampoCifrado;
}>;

/** Composição server-only. O executor deve ser restrito e realizar admissão atômica no banco. */
export function criarEntradaTecnica(
  dependencias: Readonly<{
    auth: Parameters<typeof criarAutenticadorTecnico>[0];
    cifra: ReturnType<typeof criarCifraRefresh>;
    admitir: (entrada: EntradaAdmissao) => Promise<unknown>;
  }>,
) {
  const autenticar = criarAutenticadorTecnico(dependencias.auth);
  const cifrar = dependencias.cifra.cifrar.bind(dependencias.cifra);
  const admitir = dependencias.admitir;
  return async (entrada: Readonly<{ email: string; senha: string; requestId: string }>) => {
    try {
      const requestId = uuidSchema.parse(entrada.requestId);
      const identidade = await autenticar({ email: entrada.email, senha: entrada.senha });
      const credencial = await cifrar(identidade.refreshToken, {
        usuario: identidade.usuarioId,
        sessao: identidade.sessionId,
      });
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
      const resposta = assinaturasRpc.entrarTecnico.saida.parse(await admitir(pedido));
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
      return { accessToken: identidade.accessToken, sessao: resposta.dados };
    } catch (erro) {
      if (erro instanceof ErroAutenticacaoNegada) throw new ErroAutenticacaoNegada('entrada');
      throw new Error('Não foi possível concluir a entrada técnica.');
    }
  };
}
