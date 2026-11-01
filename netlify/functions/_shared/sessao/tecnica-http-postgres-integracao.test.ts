import { lstatSync } from 'node:fs';
import { SignJWT } from 'jose';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { criarCifraAutenticada } from '../../../../supabase/functions/_shared/cifra-autenticada.ts';
import { criarEntradaTecnicaComProva } from '../../../../supabase/functions/_shared/identidade/entrada-tecnica-prova.ts';
import { criarExecutorAdmissaoPostgres } from '../../../../supabase/functions/_shared/identidade/admissao-postgres.ts';
import { criarCifraRefresh } from '../../../../supabase/functions/_shared/sessao/cifra-refresh.ts';
import { validarJwtDeSessao } from '../../../../supabase/functions/_shared/sessao/nucleo.ts';
import { hashProvaGeracao } from '../../../../supabase/functions/_shared/sessao/prova-geracao.ts';
import { criarHandlerDesafioTecnico } from './desafio-http.ts';
import { criarLeitorEntradaTecnica } from './entrada-tecnica-http.ts';
import { criarHandlerEntradaTecnica } from './entrada-tecnica-handler.ts';
import { criarTransporteHttpSessaoComProva } from './http-prova.ts';

const socket = process.env.FFCM_ADMISSAO_SOCKET;
const porta = Number(process.env.FFCM_ADMISSAO_PORTA);
describe.skipIf(!socket || !porta)('entrada técnica HTTP/PostgreSQL fixture', () => {
  it('admite exceção técnica e nega conta sem concessão e credencial inválida', async () => {
    if (!socket || !/^\/tmp\/ffcm-admissao\.[A-Za-z0-9]+$/.test(socket) || !Number.isInteger(porta))
      throw new Error('Cluster descartável obrigatório.');
    const dir = lstatSync(socket);
    const sock = lstatSync(`${socket}/.s.PGSQL.${porta}`);
    if (
      !dir.isDirectory() ||
      dir.uid !== process.getuid?.() ||
      (dir.mode & 0o777) !== 0o700 ||
      !sock.isSocket() ||
      sock.uid !== process.getuid?.() ||
      (sock.mode & 0o777) !== 0o700
    )
      throw new Error('Cluster descartável obrigatório.');
    const opcoes = {
      host: socket,
      port: porta,
      database: 'ffcm_admissao_teste_local',
      connectionTimeoutMillis: 5000,
      query_timeout: 10000,
    };
    const controle = new Pool({ ...opcoes, user: 'fixture', max: 1 });
    const banco = new Pool({ ...opcoes, user: 'ffcm_admissao_test_login', max: 1 });
    try {
      const ambiente = await controle.query<{ local: boolean }>(
        "select current_database()='ffcm_admissao_teste_local' and inet_server_addr() is null and current_setting('unix_socket_directories')=$1 and current_setting('data_directory')=$1||'/data' and current_setting('ffcm_fixture.token_servidor',true)=split_part($1,'/',3) as local",
        [socket],
      );
      expect(ambiente.rows[0]?.local).toBe(true);
      const papel = await banco.connect();
      try {
        await papel.query('begin');
        await papel.query('set local role ffcmapp_admissao_executor');
        expect((await papel.query('select current_user as nome')).rows[0]?.nome).toBe(
          'ffcmapp_admissao_executor',
        );
        await expect(
          papel.query('select * from identidade.prova_saida_fixture'),
        ).rejects.toMatchObject({ code: '42501' });
        await papel.query('rollback');
      } finally {
        papel.release();
      }
      const origem = 'https://app.example.test';
      const projeto = 'projetoficticio';
      const issuer = `https://${projeto}.supabase.co/auth/v1`;
      const chaveJwt = new Uint8Array(32).fill(9);
      const chaveCookie = Buffer.alloc(32, 7).toString('base64url');
      const fonte = {
        FFCM_SUPABASE_URL: `https://${projeto}.supabase.co`,
        FFCM_SUPABASE_ANON_KEY: 'publica-ficticia',
        FFCM_COOKIE_SEALING_KEY: chaveCookie,
        FFCM_ALLOWED_ORIGINS: origem,
      };
      const configJwt = {
        issuer,
        audience: 'authenticated',
        algoritmosPermitidos: ['HS256' as const],
        chaveDeVerificacao: chaveJwt,
      };
      const usuario = '41000000-0000-4000-8000-000000000002';
      const outro = '41000000-0000-4000-8000-000000000099';
      const sessao = '43000000-0000-4000-8000-000000000031';
      const outraSessao = '43000000-0000-4000-8000-000000000032';
      let atual = { usuario, sessao };
      let invalidar = false;
      const cifra = criarCifraRefresh(
        criarCifraAutenticada({
          keyIdAtiva: 'teste',
          chavesDeCifra: { teste: new Uint8Array(32).fill(17) },
          chaveHmac: new Uint8Array(32).fill(19),
        }),
      );
      const entrar = criarEntradaTecnicaComProva({
        cifra,
        auth: {
          projeto,
          chavePublica: 'publica-ficticia',
          configuracaoJwt: configJwt,
          buscar: async () => {
            if (invalidar)
              return Response.json({ error_code: 'invalid_credentials' }, { status: 400 });
            const accessToken = await new SignJWT({ session_id: atual.sessao })
              .setProtectedHeader({ alg: 'HS256' })
              .setSubject(atual.usuario)
              .setIssuer(issuer)
              .setAudience('authenticated')
              .setExpirationTime('5m')
              .sign(chaveJwt);
            return Response.json({
              access_token: accessToken,
              refresh_token: 'refresh-ficticio',
              token_type: 'bearer',
              user: { id: atual.usuario },
            });
          },
        },
        admitir: criarExecutorAdmissaoPostgres(banco, configJwt),
      });
      // Consulta local de fixture; não é RPC de sessão nem autorização de produção.
      const consultar = async (
        entrada: Readonly<{ accessToken: string; prova: string; geracao: number }>,
      ) => {
        const claims = await validarJwtDeSessao(entrada.accessToken, configJwt);
        const hash = Buffer.from(await hashProvaGeracao(entrada.prova), 'base64url');
        const c = await controle.connect();
        try {
          await c.query('begin');
          await c.query(
            "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
            [claims.usuarioId, JSON.stringify({ session_id: claims.sessionId })],
          );
          const r = await c.query(
            "select u.id,u.perfil,u.versao from public.usuario u join identidade.sessao s on s.usuario_id=u.id join identidade.concessao_equipe g on g.id=s.concessao_id join identidade.prova_saida_fixture p on p.session_id=s.session_id where u.id=current_setting('request.jwt.claim.sub')::uuid and s.session_id=(current_setting('request.jwt.claims')::jsonb->>'session_id')::uuid and u.ativo and g.estado='vinculada' and s.revogada_em is null and p.geracao=$1 and p.verificador=$2",
            [entrada.geracao, hash],
          );
          if (r.rows.length !== 1) throw new Error();
          await c.query('commit');
          return {
            usuario: {
              id: r.rows[0].id,
              perfil: r.rows[0].perfil,
              ativo: true,
              versao: r.rows[0].versao,
            },
            capacidades: [],
          };
        } finally {
          await c.query('rollback');
          c.release();
        }
      };
      const emitir = criarHandlerDesafioTecnico({ fonte });
      const handler = criarHandlerEntradaTecnica({
        ler: criarLeitorEntradaTecnica(fonte),
        entrar,
        consultar,
        transporte: criarTransporteHttpSessaoComProva(fonte, { configuracaoJwt: configJwt }),
      });
      async function tentativa() {
        const desafio = await emitir(
          new Request(`${origem}/api/sessao/desafio-tecnico`, {
            method: 'POST',
            headers: { origin: origem, 'content-type': 'application/json' },
            body: '{}',
          }),
        );
        expect(desafio.status).toBe(200);
        const dados = (await desafio.json()).dados;
        const cookie = desafio.headers
          .getSetCookie()
          .map((v) => v.split(';')[0])
          .join('; ');
        return handler(
          new Request(`${origem}/api/sessao/tecnica`, {
            method: 'POST',
            headers: {
              origin: origem,
              cookie,
              'x-csrf': dados.csrf,
              'x-desafio': dados.seletor_desafio,
              'content-type': 'application/json',
            },
            body: JSON.stringify({ email: 'pessoa@example.test', senha: 'senha-ficticia' }),
          }),
        );
      }
      const ok = await tentativa();
      expect(ok.status).toBe(200);
      const cookies = ok.headers.getSetCookie();
      expect(cookies).toHaveLength(3);
      for (const c of cookies) {
        expect(c).toContain('HttpOnly');
        expect(c).toContain('Secure');
        expect(c).toContain('SameSite=Lax');
      }
      const corpo = await ok.text();
      expect(corpo).not.toContain('senha-ficticia');
      expect(corpo).not.toContain('refresh-ficticio');
      atual = { usuario: outro, sessao: outraSessao };
      const negada = await tentativa();
      expect(negada.status).toBe(401);
      expect((await negada.json()).erro.codigo).toBe('nao_autenticado');
      expect(negada.headers.getSetCookie()).toEqual([expect.stringContaining('Max-Age=0')]);
      invalidar = true;
      const invalida = await tentativa();
      expect(invalida.status).toBe(401);
      expect(invalida.headers.getSetCookie()).toEqual([expect.stringContaining('Max-Age=0')]);
      const auditoria = await controle.query(
        'select objeto_id::text,resultado from auditoria.evento where objeto_id=any($1::uuid[]) order by objeto_id',
        [[sessao, outraSessao]],
      );
      expect(auditoria.rows).toEqual([
        { objeto_id: sessao, resultado: 'permitido' },
        { objeto_id: outraSessao, resultado: 'negado' },
      ]);
    } finally {
      await banco.end();
      await controle.end();
    }
  }, 15000);
});
