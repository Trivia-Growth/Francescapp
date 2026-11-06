import { criarCursorReconciliacao } from '../../../packages/cadastro/src/cursor-reconciliacao.ts';
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
    const tamanhosBanco: number[] = [];
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
            tamanhosBanco.push(Buffer.byteLength(JSON.stringify(result.rows[0].dados)));
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
      cursor: criarCursorReconciliacao(new Uint8Array(32).fill(7)),
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
    const reserva_id = crypto.randomUUID();
    const gravar = {
      operacao: 'gravar' as const,
      paciente_id,
      objetivo_id,
      versao_esperada: 0,
      reserva_id,
      geracao_reserva: 1,
      objetivo,
    };
    try {
      await pool.query('delete from operacao.reserva_plano where ator_usuario_id=$1', [usuario_id]);
      await pool.query('delete from operacao.recibo_barreira_plano where ator_usuario_id=$1', [
        usuario_id,
      ]);
      await pool.query('delete from operacao.barreira_plano where ator_usuario_id=$1', [
        usuario_id,
      ]);
      await pool.query(
        "select set_config('request.jwt.claims', json_build_object('sub',$1::text)::text, false)",
        [usuario_id],
      );
      await pool.query('select operacao.reservar_plano_privado($1,1,$2,$3)', [
        usuario_id,
        reserva_id,
        paciente_id,
      ]);
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
      const requestRevisao = new Request('https://example.test', {
        headers: { 'x-sessao': session_id, 'x-chave-idempotencia': 'revisao_ficticia_123' },
      });
      const revisado = { ...objetivo, descricao: 'revisao ficticia' };
      expect(
        await operarPlanoCuidadoNativo(
          requestRevisao,
          {
            ...gravar,
            reserva_id: undefined,
            geracao_reserva: undefined,
            versao_esperada: 1,
            objetivo: revisado,
            motivo: 'revisao ficticia',
          },
          portas,
        ),
      ).toMatchObject({ ok: true, dados: { versao: 2, objetivo: revisado } });
      const historico = { operacao: 'historico' as const, paciente_id, objetivo_id };
      expect(await operarPlanoCuidadoNativo(request, historico, portas)).toMatchObject({
        ok: true,
        dados: {
          itens: [
            { versao: 1, objetivo },
            { versao: 2, objetivo: revisado, motivo: 'revisao ficticia' },
          ],
          proximo_cursor: null,
        },
      });
      const pagina1 = await operarPlanoCuidadoNativo(request, { ...historico, limite: 1 }, portas);
      expect(pagina1).toMatchObject({ ok: true, dados: { itens: [{ versao: 1 }] } });
      if (
        !pagina1.ok ||
        !pagina1.dados ||
        !('itens' in pagina1.dados) ||
        !pagina1.dados.proximo_cursor
      )
        throw new Error('cursor ausente');
      const cursor = pagina1.dados.proximo_cursor;
      const pagina2 = await operarPlanoCuidadoNativo(
        request,
        { ...historico, limite: 1, cursor },
        portas,
      );
      expect(pagina2).toMatchObject({
        ok: true,
        dados: { itens: [{ versao: 2 }], proximo_cursor: null },
      });
      await pool.query(
        'update identidade.sessao set encerrada_em=clock_timestamp() where session_id=$1',
        [session_id],
      );
      expect(
        await operarPlanoCuidadoNativo(request, { ...historico, limite: 1, cursor }, portas),
      ).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
      await pool.query('update identidade.sessao set encerrada_em=null where session_id=$1', [
        session_id,
      ]);
      // Volume legítimo acima do teto de transporte deve atravessar páginas limitadas.
      const objetivoGrande = crypto.randomUUID();
      await pool.query('insert into cadastro.objetivo_cuidado(id,paciente_id) values($1,$2)', [
        objetivoGrande,
        paciente_id,
      ]);
      for (let versao = 1; versao <= 55; versao++) {
        const registroId = crypto.randomUUID();
        const conteudo = {
          objetivo: { ...objetivo, descricao: 'x'.repeat(20_000) },
          ...(versao > 1 ? { motivo: 'revisao ficticia' } : {}),
          ator_usuario_id: usuario_id,
          data: '2026-11-04T12:00:00.000Z',
        };
        const envelope = await cifra.cifrar(JSON.stringify(conteudo), {
          tabela: 'cadastro.objetivo_cuidado_versao',
          paciente_id,
          objetivo_id: objetivoGrande,
          registro_id: registroId,
          versao,
          campo: 'conteudo',
          formato: 1,
        });
        await pool.query(
          'insert into cadastro.objetivo_cuidado_versao(id,objetivo_id,versao,versao_esperada,conteudo_cifrado,criado_por_usuario_id) values($1,$2,$3,$4,$5,$6)',
          [
            registroId,
            objetivoGrande,
            versao,
            versao === 1 ? null : versao - 1,
            JSON.stringify(envelope),
            usuario_id,
          ],
        );
      }
      tamanhosBanco.length = 0;
      let cursorVolume: string | undefined;
      let totalBytes = 0;
      const versoes: number[] = [];
      do {
        const paginaVolume = await operarPlanoCuidadoNativo(
          request,
          {
            operacao: 'historico',
            paciente_id,
            objetivo_id: objetivoGrande,
            limite: 20,
            cursor: cursorVolume,
          },
          portas,
        );
        if (
          !paginaVolume.ok ||
          !paginaVolume.dados ||
          !('itens' in paginaVolume.dados) ||
          !paginaVolume.dados.itens
        )
          throw new Error('pagina indisponivel');
        const tamanho = Buffer.byteLength(JSON.stringify(paginaVolume));
        expect(tamanho).toBeLessThan(1024 * 1024);
        totalBytes += tamanho;
        versoes.push(...paginaVolume.dados.itens.map((item) => item.versao));
        cursorVolume = paginaVolume.dados.proximo_cursor ?? undefined;
      } while (cursorVolume);
      expect(totalBytes).toBeGreaterThan(1024 * 1024);
      expect(versoes).toEqual(Array.from({ length: 55 }, (_, indice) => indice + 1));
      expect(tamanhosBanco.length).toBe(3);
      expect(tamanhosBanco.every((tamanho) => tamanho < 1024 * 1024)).toBe(true);
      const cifrados = await pool.query(
        'select conteudo_cifrado from cadastro.objetivo_cuidado_versao where objetivo_id=$1 order by versao',
        [objetivo_id],
      );
      expect(cifrados.rows).toHaveLength(2);
      expect(JSON.stringify(cifrados.rows)).not.toContain('conteudo ficticio');
      expect(JSON.stringify(cifrados.rows)).not.toContain('revisao ficticia');
      expect(
        await operarPlanoCuidadoNativo(
          request,
          {
            ...historico,
            paciente_id: '40000000-0000-4000-8000-000000000002',
          },
          portas,
        ),
      ).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
      await pool.query(
        'update identidade.sessao set encerrada_em=clock_timestamp() where session_id=$1',
        [session_id],
      );
      expect(await operarPlanoCuidadoNativo(request, historico, portas)).toMatchObject({
        ok: false,
        erro: { codigo: 'sem_permissao' },
      });
      await pool.query('update identidade.sessao set encerrada_em=null where session_id=$1', [
        session_id,
      ]);
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
      expect(resultado.rows[0].total).toBe(2);
      // A escrita confirma no banco, mas a resposta se perde antes de chegar ao handler.
      const requestPerdido = new Request('https://example.test', {
        headers: { 'x-sessao': session_id, 'x-chave-idempotencia': 'resposta_perdida_123' },
      });
      const objetivoPerdido = 'd0000000-0000-4000-8000-000000000005';
      await pool.query('delete from operacao.reserva_plano where ator_usuario_id=$1', [usuario_id]);
      await pool.query('delete from operacao.recibo_barreira_plano where ator_usuario_id=$1', [
        usuario_id,
      ]);
      await pool.query('delete from operacao.barreira_plano where ator_usuario_id=$1', [
        usuario_id,
      ]);
      const reservaPerdida = crypto.randomUUID();
      await pool.query(
        "select set_config('request.jwt.claims', json_build_object('sub',$1::text)::text, false)",
        [usuario_id],
      );
      await pool.query('select operacao.reservar_plano_privado($1,1,$2,$3)', [
        usuario_id,
        reservaPerdida,
        paciente_id,
      ]);
      const comandoPerdido = {
        ...gravar,
        objetivo_id: objetivoPerdido,
        reserva_id: reservaPerdida,
      };
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
