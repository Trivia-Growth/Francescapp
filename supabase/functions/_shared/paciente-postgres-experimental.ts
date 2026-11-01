import { Buffer } from 'node:buffer';
import type { Pool, PoolClient } from 'pg';
import {
  assinaturasRpc,
  criarTransporteRpcAtestadaSchema,
} from '../../../packages/contracts/src/index.ts';
import { validarJwtDeSessao, type ConfiguracaoJwtSessao } from './sessao/nucleo.ts';
import { hashProvaGeracao } from './sessao/prova-geracao.ts';

/** Após envio ao banco, erro ou confirmação ambígua não prova rollback. */
export class ResultadoPacientePostgresIncerto extends Error {
  constructor() {
    super('Não foi possível processar o cadastro.');
    this.name = 'ResultadoPacientePostgresIncerto';
  }
}

/** Somente fixture local. Claims SQL são forjáveis fora do canal restrito;
 * não é gateway Supabase, emissor de reserva nem componente de runtime. */
export function criarExecutorPacientePostgresExperimental(
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
      throw new Error('Cadastro indisponível.');
  return async (
    entrada: Readonly<{ jwt: string; prova: string; geracao: number; transporte: unknown }>,
  ) => {
    let cliente: PoolClient | undefined;
    let destruir = true;
    let enviada = false;
    try {
      const transporte = criarTransporteRpcAtestadaSchema('criarPaciente').parse(
        entrada.transporte,
      );
      const comando = assinaturasRpc.criarPaciente.entrada.parse(transporte.p_entrada.entrada);
      const { jwt, prova, geracao } = entrada;
      if (!Number.isSafeInteger(geracao) || geracao < 1) throw new Error();
      const verificador = Buffer.from(await hashProvaGeracao(prova), 'base64url');
      if (verificador.length !== 32) throw new Error();
      let temporizador: ReturnType<typeof setTimeout> | undefined;
      const prazo = new Promise<never>((_, rejeitar) => {
        temporizador = setTimeout(() => rejeitar(new Error()), 5000);
      });
      let claims: Awaited<ReturnType<typeof validarJwtDeSessao>>;
      try {
        claims = await Promise.race([validarJwtDeSessao(jwt, jwtConfig), prazo]);
      } finally {
        clearTimeout(temporizador);
      }
      const usuario = claims.usuarioId.toLowerCase();
      const sessao = claims.sessionId.toLowerCase();
      if (
        comando.atestado.usuario_id !== usuario ||
        comando.atestado.session_id !== sessao ||
        comando.atestado.operacao !== 'api.criar_paciente' ||
        comando.atestado.request_id !== comando.request_id
      )
        throw new Error();
      cliente = await pool.connect();
      await cliente.query('BEGIN');
      await cliente.query("SET LOCAL statement_timeout = '10s'");
      await cliente.query('SET LOCAL ROLE ffcm_paciente_executor_fixture');
      await cliente.query(
        "select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)",
        [usuario, JSON.stringify({ sub: usuario, session_id: sessao })],
      );
      enviada = true;
      const resultado = await cliente.query(
        'select reserva_fixture.criar_paciente_reservado_fixture($1::jsonb,$2::bigint,$3::bytea) as resultado',
        [JSON.stringify(transporte.p_entrada), geracao, verificador],
      );
      if (resultado.rows.length !== 1) throw new Error();
      const resposta = assinaturasRpc.criarPaciente.saida.parse(resultado.rows[0].resultado);
      if (resposta.request_id !== comando.request_id) throw new Error();
      if ((await cliente.query('COMMIT')).command !== 'COMMIT') throw new Error();
      destruir = false;
      return resposta;
    } catch {
      if (enviada) throw new ResultadoPacientePostgresIncerto();
      throw new Error('Cadastro indisponível.');
    } finally {
      cliente?.release(destruir);
    }
  };
}
