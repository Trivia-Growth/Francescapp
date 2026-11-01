import { Buffer } from 'node:buffer';
import type { Pool, PoolClient } from 'pg';
import {
  assinaturasRpc,
  criarTransporteRpcAtestadaSchema,
} from '../../../packages/contracts/src/index.ts';
import { validarJwtDeSessao, type ConfiguracaoJwtSessao } from './sessao/nucleo.ts';
import { hashProvaGeracao } from './sessao/prova-geracao.ts';

/** SOMENTE EXPERIMENTO. Claims SQL são forjáveis fora deste canal; não é o
 * gateway JWT do Supabase, nem autoriza integração/runtime antes de S-02. */
export function criarExecutorCarteiraPostgresExperimental(
  pool: Pool,
  configuracao: ConfiguracaoJwtSessao,
) {
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
      throw new Error('Carteira indisponível.');
  return async (
    entrada: Readonly<{ jwt: string; prova: string; geracao: number; transporte: unknown }>,
  ) => {
    let cliente: PoolClient | undefined;
    let destruir = true;
    try {
      const transporte = criarTransporteRpcAtestadaSchema('listarPacientes').parse(
        entrada.transporte,
      );
      const consulta = assinaturasRpc.listarPacientes.entrada.parse(transporte.p_entrada.entrada);
      const { jwt, prova, geracao } = entrada;
      if (!Number.isSafeInteger(geracao) || geracao < 1) throw new Error();
      const hash = await hashProvaGeracao(prova);
      const verificador = Buffer.from(hash, 'base64url');
      if (verificador.length !== 32) throw new Error();
      let temporizador: ReturnType<typeof setTimeout> | undefined;
      const prazoJwt = new Promise<never>((_, rejeitar) => {
        temporizador = setTimeout(() => rejeitar(new Error()), 5000);
      });
      let claims: Awaited<ReturnType<typeof validarJwtDeSessao>>;
      try {
        claims = await Promise.race([validarJwtDeSessao(jwt, jwtConfig), prazoJwt]);
      } finally {
        clearTimeout(temporizador);
      }
      const usuario = claims.usuarioId.toLowerCase();
      const sessao = claims.sessionId.toLowerCase();
      const atestado = consulta.atestado;
      if (
        atestado.usuario_id !== usuario ||
        atestado.session_id !== sessao ||
        atestado.operacao !== 'api.listar_pacientes' ||
        atestado.request_id !== transporte.p_entrada.entrada.request_id
      )
        throw new Error();
      cliente = await pool.connect();
      await cliente.query('BEGIN');
      await cliente.query("SET LOCAL statement_timeout = '10s'");
      await cliente.query('SET LOCAL ROLE ffcm_carteira_executor_fixture');
      await cliente.query(
        "select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)",
        [usuario, JSON.stringify({ sub: usuario, session_id: sessao })],
      );
      const resultado = await cliente.query(
        'select experimento_atestado.listar_carteira_fixture($1::jsonb,$2::bigint,$3::bytea) as resultado',
        [JSON.stringify(transporte.p_entrada), geracao, verificador],
      );
      if (resultado.rows.length !== 1) throw new Error();
      const resposta = assinaturasRpc.listarPacientes.saida.parse(resultado.rows[0].resultado);
      if (resposta.request_id !== transporte.p_entrada.entrada.request_id) throw new Error();
      const confirmacao = await cliente.query('COMMIT');
      if (confirmacao.command !== 'COMMIT') throw new Error();
      destruir = false;
      return resposta;
    } catch {
      throw new Error('Carteira indisponível.');
    } finally {
      cliente?.release(destruir);
    }
  };
}
