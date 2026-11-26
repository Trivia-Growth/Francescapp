import { expect, it } from 'vitest';
import pg from 'pg';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { operarCampoExtraPlanoNativo } from './campo-extra-plano-nativo.ts';
import { executarCampoExtraPlanoNativo } from './executor-campo-extra-plano-nativo.ts';
import { criarIdempotenciaNativa } from './idempotencia-nativa.ts';

it.skipIf(!process.env.FFCM_PG_SOCKET)(
  'integra handler, executor, atestado e PostgreSQL descartável (administrador)',
  async () => {
    const pool = new pg.Pool({
      host: process.env.FFCM_PG_SOCKET,
      port: 55438,
      user: 'cadeia_fixture',
      database: 'ffcm_cadeia_local',
    });
    const administrador_id = '10000000-0000-4000-8000-000000000001';
    const sessao_admin_id = '20000000-0000-4000-8000-000000000001';
    const profissional_id = '10000000-0000-4000-8000-000000000002';
    const sessao_prof_id = '20000000-0000-4000-8000-000000000002';
    // calcularHmac é a única parte de `cifra` usada aqui (idempotência); o catálogo
    // de campos extras não é conteúdo clínico e não passa por cifra/AAD.
    const cifra = criarCifraAutenticada({
      keyIdAtiva: 'teste',
      chavesDeCifra: { teste: new Uint8Array(32).fill(2) },
      chaveHmac: new Uint8Array(32).fill(4),
    });
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
              'select api.campo_extra_plano_privado($1::jsonb) as dados',
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
          idempotencia: criarIdempotenciaNativa(cifra),
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
            transporte: Parameters<typeof executarCampoExtraPlanoNativo>[1],
          ) =>
            executarCampoExtraPlanoNativo(
              cliente({ sub: usuario_id, session_id, amr: [{ method: 'oauth' }] }) as never,
              transporte,
            ),
        },
      };
    };
    try {
      const admin = portasPara(administrador_id, sessao_admin_id);
      const vazio = await operarCampoExtraPlanoNativo(
        admin.request,
        { operacao: 'listar' },
        admin.portas,
      );
      expect(vazio).toMatchObject({ ok: true, dados: [] });
      const campo_id = crypto.randomUUID();
      const criado = await operarCampoExtraPlanoNativo(
        admin.request,
        {
          operacao: 'gravar',
          campo_id,
          nome: 'Observação extra',
          tipo: 'texto',
          opcoes: null,
          ativo: true,
          versao_esperada: 0,
        },
        admin.portas,
      );
      expect(criado).toMatchObject({
        ok: true,
        dados: { campo_id, nome: 'Observação extra', versao: 1 },
      });
      const editado = await operarCampoExtraPlanoNativo(
        new Request('https://example.test', {
          headers: { 'x-sessao': sessao_admin_id, 'x-chave-idempotencia': 'edicao_ficticia_123' },
        }),
        {
          operacao: 'gravar',
          campo_id,
          nome: 'Observação extra revisada',
          tipo: 'texto',
          opcoes: null,
          ativo: true,
          versao_esperada: 1,
        },
        admin.portas,
      );
      expect(editado).toMatchObject({
        ok: true,
        dados: { versao: 2, nome: 'Observação extra revisada' },
      });
      const listado = await operarCampoExtraPlanoNativo(
        admin.request,
        { operacao: 'listar' },
        admin.portas,
      );
      expect(listado).toMatchObject({ ok: true, dados: [{ campo_id, versao: 2 }] });
      const profissional = portasPara(profissional_id, sessao_prof_id);
      const negado = await operarCampoExtraPlanoNativo(
        profissional.request,
        { operacao: 'listar' },
        profissional.portas,
      );
      expect(negado).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
    } finally {
      await pool.end();
    }
  },
);
