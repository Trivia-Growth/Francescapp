import { expect, it } from 'vitest';
import pg from 'pg';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { operarPlanoCuidadoNativo } from './plano-cuidado-nativo.ts';
import { executarPlanoCuidadoNativo } from './executor-plano-cuidado-nativo.ts';
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
    const paciente_id = '40000000-0000-4000-8000-000000000001';
    const cifra = criarCifraAutenticada({
      keyIdAtiva: 'teste',
      chavesDeCifra: { teste: new Uint8Array(32).fill(2) },
      chaveHmac: new Uint8Array(32).fill(4),
    });
    const request = new Request('https://example.test', {
      headers: { 'x-sessao': session_id, 'x-chave-idempotencia': 'integracao_ficticia_123' },
    });
    const objetivo_id = 'd0000000-0000-4000-8000-000000000004';
    const objetivo = {
      descricao: 'conteudo ficticio',
      area: 'saude',
      responsavel: 'equipe',
      situacaoInicial: 'inicial',
      observacaoProgresso: 'progresso',
      dataRevisao: '2026-12-01',
      estado: 'proposto',
    };
    const autorizado = async () => ({
      estado: 'autorizado' as const,
      identidade: { usuario_id, session_id },
    });
    const cliente = {
      schema: () => ({
        rpc: async (_nome: string, args: { p_transporte: unknown }) => {
          const c = await pool.connect();
          try {
            await c.query('begin');
            await c.query("select set_config('request.jwt.claims', $1, true)", [
              JSON.stringify({ sub: usuario_id, session_id, amr: [{ method: 'oauth' }] }),
            ]);
            await c.query('set local role authenticated');
            const result = await c.query('select api.plano_cuidado_privado($1::jsonb) as dados', [
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
      executar: (_req: Request, transporte: Parameters<typeof executarPlanoCuidadoNativo>[1]) =>
        executarPlanoCuidadoNativo(cliente as never, transporte),
    };
    const gravar = {
      operacao: 'gravar' as const,
      paciente_id,
      objetivo_id,
      versao_esperada: 0,
      objetivo,
    };
    try {
      expect(await operarPlanoCuidadoNativo(request, gravar, portas)).toMatchObject({
        ok: false,
        erro: { codigo: 'pendencia_externa' },
      });
      await pool.query('grant usage on schema api to authenticated');
      await pool.query(
        'grant execute on function api.plano_cuidado_privado(jsonb) to authenticated',
      );
      const primeira = await operarPlanoCuidadoNativo(request, gravar, portas);
      expect(primeira).toMatchObject({ ok: true, dados: { objetivo_id, versao: 1, objetivo } });
      const segunda = await operarPlanoCuidadoNativo(request, gravar, portas);
      expect(segunda.ok && segunda.dados).toEqual(primeira.ok && primeira.dados);
      expect(
        await operarPlanoCuidadoNativo(
          request,
          {
            ...gravar,
            objetivo: { ...objetivo, descricao: 'outro conteúdo fictício' },
          },
          portas,
        ),
      ).toMatchObject({ ok: false, erro: { codigo: 'conflito_idempotencia' } });
      const resultado = await pool.query(
        'select count(*)::int as total from cadastro.objetivo_cuidado_versao where objetivo_id=$1',
        [objetivo_id],
      );
      expect(resultado.rows[0].total).toBe(1);
      // A escrita confirma no banco, mas a resposta se perde antes de chegar ao handler.
      const requestPerdido = new Request('https://example.test', {
        headers: { 'x-sessao': session_id, 'x-chave-idempotencia': 'resposta_perdida_123' },
      });
      const objetivoPerdido = 'd0000000-0000-4000-8000-000000000005';
      const comandoPerdido = { ...gravar, objetivo_id: objetivoPerdido };
      let respostaConfirmada: unknown;
      expect(
        await operarPlanoCuidadoNativo(requestPerdido, comandoPerdido, {
          ...portas,
          executar: async (req, transporte) => {
            respostaConfirmada = await portas.executar(req, transporte);
            throw new Error('resposta perdida');
          },
        }),
      ).toMatchObject({ ok: false, erro: { codigo: 'pendencia_externa' } });
      expect(respostaConfirmada).toMatchObject({
        ok: true,
        dados: { objetivo_id: objetivoPerdido, versao: 1 },
      });
      expect(await operarPlanoCuidadoNativo(requestPerdido, comandoPerdido, portas)).toMatchObject({
        ok: true,
        dados: { objetivo_id: objetivoPerdido, versao: 1, objetivo },
      });
      const recuperado = await pool.query(
        'select count(*)::int as total from cadastro.objetivo_cuidado_versao where objetivo_id=$1',
        [objetivoPerdido],
      );
      expect(recuperado.rows[0].total).toBe(1);
    } finally {
      await pool.end();
    }
  },
);
