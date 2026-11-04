import { expect, it } from 'vitest';
import pg from 'pg';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { operarAnamneseNativa } from './anamnese-nativa.ts';
import { executarAnamneseNativa } from './executor-anamnese-nativo.ts';
import { criarIdempotenciaNativa } from './idempotencia-nativa.ts';

it.skipIf(!process.env.FFCM_PG_SOCKET)(
  'integra handler, executor, cifra, atestado e PostgreSQL descartável',
  async () => {
    const pool = new pg.Pool({
      host: process.env.FFCM_PG_SOCKET,
      port: 5432,
      user: 'cadeia_fixture',
      database: 'ffcm_cadeia_local',
    });
    const usuario_id = '10000000-0000-4000-8000-000000000002';
    const session_id = '20000000-0000-4000-8000-000000000002';
    const paciente_id = '40000000-0000-4000-8000-000000000002';
    const cifra = criarCifraAutenticada({
      keyIdAtiva: 'teste',
      chavesDeCifra: { teste: new Uint8Array(32).fill(2) },
      chaveHmac: new Uint8Array(32).fill(4),
    });
    const request = new Request('https://example.test', {
      headers: { 'x-sessao': session_id, 'x-chave-idempotencia': 'integracao_ficticia_123' },
    });
    const secoes = [
      {
        id: 'saude',
        camposEsperados: ['alergia'],
        respostas: [{ campo: 'alergia', estado: 'pendente' }],
      },
    ];
    const autorizado = async () => ({
      estado: 'autorizado' as const,
      identidade: { usuario_id, session_id },
    });
    let falhar = false;
    const cliente = {
      schema: () => ({
        rpc: async (_nome: string, args: { p_transporte: unknown }) => {
          const c = await pool.connect();
          try {
            await c.query('begin');
            await c.query("select set_config('request.jwt.claims', $1, true)", [
              JSON.stringify({ sub: usuario_id, session_id, amr: [{ method: 'oauth' }] }),
            ]);
            if (falhar) await c.query("select set_config('fixture.falhar_auditoria','sim',true)");
            await c.query('set local role authenticated');
            const result = await c.query('select api.anamnese_privada($1::jsonb) as dados', [
              JSON.stringify(args.p_transporte),
            ]);
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
      cifra,
      idempotencia: criarIdempotenciaNativa(cifra),
      atestador: criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(0x42) }),
      metadados: (request_id: string) => {
        const agora = Date.now();
        return {
          key_id: 'teste',
          request_id,
          emitido_em: new Date(agora - 1000).toISOString(),
          expira_em: new Date(agora + 20000).toISOString(),
        };
      },
      executar: (_req: Request, transporte: Parameters<typeof executarAnamneseNativa>[1]) =>
        executarAnamneseNativa(cliente as never, transporte),
    };
    const gravar = { operacao: 'gravar' as const, paciente_id, versao_esperada: 0, secoes };
    try {
      expect(await operarAnamneseNativa(request, gravar, portas)).toMatchObject({
        ok: false,
        erro: { codigo: 'pendencia_externa' },
      });
      await pool.query('grant usage on schema api to authenticated');
      await pool.query('grant execute on function api.anamnese_privada(jsonb) to authenticated');
      expect(await operarAnamneseNativa(request, gravar, portas)).toMatchObject({
        ok: true,
        dados: { versao: 1, secoes },
      });
      expect(await operarAnamneseNativa(request, gravar, portas)).toMatchObject({
        ok: true,
        dados: { versao: 1, secoes },
      });
      expect(
        await operarAnamneseNativa(request, { operacao: 'ler', paciente_id }, portas),
      ).toMatchObject({ ok: true, dados: { versao: 1, secoes } });
      // O banco deve negar acesso mesmo com autorização simulada obsoleta.
      await pool.query(
        'update identidade.sessao set encerrada_em=clock_timestamp() where session_id=$1',
        [session_id],
      );
      expect(
        await operarAnamneseNativa(request, { operacao: 'ler', paciente_id }, portas),
      ).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
      expect(await operarAnamneseNativa(request, gravar, portas)).toMatchObject({
        ok: false,
        erro: { codigo: 'sem_permissao' },
      });
      await pool.query('update identidade.sessao set encerrada_em=null where session_id=$1', [
        session_id,
      ]);
      await pool.query(
        "update identidade.concessao_equipe set estado='revogada',revogada_em=clock_timestamp(),revogada_por_usuario_id=$1,motivo_revogacao_cifrado=motivo_cifrado where usuario_id=$1",
        [usuario_id],
      );
      expect(
        await operarAnamneseNativa(request, { operacao: 'ler', paciente_id }, portas),
      ).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
      await pool.query(
        "update identidade.concessao_equipe set estado='vinculada',revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id=$1",
        [usuario_id],
      );
      falhar = true;
      const segunda = new Request('https://example.test', {
        headers: { 'x-sessao': session_id, 'x-chave-idempotencia': 'falha_auditoria_123' },
      });
      expect(
        await operarAnamneseNativa(segunda, { ...gravar, versao_esperada: 1 }, portas),
      ).toMatchObject({ ok: false, erro: { codigo: 'pendencia_externa' } });
      const resultado = await pool.query(
        'select count(*)::int as total from cadastro.anamnese_versao where paciente_id=$1',
        [paciente_id],
      );
      expect(resultado.rows[0].total).toBe(1);
    } finally {
      await pool.end();
    }
  },
);
