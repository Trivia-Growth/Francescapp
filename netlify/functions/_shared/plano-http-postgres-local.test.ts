import { createServer } from 'node:http';
import { once } from 'node:events';
import pg from 'pg';
import { expect, it, vi } from 'vitest';
import { criarEntradaPlanoNativa } from './entrada-plano-nativa.ts';

it.skipIf(!process.env.FFCM_PG_SOCKET)(
  'atravessa HTTP, entrada, cifra e atestado até PostgreSQL local',
  async () => {
    const db = new pg.Pool({
      host: process.env.FFCM_PG_SOCKET,
      port: 5432,
      user: 'cadeia_fixture',
      database: 'ffcm_cadeia_local',
    });
    const usuario = '10000000-0000-4000-8000-000000000002';
    const sessao = '20000000-0000-4000-8000-000000000002';
    const paciente = '40000000-0000-4000-8000-000000000001';
    const objetivoId = crypto.randomUUID();
    const reserva = crypto.randomUUID();
    const origem = 'https://app.example.test';
    const objetivo = {
      descricao: 'conteúdo fictício',
      area: 'saude',
      responsavel: 'equipe',
      situacaoInicial: 'inicial',
      observacaoProgresso: 'progresso',
      dataRevisao: '2026-12-01',
      estado: 'proposto',
    };
    const query = async (sql: string, args?: string[]) => {
      if (sql.includes('ler_chave_cifra_vault'))
        return {
          rows: [
            { chave: Buffer.alloc(32, args?.[0]?.endsWith('hmac') ? 4 : 2).toString('base64') },
          ],
        };
      if (sql.includes('ler_chave_atestado_vault'))
        return { rows: [{ chave: Buffer.alloc(32, 0x42) }] };
      return { rows: [] };
    };
    const pool = {
      options: { connectionTimeoutMillis: 1000, query_timeout: 1000 },
      connect: async () => ({ query, release() {} }),
    } as unknown as pg.Pool;
    const entrada = criarEntradaPlanoNativa({
      fonte: {
        FFCM_SUPABASE_URL: 'https://projeto-ficticio.supabase.co',
        FFCM_SUPABASE_ANON_KEY: 'publica',
        FFCM_APP_ORIGIN: origem,
      },
      pool,
      referencias: {
        keyIdAtiva: 'teste',
        referenciasCifra: { teste: 'ffcmapp.cifra.ativa' },
        referenciaHmac: 'ffcmapp.cifra.hmac',
      },
      keyIdAtestado: 'teste',
    });
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: usuario, exp })).toString('base64url')}.ZmFrZQ`;
    const cookie = `sb-projeto-ficticio-auth-token=base64-${Buffer.from(JSON.stringify({ access_token: token, refresh_token: 'ficticio', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: { id: usuario, aud: 'authenticated' } })).toString('base64url')}`;
    const fetchReal = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname !== 'projeto-ficticio.supabase.co') return fetchReal(input, init);
      if (url.pathname === '/auth/v1/user')
        return Response.json({ id: usuario, aud: 'authenticated' });
      if (url.pathname.endsWith('/consultar_sessao_nativa'))
        return Response.json({
          session_id: sessao,
          usuario: { id: usuario, perfil: 'profissional', ativo: true, versao: 1 },
          capacidades: ['consultar_pacientes_vinculados'],
        });
      if (!url.pathname.endsWith('/plano_cuidado_privado')) throw new Error('RPC inesperada');
      const args = JSON.parse(String(init?.body));
      const c = await db.connect();
      try {
        await c.query('begin');
        await c.query("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({ sub: usuario, session_id: sessao, amr: [{ method: 'oauth' }] }),
        ]);
        await c.query('set local role authenticated');
        const resultado = await c.query('select api.plano_cuidado_privado($1::jsonb) as dados', [
          JSON.stringify(args.p_transporte),
        ]);
        await c.query('commit');
        return Response.json(resultado.rows[0].dados);
      } catch (error) {
        await c.query('rollback');
        throw error;
      } finally {
        c.release();
      }
    });
    const server = createServer(async (req, res) => {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const body = Buffer.concat(chunks);
        const response = await entrada.atender(
          new Request(`${origem}${req.url}`, {
            method: req.method,
            headers: req.headers as HeadersInit,
            ...(body.length ? { body } : {}),
          }),
        );
        const headers: Record<string, string> = {};
        response.headers.forEach((valor, chave) => {
          headers[chave] = valor;
        });
        res.writeHead(response.status, headers);
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch {
        res.writeHead(500);
        res.end();
      }
    });
    try {
      await db.query('delete from operacao.reserva_plano where ator_usuario_id=$1', [usuario]);
      await db.query('delete from operacao.recibo_barreira_plano where ator_usuario_id=$1', [
        usuario,
      ]);
      await db.query('delete from operacao.barreira_plano where ator_usuario_id=$1', [usuario]);
      await db.query(
        "select set_config('request.jwt.claims',json_build_object('sub',$1::text)::text,false)",
        [usuario],
      );
      await db.query('select operacao.reservar_plano_privado($1,1,$2,$3)', [
        usuario,
        reserva,
        paciente,
      ]);
      await db.query('grant usage on schema api to authenticated');
      await db.query('grant execute on function api.plano_cuidado_privado(jsonb) to authenticated');
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('servidor indisponível');
      const url = `http://127.0.0.1:${address.port}/api/pacientes/${paciente}/plano`;
      const headers = {
        cookie,
        origin: origem,
        'x-sessao': sessao,
        'x-chave-idempotencia': crypto.randomUUID(),
        'content-type': 'application/json',
      };
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          objetivo_id: objetivoId,
          objetivo,
          reserva_id: reserva,
          geracao_reserva: 1,
        }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        dados: { objetivo_id: objetivoId, objetivo, versao: 1 },
      });
      const registro = await db.query(
        'select conteudo_cifrado from cadastro.objetivo_cuidado_versao where objetivo_id=$1',
        [objetivoId],
      );
      expect(registro.rows).toHaveLength(1);
      expect(JSON.stringify(registro.rows)).not.toContain(objetivo.descricao);
      const outra = await fetch(
        `http://127.0.0.1:${address.port}/api/pacientes/40000000-0000-4000-8000-000000000002/plano/${objetivoId}/historico`,
        { headers },
      );
      expect(outra.status).toBe(403);
    } finally {
      server.close();
      vi.unstubAllGlobals();
      await db.end();
    }
  },
);
