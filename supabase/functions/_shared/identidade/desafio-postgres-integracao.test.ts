import { lstatSync } from 'node:fs';
import { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { criarRepositorioDesafiosPostgresExperimental } from './desafio-postgres-experimental.ts';

const socket = process.env.FFCM_ADMISSAO_SOCKET;
const porta = Number(process.env.FFCM_ADMISSAO_PORTA);

describe.skipIf(!socket || !porta)('desafios PostgreSQL isolado', () => {
  it('confirma registro e exatamente um consumo concorrente visível em nova conexão', async () => {
    if (!socket || !/^\/tmp\/ffcm-admissao\.[A-Za-z0-9]+$/.test(socket) || !Number.isInteger(porta))
      throw new Error('Cluster descartável obrigatório.');
    const diretorio = lstatSync(socket);
    if (
      !diretorio.isDirectory() ||
      diretorio.uid !== process.getuid?.() ||
      (diretorio.mode & 0o777) !== 0o700
    )
      throw new Error('Cluster descartável obrigatório.');
    const opcoes = {
      host: socket,
      port: porta,
      user: 'fixture',
      database: 'ffcm_admissao_teste_local',
      connectionTimeoutMillis: 5000,
      query_timeout: 10000,
    };
    const pool = new Pool({ ...opcoes, max: 1, application_name: 'ffcm_desafio_concorrente' });
    const independente = new Pool({
      ...opcoes,
      max: 1,
      application_name: 'ffcm_desafio_concorrente',
    });
    const bloqueador = new Pool({ ...opcoes, max: 1 });
    try {
      const ambiente = await pool.query<{ local: boolean }>(
        "select current_database()='ffcm_admissao_teste_local' and inet_server_addr() is null and current_setting('unix_socket_directories')=$1 and current_setting('data_directory')=$1 || '/data' as local",
        [socket],
      );
      expect(ambiente.rows[0]?.local).toBe(true);
      const repo = criarRepositorioDesafiosPostgresExperimental(pool);
      const outro = criarRepositorioDesafiosPostgresExperimental(independente);
      const id = crypto.randomUUID();
      const hash = 'a'.repeat(64);
      await repo.registrar(id, hash, Date.now() + 60_000);
      const visivel = await independente.query(
        'select count(*)::int as total from identidade.desafio_login where id=$1',
        [id],
      );
      expect(visivel.rows[0]?.total).toBe(1);
      const primeiroPid = (await pool.query<{ pid: number }>('select pg_backend_pid() as pid'))
        .rows[0]?.pid;
      const segundoPid = (
        await independente.query<{ pid: number }>('select pg_backend_pid() as pid')
      ).rows[0]?.pid;
      expect(primeiroPid).toBeTypeOf('number');
      expect(segundoPid).toBeTypeOf('number');
      expect(primeiroPid).not.toBe(segundoPid);
      const cliente = await bloqueador.connect();
      let respostas: boolean[];
      try {
        await cliente.query('BEGIN');
        await cliente.query('select id from identidade.desafio_login where id=$1 for update', [id]);
        const controlePid = (await cliente.query<{ pid: number }>('select pg_backend_pid() as pid'))
          .rows[0]?.pid;
        expect(controlePid).toBeTypeOf('number');
        const pendentes = Promise.all([repo.consumir(id, hash, 0), outro.consumir(id, hash, 0)]);
        void pendentes.catch(() => undefined);
        // Observa ambos aguardando locks antes de liberar a transação de controle.
        await vi.waitFor(
          async () => {
            const estado = await cliente.query<{ pid: number; bloqueios: number[] }>(
              "select pid, pg_blocking_pids(pid) as bloqueios from pg_stat_activity where pid = any($1::int[]) and wait_event_type='Lock'",
              [[primeiroPid, segundoPid]],
            );
            expect(estado.rows.map((linha) => linha.pid).sort()).toEqual(
              [primeiroPid, segundoPid].sort(),
            );
            expect(
              estado.rows.some((linha) => linha.bloqueios.includes(controlePid as number)),
            ).toBe(true);
            for (const linha of estado.rows) {
              expect(linha.bloqueios.length).toBeGreaterThan(0);
              expect(
                linha.bloqueios.every((pid) =>
                  [controlePid, primeiroPid, segundoPid].includes(pid),
                ),
              ).toBe(true);
            }
          },
          { timeout: 4000, interval: 25 },
        );
        await cliente.query('COMMIT');
        respostas = await pendentes;
      } finally {
        await cliente.query('ROLLBACK');
        cliente.release();
      }
      expect(respostas.sort()).toEqual([false, true]);
      expect(await outro.consumir(id, hash, 0)).toBe(false);
    } finally {
      await pool.end();
      await independente.end();
      await bloqueador.end();
    }
  });
});
