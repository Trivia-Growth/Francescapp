import { expect, it } from 'vitest';
import pg from 'pg';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { operarAprovarObjetivoPlanoNativo } from './aprovar-objetivo-plano-nativo.ts';
import { executarAprovarObjetivoPlanoNativo } from './executor-aprovar-objetivo-plano-nativo.ts';

it.skipIf(!process.env.FFCM_PG_SOCKET)(
  'integra handler, executor, atestado e PostgreSQL descartável (administrador e aprovador indicado)',
  async () => {
    const pool = new pg.Pool({
      host: process.env.FFCM_PG_SOCKET,
      port: 55440,
      user: 'cadeia_fixture',
      database: 'ffcm_cadeia_local',
    });
    const administrador_id = '10000000-0000-4000-8000-000000000001';
    const sessao_admin_id = '20000000-0000-4000-8000-000000000001';
    const profissional_id = '10000000-0000-4000-8000-000000000002';
    const sessao_prof_id = '20000000-0000-4000-8000-000000000002';
    const paciente_id = '40000000-0000-4000-8000-000000000001';
    const cliente = (claims: Record<string, unknown>) => ({
      schema: () => ({
        rpc: async (_nome: string, args: { p_transporte: unknown }) => {
          const c = await pool.connect();
          try {
            await c.query('begin');
            await c.query("select set_config('request.jwt.claims', $1, true)", [
              JSON.stringify(claims),
            ]);
            await c.query('set local role authenticated');
            const result = await c.query(
              'select api.aprovar_objetivo_plano_privado($1::jsonb) as dados',
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
    });
    const portasPara = (usuario_id: string, session_id: string) => {
      const request = new Request('https://example.test', {
        headers: { 'x-sessao': session_id, 'x-chave-idempotencia': 'integracao_ficticia_123' },
      });
      const autorizado = async () => ({
        estado: 'autorizado' as const,
        identidade: { usuario_id, session_id },
      });
      return {
        request,
        portas: {
          autorizar: autorizado,
          revalidar: autorizado,
          atestador: criarAtestadorOperacao({
            keyId: 'teste',
            chave: new Uint8Array(32).fill(0x42),
          }),
          metadados: (request_id: string) => {
            const agora = Date.now();
            return {
              key_id: 'teste',
              request_id,
              emitido_em: new Date(agora - 1000).toISOString(),
              expira_em: new Date(agora + 20000).toISOString(),
            };
          },
          executar: (
            _req: Request,
            transporte: Parameters<typeof executarAprovarObjetivoPlanoNativo>[1],
          ) =>
            executarAprovarObjetivoPlanoNativo(
              cliente({ sub: usuario_id, session_id, amr: [{ method: 'oauth' }] }) as never,
              transporte,
            ),
        },
      };
    };
    let registro_id = '';
    const direto = await pool.connect();
    try {
      const objetivo_id = crypto.randomUUID();
      registro_id = crypto.randomUUID();
      const envelope = JSON.stringify({
        formato: 1,
        key_id: 'teste',
        nonce: 'a'.repeat(16),
        ciphertext: 'YQ',
        tag: 'a'.repeat(22),
      });
      await direto.query('insert into cadastro.objetivo_cuidado(id, paciente_id) values ($1, $2)', [
        objetivo_id,
        paciente_id,
      ]);
      await direto.query(
        'insert into cadastro.objetivo_cuidado_versao(id, objetivo_id, versao, versao_esperada, conteudo_cifrado, criado_por_usuario_id) values ($1, $2, 1, null, $3::jsonb, $4)',
        [registro_id, objetivo_id, envelope, administrador_id],
      );
    } finally {
      direto.release();
    }
    try {
      const admin = portasPara(administrador_id, sessao_admin_id);
      const aprovadoAdmin = await operarAprovarObjetivoPlanoNativo(
        admin.request,
        { registro_id },
        admin.portas,
      );
      expect(aprovadoAdmin).toMatchObject({
        ok: true,
        dados: { registro_id, aprovador_usuario_id: administrador_id },
      });
      const replay = await operarAprovarObjetivoPlanoNativo(
        admin.request,
        { registro_id },
        admin.portas,
      );
      expect(replay).toMatchObject({ ok: true, dados: { aprovador_usuario_id: administrador_id } });
      const profissional = portasPara(profissional_id, sessao_prof_id);
      const negado = await operarAprovarObjetivoPlanoNativo(
        profissional.request,
        { registro_id },
        profissional.portas,
      );
      expect(negado).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
      const registro_inexistente = await operarAprovarObjetivoPlanoNativo(
        admin.request,
        { registro_id: crypto.randomUUID() },
        admin.portas,
      );
      expect(registro_inexistente).toMatchObject({ ok: false, erro: { codigo: 'conflito' } });
    } finally {
      await pool.end();
    }
  },
);
