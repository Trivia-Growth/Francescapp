import { expect, it } from 'vitest';
import pg from 'pg';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { operarConfiguracaoSistemaNativo } from './configuracao-sistema-nativo.ts';
import { executarConfiguracaoSistemaNativo } from './executor-configuracao-sistema-nativo.ts';
import { esquecerConfiguracaoServidor, servicoAtivo } from './configuracao-servidor.ts';
import { criarIdempotenciaNativa } from './idempotencia-nativa.ts';

it.skipIf(!process.env.FFCM_PG_SOCKET)(
  'integra handler, executor, atestado, leitor do servidor e PostgreSQL descartável',
  async () => {
    const pool = new pg.Pool({
      host: process.env.FFCM_PG_SOCKET,
      port: 55448,
      user: 'configuracao_fixture',
      database: 'ffcm_cadeia_local',
    });
    const administrador_id = '10000000-0000-4000-8000-000000000001';
    const sessao_admin_id = '20000000-0000-4000-8000-000000000001';
    const profissional_id = '10000000-0000-4000-8000-000000000002';
    const sessao_prof_id = '20000000-0000-4000-8000-000000000002';
    const familia_id = '10000000-0000-4000-8000-000000000004';
    const sessao_familia_id = '20000000-0000-4000-8000-000000000004';
    // calcularHmac é a única parte de `cifra` usada aqui (idempotência); configuração é
    // parâmetro operacional e não passa por cifra/AAD.
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
              'select api.configuracao_sistema_privado($1::jsonb) as dados',
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
    const portasPara = (usuario_id: string, session_id: string, chave = 'integracao_fict_123') => {
      const request = new Request('https://example.test', {
        headers: { 'x-sessao': session_id, 'x-chave-idempotencia': chave },
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
            transporte: Parameters<typeof executarConfiguracaoSistemaNativo>[1],
          ) =>
            executarConfiguracaoSistemaNativo(
              cliente({ sub: usuario_id, session_id, amr: [{ method: 'oauth' }] }) as never,
              transporte,
            ),
        },
      };
    };
    try {
      const admin = portasPara(administrador_id, sessao_admin_id);
      const listado = await operarConfiguracaoSistemaNativo(
        admin.request,
        { operacao: 'listar' },
        admin.portas,
      );
      expect(listado).toMatchObject({
        ok: true,
        dados: [
          { chave: 'ffcm.campo_extra_plano.ativo', valor: true, tipo: 'booleano', versao: 1 },
          { chave: 'ffcm.contato.ativo', valor: true, tipo: 'booleano', versao: 1 },
        ],
      });

      // Antes de qualquer gravação o leitor do servidor concorda com o catálogo semeado.
      esquecerConfiguracaoServidor();
      expect(await servicoAtivo(pool, 'ffcm.contato.ativo', false)).toBe(true);

      const desligado = await operarConfiguracaoSistemaNativo(
        admin.request,
        {
          operacao: 'gravar',
          configuracao_chave: 'ffcm.contato.ativo',
          valor: false,
          versao_esperada: 1,
        },
        admin.portas,
      );
      expect(desligado).toMatchObject({
        ok: true,
        dados: {
          chave: 'ffcm.contato.ativo',
          valor: false,
          versao: 2,
          atualizado_por_usuario_id: administrador_id,
        },
      });

      // O banco manda: a variável de ambiente dizia "ligado", a tela desligou.
      esquecerConfiguracaoServidor();
      expect(await servicoAtivo(pool, 'ffcm.contato.ativo', true)).toBe(false);
      // Chave que o banco não conhece cai no padrão do ambiente, nos dois sentidos.
      expect(await servicoAtivo(pool, 'ffcm.sem.chave', true)).toBe(true);
      expect(await servicoAtivo(pool, 'ffcm.sem.chave', false)).toBe(false);

      // Versão desatualizada não altera nada.
      const conflito = await operarConfiguracaoSistemaNativo(
        portasPara(administrador_id, sessao_admin_id, 'conflito_fict_123').request,
        {
          operacao: 'gravar',
          configuracao_chave: 'ffcm.contato.ativo',
          valor: true,
          versao_esperada: 1,
        },
        portasPara(administrador_id, sessao_admin_id, 'conflito_fict_123').portas,
      );
      expect(conflito).toMatchObject({ ok: false, erro: { codigo: 'conflito_versao' } });
      esquecerConfiguracaoServidor();
      expect(await servicoAtivo(pool, 'ffcm.contato.ativo', true)).toBe(false);

      // Mesmo passando pelo servidor com identidade atestada, o banco nega ambos os perfis.
      await pool.query('insert into auth.users values ($1);', [familia_id]);
      await pool.query('insert into public.usuario(id,perfil) values ($1,$2)', [
        familia_id,
        'familia',
      ]);
      await pool.query('insert into auth.sessions values ($1,$2,null)', [
        sessao_familia_id,
        familia_id,
      ]);
      for (const [usuarioId, sessaoId] of [
        [profissional_id, sessao_prof_id],
        [familia_id, sessao_familia_id],
      ] as const) {
        const negado = portasPara(usuarioId, sessaoId, 'perfil-negado-ficticio');
        expect(
          await operarConfiguracaoSistemaNativo(
            negado.request,
            { operacao: 'listar' },
            negado.portas,
          ),
        ).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
        expect(
          await operarConfiguracaoSistemaNativo(
            negado.request,
            {
              operacao: 'gravar',
              configuracao_chave: 'ffcm.contato.ativo',
              valor: true,
              versao_esperada: 2,
            },
            negado.portas,
          ),
        ).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
      }
      const estadoFinal = await pool.query(
        'select valor, versao from identidade.configuracao_sistema where chave=$1',
        ['ffcm.contato.ativo'],
      );
      expect(estadoFinal.rows).toEqual([{ valor: false, versao: 2 }]);
    } finally {
      await pool.end();
    }

    // Leitura impossível nunca LIGA um serviço: mantém o que o ambiente já dizia.
    const poolMorto = new pg.Pool({
      host: process.env.FFCM_PG_SOCKET,
      port: 1,
      user: 'configuracao_fixture',
      database: 'ffcm_cadeia_local',
      connectionTimeoutMillis: 1000,
    });
    try {
      esquecerConfiguracaoServidor();
      expect(await servicoAtivo(poolMorto, 'ffcm.contato.ativo', false)).toBe(false);
      esquecerConfiguracaoServidor();
      expect(await servicoAtivo(poolMorto, 'ffcm.contato.ativo', true)).toBe(true);
    } finally {
      await poolMorto.end();
      esquecerConfiguracaoServidor();
    }
  },
);
