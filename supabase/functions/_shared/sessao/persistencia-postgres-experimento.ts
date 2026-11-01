import { Buffer } from 'node:buffer';
import type { Pool, PoolClient } from 'pg';
import { campoCifradoSchema } from '../../../../packages/contracts/src/index.ts';
import type { PersistenciaRenovacaoComProva } from './renovacao-prova.ts';

/** Apenas fixture local: não configurar como adapter de produção. */
export function criarPersistenciaPostgresExperimento(pool: Pool): PersistenciaRenovacaoComProva {
  type Contexto = Parameters<PersistenciaRenovacaoComProva['iniciar']>[0];
  type Inicio = Parameters<PersistenciaRenovacaoComProva['confirmarInicio']>[0];
  type Transicao = Parameters<PersistenciaRenovacaoComProva['persistir']>[0];
  const erro = () => new Error('Persistência de sessão indisponível.');
  function hash(valor: string): Buffer {
    const bytes = Buffer.from(valor, 'base64url');
    if (bytes.length !== 32 || bytes.toString('base64url') !== valor) throw erro();
    return bytes;
  }
  function parametros(entrada: Contexto): unknown[] {
    return [
      entrada.sessionId,
      entrada.usuarioId,
      entrada.geracao,
      hash(entrada.provaAtualHash),
      entrada.tentativaId,
    ];
  }
  function inicio(entrada: Inicio): unknown[] {
    try {
      return [...parametros(entrada), JSON.stringify(campoCifradoSchema.parse(entrada.envelope))];
    } catch {
      throw erro();
    }
  }
  function transicao(entrada: Transicao): unknown[] {
    return [...inicio(entrada), hash(entrada.proximaProvaHash)];
  }
  async function consulta(sql: string, valores: unknown[]): Promise<unknown> {
    let cliente: PoolClient | undefined;
    let destruir = true;
    try {
      cliente = await pool.connect();
      await cliente.query('BEGIN');
      await cliente.query("SET LOCAL statement_timeout = '10s'");
      const resultado = await cliente.query(sql, valores);
      if (resultado.rows.length !== 1) throw erro();
      await cliente.query('COMMIT');
      destruir = false;
      return resultado.rows[0].resultado;
    } catch {
      throw erro();
    } finally {
      cliente?.release(destruir);
    }
  }
  async function booleano(sql: string, valores: unknown[]): Promise<boolean> {
    const resultado = await consulta(sql, valores);
    if (typeof resultado !== 'boolean') throw erro();
    return resultado;
  }
  const q5 = '$1::uuid,$2::uuid,$3::bigint,$4::bytea,$5::uuid';
  const q6 = `${q5},$6::jsonb`;
  const q7 = `${q6},$7::bytea`;
  return {
    async iniciar(entrada) {
      const resultado = await consulta(
        `select renovacao_fixture.iniciar(${q5}) as resultado`,
        parametros(entrada),
      );
      if (resultado === null) return null;
      const parse = campoCifradoSchema.safeParse(resultado);
      if (!parse.success) throw erro();
      return { envelope: parse.data };
    },
    confirmarInicio: async (entrada) =>
      booleano(`select renovacao_fixture.confirmar_inicio(${q6}) as resultado`, inicio(entrada)),
    persistir: async (entrada) =>
      booleano(`select renovacao_fixture.persistir(${q7}) as resultado`, transicao(entrada)),
    confirmarPersistencia: async (entrada) =>
      booleano(
        `select renovacao_fixture.confirmar_persistencia(${q7}) as resultado`,
        transicao(entrada),
      ),
    liberar: async (entrada) =>
      booleano(`select renovacao_fixture.liberar(${q7}) as resultado`, transicao(entrada)),
    confirmar: async (entrada) =>
      booleano(`select renovacao_fixture.confirmar(${q7}) as resultado`, transicao(entrada)),
  };
}
