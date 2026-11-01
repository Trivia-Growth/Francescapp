import { lstatSync } from 'node:fs';
import { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

const socket = process.env.FFCM_ADMISSAO_SOCKET;
const porta = Number(process.env.FFCM_ADMISSAO_PORTA);
describe.skipIf(!socket || !porta)('vínculo Google experimental concorrente', () => {
  it('não admite desafio expirado durante conflito de sessão', async () => {
    if (!socket || !/^\/tmp\/ffcm-admissao\.[A-Za-z0-9]+$/.test(socket) || !Number.isInteger(porta))
      throw new Error('Cluster descartável obrigatório.');
    const dir = lstatSync(socket);
    if (!dir.isDirectory() || dir.uid !== process.getuid?.() || (dir.mode & 0o777) !== 0o700)
      throw new Error('Cluster descartável obrigatório.');
    const pool = new Pool({
      host: socket,
      port: porta,
      user: 'fixture',
      database: 'ffcm_admissao_teste_local',
      max: 3,
      connectionTimeoutMillis: 5000,
      query_timeout: 10000,
    });
    const u = '41000000-0000-4000-8000-000000000002';
    const c = '42000000-0000-4000-8000-000000000002';
    const desafio = crypto.randomUUID();
    const sessao = crypto.randomUUID();
    const request = crypto.randomUUID();
    const controle = await pool.connect();
    const concorrente = await pool.connect();
    const observador = await pool.connect();
    try {
      const ambiente = await observador.query<{ local: boolean }>(
        "select current_database()='ffcm_admissao_teste_local' and inet_server_addr() is null and current_setting('unix_socket_directories')=$1 and current_setting('data_directory')=$1 || '/data' as local",
        [socket],
      );
      expect(ambiente.rows[0]?.local).toBe(true);
      await observador.query(
        "insert into identidade.desafio_login(id,nonce_hash,criado_em,expira_em,consumido_em) values($1,repeat('a',64),clock_timestamp()-interval '1 second',clock_timestamp()+interval '2 seconds',clock_timestamp())",
        [desafio],
      );
      await controle.query('begin');
      const pidControle = (await controle.query<{ pid: number }>('select pg_backend_pid() as pid'))
        .rows[0]?.pid;
      const pidConcorrente = (
        await concorrente.query<{ pid: number }>('select pg_backend_pid() as pid')
      ).rows[0]?.pid;
      // Fixture superusuário isola conflito de índice de sessão sem locks das FKs.
      await controle.query("set local session_replication_role='replica'");
      await controle.query(
        "insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo) values($1,$2,$3,1,'google_workspace')",
        [sessao, u, c],
      );
      const pendente = concorrente.query(
        "select identidade.google_vinculo_fixture($1,repeat('a',64),$2,'fixture-2',$3,$4)",
        [desafio, u, sessao, request],
      );
      void pendente.catch(() => undefined);
      await vi.waitFor(
        async () => {
          const estado = await observador.query<{ bloqueado: boolean }>(
            'select $1::int = any(pg_blocking_pids($2::int)) as bloqueado',
            [pidControle, pidConcorrente],
          );
          expect(estado.rows[0]?.bloqueado).toBe(true);
        },
        { timeout: 1500, interval: 20 },
      );
      await expect(
        observador.query('select 1 from public.usuario where id=$1 for update nowait', [u]),
      ).rejects.toMatchObject({ code: '55P03' });
      await vi.waitFor(
        async () => {
          const estado = await observador.query<{ expirado: boolean }>(
            'select expira_em<=clock_timestamp() as expirado from identidade.desafio_login where id=$1',
            [desafio],
          );
          expect(estado.rows[0]?.expirado).toBe(true);
        },
        { timeout: 5000, interval: 25 },
      );
      await controle.query('rollback');
      await expect(pendente).rejects.toMatchObject({ message: 'DESAFIO_EXPIROU' });
      const efeitos = await observador.query<{ total: number }>(
        'select (select count(*) from identidade.sessao where session_id=$1)+(select count(*) from identidade.google_vinculo_fixture_uso where desafio_id=$2)+(select count(*) from auditoria.evento where request_id=$3) as total',
        [sessao, desafio, request],
      );
      expect(Number(efeitos.rows[0]?.total)).toBe(0);
      const desafioNormal = crypto.randomUUID();
      const sessaoNormal = crypto.randomUUID();
      const requestNormal = crypto.randomUUID();
      await observador.query(
        "insert into identidade.desafio_login(id,nonce_hash,criado_em,expira_em,consumido_em) values($1,repeat('b',64),clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 minute',clock_timestamp())",
        [desafioNormal],
      );
      const normal = await observador.query<{ ok: boolean }>(
        "select identidade.google_vinculo_fixture($1,repeat('b',64),$2,'fixture-2',$3,$4) as ok",
        [desafioNormal, u, sessaoNormal, requestNormal],
      );
      expect(normal.rows[0]?.ok).toBe(true);
    } finally {
      await controle.query('rollback');
      controle.release();
      concorrente.release();
      observador.release();
      await pool.end();
    }
  }, 10000);
});
