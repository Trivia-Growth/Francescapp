import { validarJwtDeSessao, type ConfiguracaoJwtSessao } from './nucleo.ts';

/** Somente valida JWT e formato da prova; não consulta sessão, RLS ou vínculos.
 * Não conectar a runtime antes de gateway, banco e revisão S-02 comprovados. */
export function criarAutorizadorCarteiraExperimental(configuracao: ConfiguracaoJwtSessao) {
  const chave = configuracao.chaveDeVerificacao;
  const configuracaoIsolada: ConfiguracaoJwtSessao = {
    issuer: configuracao.issuer,
    audience: configuracao.audience,
    algoritmosPermitidos: [...configuracao.algoritmosPermitidos],
    chaveDeVerificacao:
      chave instanceof Uint8Array
        ? new Uint8Array(chave)
        : 'kty' in chave
          ? structuredClone(chave)
          : chave,
  };
  return async (request: Request) => {
    const negada = { estado: 'nao_autenticado' as const };
    const autorizacao = request.headers.get('authorization');
    const prova = request.headers.get('x-ffcm-prova-sessao');
    const geracaoTexto = request.headers.get('x-ffcm-geracao-sessao');
    const token = autorizacao?.match(
      /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i,
    )?.[1];
    if (
      !token ||
      !prova ||
      !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(prova) ||
      !geracaoTexto ||
      !/^[1-9][0-9]*$/.test(geracaoTexto)
    )
      return negada;
    const geracao = Number(geracaoTexto);
    if (!Number.isSafeInteger(geracao) || geracao < 1) return negada;
    try {
      const claims = await validarJwtDeSessao(token, configuracaoIsolada);
      return Object.freeze(
        Object.defineProperties(
          {
            estado: 'autorizado' as const,
            identidade: Object.freeze({
              usuario_id: claims.usuarioId,
              session_id: claims.sessionId,
            }),
            geracao,
          },
          {
            jwt: { value: token, enumerable: false },
            prova: { value: prova, enumerable: false },
          },
        ),
      ) as Readonly<{
        estado: 'autorizado';
        identidade: { usuario_id: string; session_id: string };
        geracao: number;
        jwt: string;
        prova: string;
      }>;
    } catch {
      return negada;
    }
  };
}
