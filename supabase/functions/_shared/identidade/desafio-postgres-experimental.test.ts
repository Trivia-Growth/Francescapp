import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { criarRepositorioDesafiosPostgresExperimental } from './desafio-postgres-experimental.ts';

const id = '11111111-1111-4111-8111-111111111111';
const hash = 'a'.repeat(64);

describe('repositório PostgreSQL experimental de desafios', () => {
  it.each(['rollback', 'formato', 'entrada'])(
    'rejeita %s sem liberar conexão como íntegra',
    async (caso) => {
      let descartada: boolean | undefined;
      let conexoes = 0;
      const pool = {
        options: { connectionTimeoutMillis: 1000, query_timeout: 1000 },
        async connect() {
          conexoes++;
          return {
            async query(sql: string) {
              if (sql.startsWith('select identidade.consumir'))
                return { rows: [{ consumido: caso === 'formato' ? 'true' : true }] };
              if (sql === 'COMMIT') return { rows: [], command: 'ROLLBACK' };
              return { rows: [] };
            },
            release(destruir: boolean) {
              descartada = destruir;
            },
          };
        },
      } as unknown as Pool;
      const repo = criarRepositorioDesafiosPostgresExperimental(pool);
      await expect(repo.consumir(caso === 'entrada' ? 'invalido' : id, hash, 0)).rejects.toThrow(
        'Desafio indisponível.',
      );
      expect(conexoes).toBe(caso === 'entrada' ? 0 : 1);
      expect(descartada).toBe(caso === 'entrada' ? undefined : true);
    },
  );
  it('registra e consome uma vez, usando parâmetros e liberando somente após commit', async () => {
    const consultas: Array<{ sql: string; valores?: unknown[] }> = [];
    const descartes: boolean[] = [];
    let consumido = false;
    const pool = {
      options: { connectionTimeoutMillis: 1000, query_timeout: 1000 },
      async connect() {
        return {
          async query(sql: string, valores?: unknown[]) {
            consultas.push({ sql, valores });
            if (sql === 'COMMIT') return { rows: [], command: 'COMMIT' };
            if (sql.startsWith('select identidade.registrar')) return { rows: [{}] };
            if (sql.startsWith('select identidade.consumir')) {
              const primeira = !consumido;
              consumido = true;
              return { rows: [{ consumido: primeira }] };
            }
            return { rows: [] };
          },
          release(destruir: boolean) {
            descartes.push(destruir);
          },
        };
      },
    } as unknown as Pool;
    const repo = criarRepositorioDesafiosPostgresExperimental(pool);
    await repo.registrar(id, hash, 2_000_000_000_000);
    expect(await repo.consumir(id, hash, 1)).toBe(true);
    expect(await repo.consumir(id, hash, 1)).toBe(false);
    expect(consultas.filter((c) => c.sql === 'COMMIT')).toHaveLength(3);
    expect(consultas.find((c) => c.sql.startsWith('select identidade.registrar'))?.valores).toEqual(
      [id, hash, '2033-05-18T03:33:20.000Z'],
    );
    expect(descartes).toEqual([false, false, false]);
  });
  it('só confirma consumo após COMMIT e descarta conexão em resultado incerto', async () => {
    const comandos: string[] = [];
    let descartada: boolean | undefined;
    const pool = {
      options: { connectionTimeoutMillis: 1000, query_timeout: 1000 },
      async connect() {
        return {
          async query(sql: string) {
            comandos.push(sql);
            if (sql === 'COMMIT') throw new Error('detalhe interno');
            if (sql.startsWith('select identidade.consumir'))
              return { rows: [{ consumido: true }] };
            return { rows: [] };
          },
          release(destruir: boolean) {
            descartada = destruir;
          },
        };
      },
    } as unknown as Pool;
    const repo = criarRepositorioDesafiosPostgresExperimental(pool);
    await expect(repo.consumir(id, hash, Date.now())).rejects.toThrow('Desafio indisponível.');
    expect(comandos.at(-1)).toBe('COMMIT');
    expect(descartada).toBe(true);
  });
});
