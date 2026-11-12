import { expect, it } from 'vitest';
import pg from 'pg';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { operarOrientacaoNativa } from './orientacao-nativa.ts';
import { executarOrientacaoNativa } from './executor-orientacao-nativo.ts';

it.skipIf(!process.env.FFCM_PG_SOCKET)(
  'integra handler, cifra, atestado e PostgreSQL descartável (orientações)',
  async () => {
    const pool = new pg.Pool({
      host: process.env.FFCM_PG_SOCKET,
      port: 55443,
      user: 'cadeia_fixture',
      database: 'ffcm_cadeia_local',
    });
    const profissional_id = '10000000-0000-4000-8000-000000000002';
    const sessao_prof_id = '20000000-0000-4000-8000-000000000002';
    const paciente_id = '40000000-0000-4000-8000-000000000001';
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
            const result = await c.query('select api.orientacao_privada($1::jsonb) as dados', [
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
    });
    const portasPara = (
      usuario_id: string,
      session_id: string,
      chave = 'integracao_ficticia_1',
    ) => {
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
          cifra,
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
          executar: (_req: Request, transporte: Parameters<typeof executarOrientacaoNativa>[1]) =>
            executarOrientacaoNativa(
              cliente({ sub: usuario_id, session_id, amr: [{ method: 'oauth' }] }) as never,
              transporte,
            ),
        },
      };
    };
    const conteudo = {
      texto: 'Manter rotina de sono fictícia e registrar episódios no diário.',
      autor: 'Profissional fictício',
      data: '2026-11-10',
      destinatarios: 'Família e escola fictícias',
      validade: null,
    };
    try {
      const prof = portasPara(profissional_id, sessao_prof_id);
      const vazio = await operarOrientacaoNativa(
        prof.request,
        { operacao: 'ler', paciente_id },
        prof.portas,
      );
      expect(vazio).toMatchObject({ ok: true, dados: [] });

      const criada = await operarOrientacaoNativa(
        prof.request,
        { operacao: 'gravar', paciente_id, versao_esperada: 0, situacao: 'vigente', ...conteudo },
        prof.portas,
      );
      // Texto decifrado de volta prova que a cifra e o AAD fecham ponta a ponta.
      expect(criada).toMatchObject({
        ok: true,
        dados: { versao: 1, situacao: 'vigente', texto: conteudo.texto, autor: conteudo.autor },
      });
      const orientacao_id =
        criada.ok && !Array.isArray(criada.dados) ? criada.dados?.orientacao_id : undefined;
      expect(orientacao_id).toMatch(/^[0-9a-f-]{36}$/);

      // Nascer superada é recusado antes mesmo de ir ao banco.
      const nascendoSuperada = await operarOrientacaoNativa(
        portasPara(profissional_id, sessao_prof_id, 'integracao_ficticia_2').request,
        { operacao: 'gravar', paciente_id, versao_esperada: 0, situacao: 'superada', ...conteudo },
        prof.portas,
      );
      expect(nascendoSuperada).toMatchObject({ ok: false, erro: { codigo: 'entrada_invalida' } });

      const superada = await operarOrientacaoNativa(
        portasPara(profissional_id, sessao_prof_id, 'integracao_ficticia_3').request,
        {
          operacao: 'gravar',
          paciente_id,
          orientacao_id,
          versao_esperada: 1,
          situacao: 'superada',
          ...conteudo,
          validade: '2026-12-01',
        },
        prof.portas,
      );
      expect(superada).toMatchObject({
        ok: true,
        dados: { versao: 2, situacao: 'superada', validade: '2026-12-01' },
      });

      // FR-019: a superada continua listada, identificada como anterior.
      const todas = await operarOrientacaoNativa(
        prof.request,
        { operacao: 'ler', paciente_id },
        prof.portas,
      );
      expect(todas).toMatchObject({
        ok: true,
        dados: [{ orientacao_id, versao: 2, situacao: 'superada' }],
      });
      const vigentes = await operarOrientacaoNativa(
        prof.request,
        { operacao: 'ler', paciente_id, apenas_vigentes: true },
        prof.portas,
      );
      expect(vigentes).toMatchObject({ ok: true, dados: [] });

      const conflito = await operarOrientacaoNativa(
        portasPara(profissional_id, sessao_prof_id, 'integracao_ficticia_4').request,
        {
          operacao: 'gravar',
          paciente_id,
          orientacao_id,
          versao_esperada: 1,
          situacao: 'vigente',
          ...conteudo,
        },
        prof.portas,
      );
      expect(conflito).toMatchObject({ ok: false, erro: { codigo: 'conflito_versao' } });

      // Sessão encerrada perde o acesso mesmo com atestado válido.
      const conexao = await pool.connect();
      try {
        await conexao.query(
          'update identidade.sessao set encerrada_em = clock_timestamp() where session_id = $1',
          [sessao_prof_id],
        );
      } finally {
        conexao.release();
      }
      const negado = await operarOrientacaoNativa(
        prof.request,
        { operacao: 'ler', paciente_id },
        prof.portas,
      );
      expect(negado).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
    } finally {
      await pool.end();
    }
  },
);
