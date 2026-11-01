import { Buffer } from 'node:buffer';
import type { Pool, PoolClient } from 'pg';
import { assinaturasRpc } from '../../../../packages/contracts/src/index.ts';
import { validarJwtDeSessao, type ConfiguracaoJwtSessao } from '../sessao/nucleo.ts';

/** Contrato proposto, não conectado. Função SQL, papel, canal e ausência de logs
 * no servidor/pooler ainda exigem implementação e revisão S-02. */
export function criarExecutorAdmissaoPostgres(pool: Pool, configuracao: ConfiguracaoJwtSessao) {
  const chave = configuracao.chaveDeVerificacao;
  const jwtConfig: ConfiguracaoJwtSessao = {
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
  for (const prazo of [pool.options?.connectionTimeoutMillis, pool.options?.query_timeout])
    if (typeof prazo !== 'number' || !Number.isSafeInteger(prazo) || prazo <= 0)
      throw new Error('Admissão indisponível.');
  return async (entrada: Readonly<{ jwt: string; pedido: unknown; provaHash: string }>) => {
    let cliente: PoolClient | undefined;
    let destruir = true;
    try {
      const pedido = assinaturasRpc.entrarTecnico.entrada.parse(entrada.pedido);
      const token = entrada.jwt;
      const hash = entrada.provaHash;
      if (typeof hash !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(hash)) throw new Error();
      const bytes = Buffer.from(hash, 'base64url');
      if (bytes.length !== 32 || bytes.toString('base64url') !== hash) throw new Error();
      let temporizador: ReturnType<typeof setTimeout> | undefined;
      const prazoJwt = new Promise<never>((_, rejeitar) => {
        temporizador = setTimeout(() => rejeitar(new Error()), 5000);
      });
      let claims: Awaited<ReturnType<typeof validarJwtDeSessao>>;
      try {
        claims = await Promise.race([validarJwtDeSessao(token, jwtConfig), prazoJwt]);
      } finally {
        clearTimeout(temporizador);
      }
      if (
        claims.usuarioId !== pedido.identidade.usuario_id ||
        claims.sessionId !== pedido.identidade.session_id
      )
        throw new Error();
      cliente = await pool.connect();
      await cliente.query('BEGIN');
      await cliente.query("SET LOCAL statement_timeout = '10s'");
      await cliente.query('SET LOCAL ROLE ffcmapp_admissao_executor');
      const resultado = await cliente.query(
        'select identidade.admitir_tecnica_com_prova($1::jsonb, $2::bytea) as resultado',
        [JSON.stringify(pedido), bytes],
      );
      if (resultado.rows.length !== 1) throw new Error();
      const resposta = assinaturasRpc.entrarTecnico.saida.parse(resultado.rows[0].resultado);
      if (
        resposta.request_id !== pedido.request_id ||
        (resposta.ok &&
          (resposta.dados.usuario_id !== claims.usuarioId ||
            resposta.dados.session_id !== claims.sessionId))
      )
        throw new Error();
      await cliente.query('COMMIT');
      destruir = false;
      return resposta;
    } catch {
      throw new Error('Admissão indisponível.');
    } finally {
      cliente?.release(destruir);
    }
  };
}
