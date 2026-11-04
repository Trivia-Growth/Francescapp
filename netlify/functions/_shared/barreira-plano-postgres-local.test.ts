import { expect, it } from 'vitest';
import pg from 'pg';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { operarBarreiraPlanoNativa } from './barreira-plano-operacao.ts';
import { executarBarreiraPlanoNativa } from './executor-barreira-plano-nativo.ts';

it.skipIf(!process.env.FFCM_PG_SOCKET)(
  'integra atestação, revalidação e composição privada em PostgreSQL descartável',
  async () => {
    const pool = new pg.Pool({
      host: process.env.FFCM_PG_SOCKET,
      port: 5432,
      user: 'cadeia_fixture',
      database: 'ffcm_cadeia_local',
    });
    const identidade = {
      usuario_id: '10000000-0000-4000-8000-000000000002',
      session_id: '20000000-0000-4000-8000-000000000002',
    };
    const request = new Request('https://exemplo.test', {
      headers: { 'x-sessao': identidade.session_id },
    });
    const autorizado = async () => ({ estado: 'autorizado' as const, identidade });
    const cliente = {
      schema: () => ({
        rpc: async (_nome: string, args: { p_transporte: unknown }) => {
          const c = await pool.connect();
          try {
            await c.query('begin');
            await c.query("select set_config('request.jwt.claims', $1, true)", [
              JSON.stringify({
                sub: identidade.usuario_id,
                session_id: identidade.session_id,
                amr: [{ method: 'oauth' }],
              }),
            ]);
            await c.query('set local role authenticated');
            const result = await c.query(
              'select api.plano_composicao_privada($1::jsonb) as dados',
              [JSON.stringify(args.p_transporte)],
            );
            await c.query('commit');
            return { data: result.rows[0].dados, error: null };
          } catch (error) {
            await c.query('rollback');
            return { data: null, error };
          } finally {
            c.release();
          }
        },
      }),
    };
    const portas = {
      autorizar: autorizado,
      revalidar: autorizado,
      metadados: (request_id: string) => ({
        key_id: 'teste',
        request_id,
        emitido_em: new Date(Date.now() - 1000).toISOString(),
        expira_em: new Date(Date.now() + 20000).toISOString(),
      }),
      atestador: criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(0x42) }),
      executar: (transporte: Parameters<typeof executarBarreiraPlanoNativa>[1]) =>
        executarBarreiraPlanoNativa(cliente as never, transporte),
    };
    try {
      const entrada = { operacao: 'api.consultar_barreira_plano' };
      expect(await operarBarreiraPlanoNativa(request, entrada, portas)).toMatchObject({
        ok: false,
      });
      await pool.query('grant usage on schema api to authenticated');
      await pool.query(
        'grant execute on function api.plano_composicao_privada(jsonb) to authenticated',
      );
      expect(await operarBarreiraPlanoNativa(request, entrada, portas)).toMatchObject({
        ok: true,
        dados: { resultado_pendente: { resultado: 'cancelada' } },
      });
      await pool.query(
        'update identidade.sessao set encerrada_em=clock_timestamp() where session_id=$1',
        [identidade.session_id],
      );
      expect(await operarBarreiraPlanoNativa(request, entrada, portas)).toMatchObject({
        ok: false,
        erro: { codigo: 'sem_permissao' },
      });
    } finally {
      await pool.end();
    }
  },
);
