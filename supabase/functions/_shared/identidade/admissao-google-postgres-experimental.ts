import { Buffer } from 'node:buffer';
import type { Pool, PoolClient } from 'pg';
import { assinaturasRpc } from '../../../../packages/contracts/src/index.ts';
import { validarJwtDeSessao, type ConfiguracaoJwtSessao } from '../sessao/nucleo.ts';

/** Fixture não conectada; função, papel e canal exigem grants e revisão S-02.
 * O executor confia no servidor que validou Google, desafio e HMAC; JWT prova
 * somente UUID/sessão Supabase. Resultado incerto nunca implica rollback. */
export function criarExecutorAdmissaoGooglePostgresExperimental(
  pool: Pool,
  config: ConfiguracaoJwtSessao,
) {
  for (const prazo of [pool.options?.connectionTimeoutMillis, pool.options?.query_timeout])
    if (typeof prazo !== 'number' || !Number.isSafeInteger(prazo) || prazo <= 0 || prazo > 10000)
      throw new Error('Admissão Google indisponível.');
  const chave = config.chaveDeVerificacao;
  const jwtConfig: ConfiguracaoJwtSessao = {
    issuer: config.issuer,
    audience: config.audience,
    algoritmosPermitidos: [...config.algoritmosPermitidos],
    chaveDeVerificacao:
      chave instanceof Uint8Array
        ? new Uint8Array(chave)
        : 'kty' in chave
          ? structuredClone(chave)
          : chave,
  };
  return async (entrada: Readonly<{ pedido: unknown; provaHash: string; jwt: string }>) => {
    let cliente: PoolClient | undefined;
    let destruir = true;
    try {
      const { jwt, provaHash } = entrada;
      const pedido = assinaturasRpc.entrarGoogle.entrada.parse(entrada.pedido);
      if (typeof provaHash !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(provaHash))
        throw new Error();
      const prova = Buffer.from(provaHash, 'base64url');
      if (prova.length !== 32 || prova.toString('base64url') !== provaHash) throw new Error();
      let temporizador: ReturnType<typeof setTimeout> | undefined;
      const prazo = new Promise<never>((_, rejeitar) => {
        temporizador = setTimeout(() => rejeitar(new Error()), 5000);
      });
      let claims: Awaited<ReturnType<typeof validarJwtDeSessao>>;
      try {
        claims = await Promise.race([validarJwtDeSessao(jwt, jwtConfig), prazo]);
      } finally {
        if (temporizador) clearTimeout(temporizador);
      }
      if (
        claims.usuarioId !== pedido.identidade.usuario_id ||
        claims.sessionId !== pedido.identidade.session_id
      )
        throw new Error();
      cliente = await pool.connect();
      await cliente.query('BEGIN');
      await cliente.query("SET LOCAL statement_timeout = '10s'");
      await cliente.query('SET LOCAL ROLE ffcmapp_google_executor_fixture');
      const sql = await cliente.query(
        'select identidade.google_selecionar_admissao_fixture($1::jsonb,$2::bytea) as resultado',
        [JSON.stringify(pedido), prova],
      );
      if (sql.rows.length !== 1) throw new Error();
      const resposta = assinaturasRpc.entrarGoogle.saida.parse(sql.rows[0].resultado);
      if (
        resposta.request_id !== pedido.request_id ||
        (resposta.ok &&
          (resposta.dados.usuario_id !== claims.usuarioId ||
            resposta.dados.session_id !== claims.sessionId))
      )
        throw new Error();
      const confirmacao = await cliente.query('COMMIT');
      if (confirmacao.command !== 'COMMIT') throw new Error();
      destruir = false;
      return resposta;
    } catch {
      throw new Error('Admissão Google indisponível.');
    } finally {
      cliente?.release(destruir);
    }
  };
}
