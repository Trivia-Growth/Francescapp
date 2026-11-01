import { lstatSync } from 'node:fs';
import { SignJWT } from 'jose';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { criarExecutorAdmissaoPostgres } from './admissao-postgres.ts';

const socket = process.env.FFCM_ADMISSAO_SOCKET;
const porta = Number(process.env.FFCM_ADMISSAO_PORTA);
const usuario = '41000000-0000-4000-8000-000000000002';
const outra = '41000000-0000-4000-8000-000000000099';
const sessao = '43000000-0000-4000-8000-000000000031';
const requestId = '44000000-0000-4000-8000-000000000031';
const issuer = 'https://projetoficticio.supabase.co/auth/v1';
const chave = new Uint8Array(32).fill(9);
const configuracao = {
  issuer,
  audience: 'authenticated',
  algoritmosPermitidos: ['HS256' as const],
  chaveDeVerificacao: chave,
};
const pedido = {
  identidade: { usuario_id: usuario, session_id: sessao, metodo: 'tecnica' as const },
  request_id: requestId,
  credencial_refresh: {
    formato: 1 as const,
    key_id: 'teste',
    nonce: 'n',
    ciphertext: 'c',
    tag: 't',
  },
};

describe.skipIf(!socket || !porta)('admissão PostgreSQL com papel fixture restrito', () => {
  it('valida JWT no executor e nega acesso direto e outra conta sem exceção', async () => {
    if (!socket || !/^\/tmp\/ffcm-admissao\.[A-Za-z0-9]+$/.test(socket) || !Number.isInteger(porta))
      throw new Error('Cluster descartável obrigatório.');
    const dir = lstatSync(socket);
    if (!dir.isDirectory() || dir.uid !== process.getuid?.() || (dir.mode & 0o777) !== 0o700)
      throw new Error('Cluster descartável obrigatório.');
    const pool = new Pool({
      host: socket,
      port: porta,
      user: 'ffcm_admissao_test_login',
      database: 'ffcm_admissao_teste_local',
      max: 1,
      connectionTimeoutMillis: 5000,
      query_timeout: 10000,
    });
    const admin = new Pool({
      host: socket,
      port: porta,
      user: 'fixture',
      database: 'ffcm_admissao_teste_local',
      max: 1,
      connectionTimeoutMillis: 5000,
      query_timeout: 10000,
    });
    const token = (sub: string, sid: string) =>
      new SignJWT({ session_id: sid })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(sub)
        .setIssuer(issuer)
        .setAudience('authenticated')
        .setExpirationTime('5m')
        .sign(chave);
    try {
      const ambiente = await admin.query<{ local: boolean }>(
        "select current_database()='ffcm_admissao_teste_local' and inet_server_addr() is null and current_setting('unix_socket_directories')=$1 and current_setting('data_directory')=$1 || '/data' as local",
        [socket],
      );
      expect(ambiente.rows[0]?.local).toBe(true);
      const cliente = await pool.connect();
      try {
        await cliente.query('BEGIN');
        await cliente.query('SET LOCAL ROLE ffcmapp_admissao_executor');
        expect((await cliente.query('select current_user as papel')).rows[0]?.papel).toBe(
          'ffcmapp_admissao_executor',
        );
        const controle = await cliente.query(
          'select identidade.admitir_tecnica_com_prova($1::jsonb, $2::bytea) as resultado',
          [JSON.stringify(pedido), Buffer.alloc(32)],
        );
        expect(controle.rows[0]?.resultado.ok).toBe(true);
        await cliente.query('ROLLBACK');
        for (const consulta of [
          'select verificador from identidade.prova_saida_fixture',
          "select identidade.admitir_sessao_tecnica('{}'::jsonb)",
        ]) {
          await cliente.query('BEGIN');
          await cliente.query('SET LOCAL ROLE ffcmapp_admissao_executor');
          expect((await cliente.query('select current_user as papel')).rows[0]?.papel).toBe(
            'ffcmapp_admissao_executor',
          );
          await expect(cliente.query(consulta)).rejects.toMatchObject({ code: '42501' });
          await cliente.query('ROLLBACK');
        }
      } finally {
        cliente.release();
      }
      const executar = criarExecutorAdmissaoPostgres(pool, configuracao);
      const jwt = await token(usuario, sessao);
      await expect(
        executar({
          jwt,
          pedido: { ...pedido, identidade: { ...pedido.identidade, usuario_id: outra } },
          provaHash: 'A'.repeat(43),
        }),
      ).rejects.toThrow('Admissão indisponível.');
      await expect(
        executar({ jwt: 'invalido', pedido, provaHash: 'A'.repeat(43) }),
      ).rejects.toThrow('Admissão indisponível.');
      const resultado = await executar({ jwt, pedido, provaHash: 'A'.repeat(43) });
      expect(resultado.ok).toBe(true);
      const outroId = '43000000-0000-4000-8000-000000000032';
      const negada = await executar({
        jwt: await token(outra, outroId),
        pedido: {
          ...pedido,
          identidade: { ...pedido.identidade, usuario_id: outra, session_id: outroId },
          request_id: '44000000-0000-4000-8000-000000000032',
        },
        provaHash: 'A'.repeat(43),
      });
      expect(negada).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
    } finally {
      await pool.end();
      await admin.end();
    }
  });
});
