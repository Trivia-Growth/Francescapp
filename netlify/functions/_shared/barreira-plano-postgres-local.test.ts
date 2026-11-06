import { criarCursorReconciliacao } from '../../../packages/cadastro/src/cursor-reconciliacao.ts';
import { expect, it } from 'vitest';
import pg from 'pg';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { operarBarreiraPlanoNativa } from './barreira-plano-operacao.ts';
import { executarBarreiraPlanoNativa } from './executor-barreira-plano-nativo.ts';
import { operarPlanoCuidadoNativo } from './plano-cuidado-nativo.ts';
import { executarPlanoCuidadoNativo } from './executor-plano-cuidado-nativo.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { criarIdempotenciaNativa } from './idempotencia-nativa.ts';

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
        rpc: async (nome: string, args: { p_transporte: unknown }) => {
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
              nome === 'plano_composicao_privada'
                ? 'select api.plano_composicao_privada($1::jsonb) as dados'
                : 'select api.plano_cuidado_privado($1::jsonb) as dados',
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
      // Zera somente estado fictício da fixture; fluxo seguinte passa pelos dois handlers e banco real.
      await pool.query('delete from operacao.reserva_plano where ator_usuario_id=$1', [
        identidade.usuario_id,
      ]);
      await pool.query('delete from operacao.recibo_barreira_plano where ator_usuario_id=$1', [
        identidade.usuario_id,
      ]);
      await pool.query('delete from operacao.barreira_plano where ator_usuario_id=$1', [
        identidade.usuario_id,
      ]);
      await pool.query(
        'grant execute on function api.plano_cuidado_privado(jsonb) to authenticated',
      );
      const paciente_id = '40000000-0000-4000-8000-000000000001';
      const reserva_id = crypto.randomUUID();
      expect(
        await operarBarreiraPlanoNativa(
          request,
          {
            operacao: 'api.reservar_plano',
            epoca: 1,
            reserva_id,
            paciente_id,
          },
          portas,
        ),
      ).toMatchObject({ ok: true, dados: { estado: 'aberta' } });
      const cifra = criarCifraAutenticada({
        keyIdAtiva: 'teste',
        chavesDeCifra: { teste: new Uint8Array(32).fill(2) },
        chaveHmac: new Uint8Array(32).fill(4),
      });
      const objetivo_id = crypto.randomUUID();
      const objetivo = {
        descricao: 'conteudo ficticio',
        area: 'saude',
        responsavel: 'equipe',
        situacaoInicial: 'inicial',
        observacaoProgresso: 'progresso',
        dataRevisao: '2026-12-01',
        estado: 'proposto',
      };
      const pedidoGravacao = new Request('https://exemplo.test', {
        headers: {
          'x-sessao': identidade.session_id,
          'x-chave-idempotencia': 'integracao_reserva_123',
        },
      });
      const gravar = {
        operacao: 'gravar' as const,
        paciente_id,
        objetivo_id,
        versao_esperada: 0,
        reserva_id,
        geracao_reserva: 1,
        objetivo,
      };
      const portasPlano = {
        cursor: criarCursorReconciliacao(new Uint8Array(32).fill(7)),
        ...portas,
        cifra,
        idempotencia: criarIdempotenciaNativa(cifra),
        executar: (_req: Request, transporte: Parameters<typeof executarPlanoCuidadoNativo>[1]) =>
          executarPlanoCuidadoNativo(cliente as never, transporte),
      };
      expect(
        await operarPlanoCuidadoNativo(
          pedidoGravacao,
          { ...gravar, reserva_id: crypto.randomUUID() },
          portasPlano,
        ),
      ).toMatchObject({ ok: false, erro: { codigo: 'conflito_versao' } });
      expect(
        await operarPlanoCuidadoNativo(
          pedidoGravacao,
          { ...gravar, geracao_reserva: 0 },
          portasPlano,
        ),
      ).toMatchObject({ ok: false, erro: { codigo: 'entrada_invalida' } });
      expect(await operarPlanoCuidadoNativo(pedidoGravacao, gravar, portasPlano)).toMatchObject({
        ok: true,
        dados: { objetivo_id, versao: 1, objetivo },
      });
      const comando_id = crypto.randomUUID();
      expect(
        await operarBarreiraPlanoNativa(
          request,
          { operacao: 'api.encerrar_plano', epoca: 1, reserva_id, comando_id },
          portas,
        ),
      ).toMatchObject({ ok: true, dados: { estado: 'confirmada' } });
      expect(
        await operarBarreiraPlanoNativa(
          request,
          { operacao: 'api.reconhecer_barreira_plano', comando_id },
          portas,
        ),
      ).toMatchObject({ ok: true, dados: { estado: 'reconhecido' } });
      const novaReserva = crypto.randomUUID();
      expect(
        await operarBarreiraPlanoNativa(
          request,
          { operacao: 'api.reservar_plano', epoca: 2, reserva_id: novaReserva, paciente_id },
          portas,
        ),
      ).toMatchObject({ ok: true, dados: { estado: 'aberta' } });
      // Mesma chave e conteúdo nunca podem confirmar operação de outra reserva.
      expect(
        await operarPlanoCuidadoNativo(
          pedidoGravacao,
          { ...gravar, reserva_id: novaReserva, geracao_reserva: 2 },
          portasPlano,
        ),
      ).toMatchObject({ ok: false, erro: { codigo: 'conflito_idempotencia' } });
      expect(
        await operarBarreiraPlanoNativa(
          request,
          {
            operacao: 'api.encerrar_plano',
            epoca: 2,
            reserva_id: novaReserva,
            comando_id: crypto.randomUUID(),
          },
          portas,
        ),
      ).toMatchObject({ ok: true, dados: { estado: 'cancelada' } });
      const gravados = await pool.query(
        'select count(*)::int as total from cadastro.objetivo_cuidado_versao where objetivo_id=$1',
        [objetivo_id],
      );
      expect(gravados.rows[0].total).toBe(1);
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
