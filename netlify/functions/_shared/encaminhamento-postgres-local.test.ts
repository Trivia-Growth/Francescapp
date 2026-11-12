import { expect, it } from 'vitest';
import pg from 'pg';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { operarEncaminhamentoNativo } from './encaminhamento-nativo.ts';
import { executarEncaminhamentoNativo } from './executor-encaminhamento-nativo.ts';

it.skipIf(!process.env.FFCM_PG_SOCKET)(
  'integra handler, cifra, atestado e PostgreSQL descartável (encaminhamentos)',
  async () => {
    const pool = new pg.Pool({
      host: process.env.FFCM_PG_SOCKET,
      port: 55441,
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
            const result = await c.query('select api.encaminhamento_privado($1::jsonb) as dados', [
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
          executar: (
            _req: Request,
            transporte: Parameters<typeof executarEncaminhamentoNativo>[1],
          ) =>
            executarEncaminhamentoNativo(
              cliente({ sub: usuario_id, session_id, amr: [{ method: 'oauth' }] }) as never,
              transporte,
            ),
        },
      };
    };
    try {
      const prof = portasPara(profissional_id, sessao_prof_id);
      const vazio = await operarEncaminhamentoNativo(
        prof.request,
        { operacao: 'ler', paciente_id },
        prof.portas,
      );
      expect(vazio).toMatchObject({ ok: true, dados: [] });

      const criado = await operarEncaminhamentoNativo(
        prof.request,
        {
          operacao: 'gravar',
          paciente_id,
          versao_esperada: 0,
          etapa: 'sugerido',
          destino: 'Neuropediatria do hospital de referência',
          motivo: 'Avaliar episódios de ausência relatados na escola',
          responsavel: 'Profissional de referência do caso',
        },
        prof.portas,
      );
      // Texto decifrado de volta prova que a cifra e o AAD fecham ponta a ponta.
      expect(criado).toMatchObject({
        ok: true,
        dados: {
          versao: 1,
          etapa: 'sugerido',
          destino: 'Neuropediatria do hospital de referência',
        },
      });
      const encaminhamento_id =
        criado.ok && !Array.isArray(criado.dados) ? criado.dados?.encaminhamento_id : undefined;
      expect(encaminhamento_id).toMatch(/^[0-9a-f-]{36}$/);

      const revisado = await operarEncaminhamentoNativo(
        portasPara(profissional_id, sessao_prof_id, 'integracao_ficticia_2').request,
        {
          operacao: 'gravar',
          paciente_id,
          encaminhamento_id,
          versao_esperada: 1,
          etapa: 'retorno_pendente',
          destino: 'Neuropediatria do hospital de referência',
          motivo: 'Avaliar episódios de ausência relatados na escola',
          responsavel: 'Profissional de referência do caso',
          observacao: 'Consulta realizada; relatório ainda não devolvido.',
        },
        prof.portas,
      );
      expect(revisado).toMatchObject({
        ok: true,
        dados: {
          versao: 2,
          etapa: 'retorno_pendente',
          observacao: 'Consulta realizada; relatório ainda não devolvido.',
        },
      });

      // Mesma versão esperada de novo é conflito, não segunda gravação.
      const conflito = await operarEncaminhamentoNativo(
        portasPara(profissional_id, sessao_prof_id, 'integracao_ficticia_3').request,
        {
          operacao: 'gravar',
          paciente_id,
          encaminhamento_id,
          versao_esperada: 1,
          etapa: 'concluido',
          destino: 'Neuropediatria do hospital de referência',
          motivo: 'Avaliar episódios de ausência relatados na escola',
          responsavel: 'Profissional de referência do caso',
        },
        prof.portas,
      );
      expect(conflito).toMatchObject({ ok: false, erro: { codigo: 'conflito_versao' } });

      const semRetorno = await operarEncaminhamentoNativo(
        prof.request,
        { operacao: 'ler', paciente_id, apenas_sem_retorno: true },
        prof.portas,
      );
      expect(semRetorno).toMatchObject({
        ok: true,
        dados: [{ encaminhamento_id, versao: 2, etapa: 'retorno_pendente' }],
      });

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
      const negado = await operarEncaminhamentoNativo(
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
