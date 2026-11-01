import { lstatSync } from 'node:fs';
import { SignJWT } from 'jose';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { criarExecutorAdmissaoGooglePostgresExperimental } from './admissao-google-postgres-experimental.ts';

const socket = process.env.FFCM_ADMISSAO_SOCKET;
const porta = Number(process.env.FFCM_ADMISSAO_PORTA);
const usuario = '51000000-0000-4000-8000-000000000001';
const outra = '51000000-0000-4000-8000-000000000002';
const sessao = '53000000-0000-4000-8000-000000000001';
const request = '54000000-0000-4000-8000-000000000001';
const issuer = 'https://projetoficticio.supabase.co/auth/v1';
const chave = new Uint8Array(32).fill(9);
describe.skipIf(!socket || !porta)('executor Google com PostgreSQL fixture', () => {
  it('admite concessão, nega replay, JWT divergente, conta sem concessão e acesso direto', async () => {
    if (!socket || !/^\/tmp\/ffcm-admissao\.[A-Za-z0-9]+$/.test(socket) || !Number.isInteger(porta))
      throw new Error('Cluster descartável obrigatório.');
    const dir = lstatSync(socket);
    if (!dir.isDirectory() || dir.uid !== process.getuid?.() || (dir.mode & 0o777) !== 0o700)
      throw new Error('Cluster descartável obrigatório.');
    const opcoes = {
      host: socket,
      port: porta,
      database: 'ffcm_admissao_teste_local',
      connectionTimeoutMillis: 5000,
      query_timeout: 10000,
    };
    const pool = new Pool({ ...opcoes, user: 'ffcm_google_test_login', max: 1 });
    const admin = new Pool({ ...opcoes, user: 'fixture', max: 1 });
    const jwt = (sub: string, sid: string) =>
      new SignJWT({ session_id: sid })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(sub)
        .setIssuer(issuer)
        .setAudience('authenticated')
        .setExpirationTime('5m')
        .sign(chave);
    const pedido = {
      identidade: {
        usuario_id: usuario,
        session_id: sessao,
        metodo: 'google_workspace',
        subject_google: 'subject_fixture',
        email_hmac: 'email_fixture',
        desafio_id: '55000000-0000-4000-8000-000000000001',
        nonce_hash: 'a'.repeat(64),
      },
      request_id: request,
      credencial_refresh: { formato: 1, key_id: 'teste', nonce: 'n', ciphertext: 'c', tag: 't' },
    };
    try {
      const ambiente = await admin.query<{ local: boolean }>(
        "select current_database()='ffcm_admissao_teste_local' and inet_server_addr() is null and current_setting('unix_socket_directories')=$1 and current_setting('data_directory')=$1||'/data' as local",
        [socket],
      );
      expect(ambiente.rows[0]?.local).toBe(true);
      const executar = criarExecutorAdmissaoGooglePostgresExperimental(pool, {
        issuer,
        audience: 'authenticated',
        algoritmosPermitidos: ['HS256'],
        chaveDeVerificacao: chave,
      });
      const token = await jwt(usuario, sessao);
      await expect(
        executar({
          jwt: token,
          provaHash: 'A'.repeat(43),
          pedido: { ...pedido, identidade: { ...pedido.identidade, usuario_id: outra } },
        }),
      ).rejects.toThrow('Admissão Google indisponível.');
      await expect(
        executar({ jwt: 'invalido', provaHash: 'A'.repeat(43), pedido }),
      ).rejects.toThrow('Admissão Google indisponível.');
      const resultado = await executar({ jwt: token, provaHash: 'A'.repeat(43), pedido });
      expect(resultado.ok).toBe(true);
      expect((await executar({ jwt: token, provaHash: 'A'.repeat(43), pedido })).ok).toBe(false);
      const outroId = '53000000-0000-4000-8000-000000000002';
      const negado = await executar({
        jwt: await jwt(outra, outroId),
        provaHash: 'A'.repeat(43),
        pedido: {
          ...pedido,
          identidade: {
            ...pedido.identidade,
            usuario_id: outra,
            session_id: outroId,
            email_hmac: 'nao_concedido',
            subject_google: 'outro_subject',
            desafio_id: '55000000-0000-4000-8000-000000000002',
            nonce_hash: 'b'.repeat(64),
          },
          request_id: '54000000-0000-4000-8000-000000000002',
        },
      });
      expect(negado.ok).toBe(false);
      const cliente = await pool.connect();
      try {
        await cliente.query('begin');
        await cliente.query('set local role ffcmapp_google_executor_fixture');
        expect((await cliente.query('select current_user as papel')).rows[0]?.papel).toBe(
          'ffcmapp_google_executor_fixture',
        );
        await expect(
          cliente.query('select verificador from identidade.prova_saida_fixture'),
        ).rejects.toMatchObject({ code: '42501' });
        await cliente.query('rollback');
        await cliente.query('begin');
        await cliente.query('set local role ffcmapp_google_executor_fixture');
        expect((await cliente.query('select current_user as papel')).rows[0]?.papel).toBe(
          'ffcmapp_google_executor_fixture',
        );
        await expect(
          cliente.query(
            "select identidade.google_primeiro_com_prova_fixture('{}'::jsonb,decode(repeat('aa',32),'hex'))",
          ),
        ).rejects.toMatchObject({ code: '42501' });
        await cliente.query('rollback');
      } finally {
        cliente.release();
      }
    } finally {
      await pool.end();
      await admin.end();
    }
  });
});
