import { lstatSync } from 'node:fs';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { criarCifraAutenticada } from '../../../../supabase/functions/_shared/cifra-autenticada.ts';
import { criarRepositorioDesafiosPostgresExperimental } from '../../../../supabase/functions/_shared/identidade/desafio-postgres-experimental.ts';
import { criarDesafiosGoogle } from '../../../../supabase/functions/_shared/identidade/desafio-google.ts';
import { criarTrocaGoogle } from '../../../../supabase/functions/_shared/identidade/auth-google.ts';
import { criarValidadorGoogleComJwks } from '../../../../supabase/functions/_shared/identidade/google-jwks.ts';
import { criarEntradaGoogleComProva } from '../../../../supabase/functions/_shared/identidade/entrada-google-prova.ts';
import { criarEntradaGoogleAdmissao } from '../../../../supabase/functions/_shared/identidade/entrada-google-admissao.ts';
import { criarExecutorAdmissaoGooglePostgresExperimental } from '../../../../supabase/functions/_shared/identidade/admissao-google-postgres-experimental.ts';
import { criarCifraRefresh } from '../../../../supabase/functions/_shared/sessao/cifra-refresh.ts';
import { validarJwtDeSessao } from '../../../../supabase/functions/_shared/sessao/nucleo.ts';
import { hashProvaGeracao } from '../../../../supabase/functions/_shared/sessao/prova-geracao.ts';
import { criarHandlerDesafio } from './desafio-http.ts';
import { criarLeitorEntradaGoogle } from './entrada-google-http.ts';
import { criarHandlerEntradaGoogle } from './entrada-google-handler.ts';
import { criarTransporteHttpSessaoComProva } from './http-prova.ts';

const socket = process.env.FFCM_ADMISSAO_SOCKET;
const porta = Number(process.env.FFCM_ADMISSAO_PORTA);
describe.skipIf(!socket || !porta)('Google HTTP até PostgreSQL descartável', () => {
  it('admite conta autorizada e nega replay e conta sem concessão', async () => {
    if (!socket || !/^\/tmp\/ffcm-admissao\.[A-Za-z0-9]+$/.test(socket) || !Number.isInteger(porta))
      throw new Error('Cluster descartável obrigatório.');
    const dir = lstatSync(socket);
    const arquivoSocket = lstatSync(`${socket}/.s.PGSQL.${porta}`);
    if (
      !dir.isDirectory() ||
      dir.uid !== process.getuid?.() ||
      (dir.mode & 0o777) !== 0o700 ||
      !arquivoSocket.isSocket() ||
      arquivoSocket.uid !== process.getuid?.() ||
      (arquivoSocket.mode & 0o777) !== 0o700
    )
      throw new Error('Cluster descartável obrigatório.');
    const opcoes = {
      host: socket,
      port: porta,
      database: 'ffcm_admissao_teste_local',
      connectionTimeoutMillis: 5000,
      query_timeout: 10000,
    };
    const controle = new Pool({ ...opcoes, user: 'fixture', max: 2 });
    const banco = new Pool({ ...opcoes, user: 'ffcm_google_test_login', max: 1 });
    try {
      const alvo = await controle.query<{ local: boolean }>(
        "select current_database()='ffcm_admissao_teste_local' and inet_server_addr() is null and current_setting('unix_socket_directories')=$1 and current_setting('data_directory')=$1||'/data' and current_setting('ffcm_fixture.token_servidor',true)=split_part($1,'/',3) as local",
        [socket],
      );
      expect(alvo.rows[0]?.local).toBe(true);
      const role = await banco.connect();
      try {
        await role.query('begin');
        await role.query('set local role ffcmapp_google_executor_fixture');
        expect((await role.query('select current_user as papel')).rows[0]?.papel).toBe(
          'ffcmapp_google_executor_fixture',
        );
        await expect(
          role.query('select * from identidade.prova_saida_fixture'),
        ).rejects.toMatchObject({ code: '42501' });
        await role.query('rollback');
      } finally {
        role.release();
      }
      const origem = 'https://app.example.test';
      const chaveCookie = Buffer.alloc(32, 7).toString('base64url');
      const jwtChave = new Uint8Array(32).fill(9);
      const projeto = 'projetoficticio';
      const issuer = `https://${projeto}.supabase.co/auth/v1`;
      const fonte = {
        FFCM_SUPABASE_URL: `https://${projeto}.supabase.co`,
        FFCM_SUPABASE_ANON_KEY: 'publica-ficticia',
        FFCM_COOKIE_SEALING_KEY: chaveCookie,
        FFCM_ALLOWED_ORIGINS: origem,
      };
      const jwtConfig = {
        issuer,
        audience: 'authenticated',
        algoritmosPermitidos: ['HS256' as const],
        chaveDeVerificacao: jwtChave,
      };
      const par = await generateKeyPair('RS256');
      const jwk = { ...(await exportJWK(par.publicKey)), kid: 'fixture', alg: 'RS256', use: 'sig' };
      const validar = criarValidadorGoogleComJwks(async () =>
        Response.json({ keys: [jwk] }, { headers: { 'cache-control': 'max-age=60' } }),
      );
      const usuario = '51000000-0000-4000-8000-000000000001';
      const outra = '51000000-0000-4000-8000-000000000002';
      const sessao = '53000000-0000-4000-8000-000000000011';
      const outraSessao = '53000000-0000-4000-8000-000000000012';
      let atual = { usuario, sessao, subject: 'subject_fixture' };
      let trocasAuth = 0;
      const trocar = criarTrocaGoogle({
        projeto,
        chavePublica: 'publica-ficticia',
        google: {
          audienciaEsperada: 'cliente-ficticio',
          dominioWorkspace: 'example.test',
          validar,
        },
        configuracaoJwt: jwtConfig,
        buscar: async () => {
          trocasAuth++;
          const accessToken = await new SignJWT({ session_id: atual.sessao })
            .setProtectedHeader({ alg: 'HS256' })
            .setSubject(atual.usuario)
            .setIssuer(issuer)
            .setAudience('authenticated')
            .setExpirationTime('5m')
            .sign(jwtChave);
          return Response.json({
            access_token: accessToken,
            refresh_token: 'refresh-ficticio',
            token_type: 'bearer',
            user: {
              id: atual.usuario,
              identities: [
                {
                  provider: 'google',
                  id: atual.subject,
                  user_id: atual.usuario,
                  identity_data: { sub: atual.subject },
                },
              ],
            },
          });
        },
      });
      const desafios = criarDesafiosGoogle({
        chave: new Uint8Array(32).fill(7),
        ttlSegundos: 120,
        repositorio: criarRepositorioDesafiosPostgresExperimental(controle),
      });
      const emitir = criarHandlerDesafio({ fonte, desafios });
      const cifra = criarCifraRefresh(
        criarCifraAutenticada({
          keyIdAtiva: 'teste',
          chavesDeCifra: { teste: new Uint8Array(32).fill(17) },
          chaveHmac: new Uint8Array(32).fill(19),
        }),
      );
      const entrar = criarEntradaGoogleAdmissao({
        entradaGoogle: criarEntradaGoogleComProva(desafios, trocar),
        cifra,
        hmacEmail: async (email) =>
          email === 'autorizado@example.test' ? 'email_fixture' : 'nao_concedido',
        admitir: criarExecutorAdmissaoGooglePostgresExperimental(banco, jwtConfig),
      });
      // Consulta de fixture somente: não substitui RPC/owner de consulta de sessão.
      const consultar = async (
        entrada: Readonly<{ accessToken: string; prova: string; geracao: number }>,
      ) => {
        const claims = await validarJwtDeSessao(entrada.accessToken, jwtConfig);
        const hash = Buffer.from(await hashProvaGeracao(entrada.prova), 'base64url');
        const cliente = await controle.connect();
        try {
          await cliente.query('begin');
          await cliente.query(
            "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
            [claims.usuarioId, JSON.stringify({ session_id: claims.sessionId })],
          );
          const r = await cliente.query(
            "select u.id,u.perfil,u.versao from public.usuario u join identidade.sessao s on s.usuario_id=u.id join identidade.concessao_equipe c on c.id=s.concessao_id join identidade.prova_saida_fixture p on p.session_id=s.session_id where u.id=current_setting('request.jwt.claim.sub')::uuid and s.session_id=(current_setting('request.jwt.claims')::jsonb->>'session_id')::uuid and u.ativo and c.estado='vinculada' and s.revogada_em is null and p.geracao=$1 and p.verificador=$2",
            [entrada.geracao, hash],
          );
          if (r.rows.length !== 1) throw new Error();
          await cliente.query('commit');
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
          await cliente.query('rollback');
          cliente.release();
        }
      };
      const handler = criarHandlerEntradaGoogle({
        ler: criarLeitorEntradaGoogle(fonte),
        transporte: criarTransporteHttpSessaoComProva(fonte, { configuracaoJwt: jwtConfig }),
        entrar,
        consultar,
      });
      async function tentativa(email: string) {
        const resposta = await emitir(
          new Request(`${origem}/api/sessao/desafio-google`, {
            method: 'POST',
            headers: { origin: origem, 'content-type': 'application/json' },
            body: '{}',
          }),
        );
        expect(resposta.status).toBe(200);
        const dados = (await resposta.json()).dados;
        for (const cookie of resposta.headers.getSetCookie()) {
          expect(cookie).toContain('HttpOnly');
          expect(cookie).toContain('Secure');
          expect(cookie).toContain('SameSite=Lax');
        }
        const cookies = resposta.headers
          .getSetCookie()
          .map((c) => c.split(';')[0])
          .join('; ');
        const idToken = await new SignJWT({
          nonce: dados.nonce_hash,
          email,
          email_verified: true,
          hd: 'example.test',
        })
          .setProtectedHeader({ alg: 'RS256', kid: 'fixture' })
          .setSubject(atual.subject)
          .setIssuer('https://accounts.google.com')
          .setAudience('cliente-ficticio')
          .setIssuedAt()
          .setExpirationTime('5m')
          .sign(par.privateKey);
        return () =>
          handler(
            new Request(`${origem}/api/sessao/google`, {
              method: 'POST',
              headers: {
                origin: origem,
                cookie: cookies,
                'x-csrf': dados.csrf,
                'x-desafio': dados.seletor_desafio,
                'content-type': 'application/json',
              },
              body: JSON.stringify({ desafio_id: dados.desafio_id, credencial: idToken }),
            }),
          );
      }
      const autorizada = await tentativa('autorizado@example.test');
      const ok = await autorizada();
      expect(ok.status).toBe(200);
      expect(ok.headers.getSetCookie()).toHaveLength(4);
      for (const cookie of ok.headers.getSetCookie()) {
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('Secure');
        expect(cookie).toContain('SameSite=Lax');
      }
      expect(await ok.text()).not.toContain('refresh-ficticio');
      expect(trocasAuth).toBe(1);
      const replay = await autorizada();
      expect(replay.status).toBe(401);
      expect(replay.headers.getSetCookie()).toEqual([
        expect.stringContaining('Max-Age=0'),
        expect.stringContaining('Max-Age=0'),
      ]);
      expect(trocasAuth).toBe(1);
      atual = { usuario: outra, sessao: outraSessao, subject: 'outro_subject' };
      const naoAutorizada = await tentativa('naoautorizado@example.test');
      const negada = await naoAutorizada();
      expect(negada.status).toBe(401);
      expect(negada.headers.getSetCookie()).toEqual([
        expect.stringContaining('Max-Age=0'),
        expect.stringContaining('Max-Age=0'),
      ]);
      expect((await negada.json()).erro.codigo).toBe('nao_autenticado');
      expect(trocasAuth).toBe(2);
      const auditoria = await controle.query(
        'select objeto_id::text,resultado from auditoria.evento where objeto_id=any($1::uuid[]) order by objeto_id',
        [[sessao, outraSessao]],
      );
      expect(auditoria.rows).toEqual([
        { objeto_id: sessao, resultado: 'permitido' },
        { objeto_id: outraSessao, resultado: 'negado' },
      ]);
      const outraGravada = await controle.query(
        'select count(*)::int n from identidade.sessao where session_id=$1',
        [outraSessao],
      );
      expect(outraGravada.rows[0]?.n).toBe(0);
    } finally {
      await banco.end();
      await controle.end();
    }
  }, 15000);
});
