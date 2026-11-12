import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { comporPacientesNativo } from './compor-pacientes-nativo.ts';
import { carregarCofreNativo } from './cofre-nativo.ts';

const socket = process.env.FFCM_PACIENTES_SOCKET;
const usuario = '10000000-0000-4000-8000-000000000001';
const sessao = '20000000-0000-4000-8000-000000000001';
const outro = '10000000-0000-4000-8000-000000000002';
const outraSessao = '20000000-0000-4000-8000-000000000002';
const origem = 'https://app.example.test';
const fonte = {
  FFCM_SUPABASE_URL: 'https://projeto-ficticio.supabase.co',
  FFCM_SUPABASE_ANON_KEY: 'chave-publica',
  FFCM_APP_ORIGIN: origem,
};

describe.skipIf(!socket)('pacientes: composição e PostgreSQL local', () => {
  it('reserva, cria e lista paciente; restringe outro perfil e sessão revogada', async () => {
    const admin = new Pool({
      host: socket,
      port: 5432,
      database: 'ffcm_cadeia_local',
      user: 'cofre_admin',
    });
    const pool = new Pool({
      host: socket,
      port: 5432,
      database: 'ffcm_cadeia_local',
      user: 'ffcm_cofre_runtime',
      connectionTimeoutMillis: 3000,
      query_timeout: 3000,
    });
    const chamadas: string[] = [];
    const transportes = new Map<string, Record<string, unknown>>();
    const chamarDireto = async (nome: string, transporte: unknown) => {
      const cliente = await admin.connect();
      try {
        await cliente.query('begin');
        await cliente.query('set local role authenticated');
        await cliente.query("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({ sub: usuario, session_id: sessao, amr: [{ method: 'oauth' }] }),
        ]);
        const resultado = await cliente.query(`select api.${nome}($1::jsonb) as dados`, [
          JSON.stringify(transporte),
        ]);
        await cliente.query('commit');
        return resultado.rows[0].dados;
      } catch (erro) {
        await cliente.query('rollback');
        throw erro;
      } finally {
        cliente.release();
      }
    };
    try {
      await admin.query(`
        insert into identidade.configuracao_auth_nativo(dominio_workspace,google_unico_oauth_confirmado) values ('example.test',true);
        insert into auth.users values ('${usuario}'),('${outro}');
        insert into public.usuario(id,perfil) values ('${usuario}','administrador'),('${outro}','profissional');
        insert into auth.identities select id,id,'google','google-'||id,jsonb_build_object('sub','google-'||id,'email_verified',true,'custom_claims',jsonb_build_object('hd','example.test')) from auth.users;
        insert into auth.sessions select replace(id::text,'10000000-','20000000-')::uuid,id,null from auth.users;
        insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,criada_em,vinculada_em)
        select replace(id::text,'10000000-','30000000-')::uuid,'{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}', 'fixture-'||id,perfil,'google_workspace','vinculada',id,'google-'||id,'{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}',now()-interval '1 day',now() from public.usuario;
        insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
        select replace(id::text,'10000000-','20000000-')::uuid,id,replace(id::text,'10000000-','30000000-')::uuid,1,'google_workspace' from public.usuario;
        grant usage on schema api to authenticated;
        grant execute on function api.cadastro_composicao(jsonb),api.criar_paciente(jsonb),api.listar_pacientes(jsonb) to authenticated;
      `);
      // Simula somente Auth e transporte PostgREST; cada RPC protegida executa SQL real como authenticated.
      vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
        const caminho = new URL(String(input)).pathname;
        const token = new Headers(init?.headers).get('authorization')?.split(' ')[1] ?? '';
        const segmento = token.split('.')[1];
        if (!segmento) throw new Error('Token fictício inválido');
        const claims = JSON.parse(Buffer.from(segmento, 'base64url').toString());
        if (caminho === '/auth/v1/user')
          return Response.json({ id: claims.sub, aud: 'authenticated' });
        if (caminho === '/rest/v1/rpc/consultar_sessao_nativa')
          return Response.json({
            session_id: claims.session_id,
            usuario: {
              id: claims.sub,
              perfil: claims.sub === usuario ? 'administrador' : 'profissional',
              ativo: true,
              versao: 1,
            },
            capacidades: [],
          });
        const nome = caminho.split('/').pop();
        if (!nome || !['cadastro_composicao', 'criar_paciente', 'listar_pacientes'].includes(nome))
          throw new Error('RPC inesperada');
        chamadas.push(nome);
        const parametros = JSON.parse(String(init?.body));
        if (!transportes.has(nome))
          transportes.set(nome, parametros.p_transporte ?? parametros.p_entrada);
        const cliente = await admin.connect();
        try {
          await cliente.query('begin');
          await cliente.query('set local role authenticated');
          await cliente.query("select set_config('request.jwt.claims',$1,true)", [
            JSON.stringify(claims),
          ]);
          const resultado = await cliente.query(`select api.${nome}($1::jsonb) as dados`, [
            JSON.stringify(parametros.p_transporte ?? parametros.p_entrada),
          ]);
          await cliente.query('commit');
          return Response.json(resultado.rows[0].dados);
        } catch (erro) {
          await cliente.query('rollback');
          throw erro;
        } finally {
          cliente.release();
        }
      });
      const deps = {
        fonte,
        pool,
        referencias: {
          keyIdAtiva: 'v1',
          referenciasCifra: { v1: 'ffcmapp.cifra.ativa' },
          referenciaHmac: 'ffcmapp.cifra.hmac',
        },
        keyIdAtestado: 'teste',
        cursor: { abrir: async () => '', emitir: async () => '' },
      };
      const cabecalhos = (id: string, sid: string) => {
        const exp = Math.floor(Date.now() / 1000) + 3600;
        const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, session_id: sid, exp, amr: [{ method: 'oauth' }] })).toString('base64url')}.ZmFrZQ`;
        const dados = {
          access_token: token,
          refresh_token: 'ficticio',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: exp,
          user: { id, aud: 'authenticated' },
        };
        return {
          cookie: `sb-projeto-ficticio-auth-token=base64-${Buffer.from(JSON.stringify(dados)).toString('base64url')}`,
          'x-sessao': sid,
          origin: origem,
          'content-type': 'application/json',
          'x-chave-idempotencia': 'chave_ficticia_123456',
        };
      };
      const reserva = randomUUID();
      const reservar = await comporPacientesNativo(
        new Request(`${origem}/api/cadastro/barreira/reservar`, {
          method: 'POST',
          headers: cabecalhos(usuario, sessao),
          body: JSON.stringify({ epoca: 1, reserva_id: reserva }),
        }),
        'reservar',
        deps,
      );
      expect(reservar.status).toBe(200);
      expect(await reservar.json()).toMatchObject({ dados: { estado: 'aberta' } });
      const criar = await comporPacientesNativo(
        new Request(`${origem}/api/pacientes`, {
          method: 'POST',
          headers: cabecalhos(usuario, sessao),
          body: JSON.stringify({
            entrada: {
              nome: 'Paciente fictício',
              nome_preferencia: 'Nome fictício',
              data_nascimento: '2000-01-01',
              contatos: [{ tipo: 'email', valor: 'paciente.ficticio@exemplo.test' }],
              situacao: 'entrada',
              responsavel_id: usuario,
            },
            reserva_id: reserva,
            geracao_reserva: 1,
          }),
        }),
        'cadastro',
        deps,
      );
      expect(criar.status).toBe(200);
      expect(await criar.json()).toMatchObject({ dados: { nome: 'Paciente fictício' } });
      const segundoId = randomUUID();
      const cofre = await carregarCofreNativo(pool, deps.referencias, 'teste');
      const segundoNome = await cofre.cifra.cifrar('Outra pessoa fictícia', {
        tabela: 'cadastro.paciente',
        registro_id: segundoId,
        campo: 'nome',
        formato: 1,
      });
      await admin.query(
        'insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id) values ($1,$2::jsonb,$3)',
        [segundoId, JSON.stringify(segundoNome), usuario],
      );
      const listar = async (id: string, sid: string, consulta = '') =>
        comporPacientesNativo(
          new Request(`${origem}/api/pacientes${consulta}`, { headers: cabecalhos(id, sid) }),
          'carteira',
          deps,
        );
      const listaAutorizada = await listar(usuario, sessao);
      expect(listaAutorizada.status).toBe(200);
      const paginaCompleta = await listaAutorizada.json();
      expect(paginaCompleta.dados.itens).toHaveLength(2);
      const primeira = await listar(usuario, sessao, '?limite=1');
      expect(primeira.status).toBe(200);
      const pagina1 = (await primeira.json()).dados;
      expect(pagina1.itens).toHaveLength(1);
      expect(pagina1.proximo_cursor).toEqual(expect.any(String));
      const consultaCursor = `?limite=1&cursor=${encodeURIComponent(pagina1.proximo_cursor)}`;
      const cursorOutro = await listar(outro, outraSessao, consultaCursor);
      expect(cursorOutro.status).toBe(503);
      expect(await cursorOutro.json()).not.toHaveProperty('dados');
      const segunda = await listar(usuario, sessao, consultaCursor);
      expect(segunda.status).toBe(200);
      const pagina2 = (await segunda.json()).dados;
      expect(pagina2.itens).toHaveLength(1);
      expect(pagina2.proximo_cursor).toBeNull();
      expect(new Set([...pagina1.itens, ...pagina2.itens].map((item) => item.paciente_id))).toEqual(
        new Set(
          paginaCompleta.dados.itens.map((item: { paciente_id: string }) => item.paciente_id),
        ),
      );
      const listaOutro = await listar(outro, outraSessao);
      expect(listaOutro.status).toBe(200);
      expect(await listaOutro.json()).toMatchObject({
        dados: { itens: [] },
      });
      // O cliente pode chamar as RPCs diretamente após o grant local, sem passar pelo servidor.
      for (const nome of ['cadastro_composicao', 'criar_paciente', 'listar_pacientes']) {
        const transporte = transportes.get(nome);
        expect(transporte).toBeDefined();
        const entrada = transporte?.entrada as Record<string, unknown>;
        const atestado = entrada.atestado as Record<string, unknown>;
        const semAtestado = { ...transporte, entrada: { ...entrada, atestado: undefined } };
        const adulterado = {
          ...transporte,
          entrada: { ...entrada, atestado: { ...atestado, mac: 'A'.repeat(43) } },
        };
        await expect(chamarDireto(nome, semAtestado)).rejects.toMatchObject({ code: '42501' });
        await expect(chamarDireto(nome, adulterado)).rejects.toMatchObject({ code: '42501' });
      }
      await admin.query('update identidade.sessao set encerrada_em=now() where session_id=$1', [
        outraSessao,
      ]);
      const outroRevogado = await listar(outro, outraSessao);
      expect(outroRevogado.status).toBe(403);
      expect(await outroRevogado.json()).toMatchObject({
        erro: { codigo: 'sem_permissao' },
      });
      await admin.query('update identidade.sessao set encerrada_em=now() where session_id=$1', [
        sessao,
      ]);
      // Reutilização direta de transporte assinado não pode superar a revogação.
      const transporteCarteira = transportes.get('listar_pacientes');
      expect(await chamarDireto('listar_pacientes', transporteCarteira)).toMatchObject({
        ok: false,
        erro: { codigo: 'sem_permissao' },
      });
      const usuarioRevogado = await listar(usuario, sessao);
      expect(usuarioRevogado.status).toBe(403);
      expect(await usuarioRevogado.json()).toMatchObject({
        erro: { codigo: 'sem_permissao' },
      });
      expect(chamadas).toEqual([
        'cadastro_composicao',
        'criar_paciente',
        'listar_pacientes',
        'listar_pacientes',
        'listar_pacientes',
        'listar_pacientes',
        'listar_pacientes',
        'listar_pacientes',
      ]);
    } finally {
      vi.unstubAllGlobals();
      await pool.end();
      await admin.end();
    }
  });
});
