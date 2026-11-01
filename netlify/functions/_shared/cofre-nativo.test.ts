import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { carregarCofreNativo } from './cofre-nativo.ts';

const referencias = {
  keyIdAtiva: 'v1',
  referenciasCifra: { v1: 'ffcmapp.cifra.ativa' },
  referenciaHmac: 'ffcmapp.cifra.hmac',
};

function criarPool() {
  const query = vi.fn(async (sql: string, args?: string[]) => {
    if (sql.includes('ler_chave_cifra_vault'))
      return {
        rows: [
          {
            chave: btoa(
              String.fromCharCode(...new Uint8Array(32).fill(args?.[0]?.endsWith('hmac') ? 2 : 1)),
            ),
          },
        ],
      };
    if (sql.includes('ler_chave_atestado_vault'))
      return { rows: [{ chave: new Uint8Array(32).fill(3) }] };
    return { rows: [] };
  });
  const release = vi.fn();
  const pool = {
    options: { connectionTimeoutMillis: 1000, query_timeout: 1000 },
    connect: async () => ({ query, release }),
  } as unknown as Pool;
  return { pool, query, release };
}

describe('cofre nativo', () => {
  it('compõe cifra e atestador com consultas parametrizadas e papéis restritos', async () => {
    const { pool, query, release } = criarPool();
    const { cifra, atestador } = await carregarCofreNativo(pool, referencias, 'v1');
    expect(typeof cifra.cifrar).toBe('function');
    expect(typeof atestador.atestarEntrada).toBe('function');
    expect(query).toHaveBeenCalledWith('SET LOCAL ROLE ffcmapp_atestado_vault_executor');
    expect(query).toHaveBeenCalledWith(
      'select identidade.ler_chave_atestado_vault($1::text) as chave',
      ['ffcmapp.atestado.v1'],
    );
    expect(release).toHaveBeenCalledWith(false);
  });

  it('recusa configuração ausente ou identificador inválido antes de consultar', async () => {
    const { pool, query } = criarPool();
    await expect(carregarCofreNativo(pool, referencias, '../v1')).rejects.toThrow(
      'Chave criptográfica indisponível.',
    );
    await expect(
      carregarCofreNativo(undefined as unknown as Pool, referencias, 'v1'),
    ).rejects.toThrow('Chave criptográfica indisponível.');
    expect(query).not.toHaveBeenCalled();
  });

  it('descarta conexão e oculta falha ao obter chave de atestado', async () => {
    const { pool, query, release } = criarPool();
    query.mockImplementation(async (sql) => {
      if (sql.includes('ler_chave_atestado_vault')) throw new Error('segredo interno');
      if (sql.includes('ler_chave_cifra_vault'))
        return { rows: [{ chave: btoa(String.fromCharCode(...new Uint8Array(32).fill(1))) }] };
      return { rows: [] };
    });
    await expect(carregarCofreNativo(pool, referencias, 'v1')).rejects.toThrow(
      'Chave criptográfica indisponível.',
    );
    expect(release).toHaveBeenLastCalledWith(true);
  });

  it('protege cursor para usuário e sessão e preserva chave entre cargas', async () => {
    const { pool } = criarPool();
    const identidade = {
      usuarioId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sessaoId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    };
    const valor = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const primeiro = await carregarCofreNativo(pool, referencias, 'v1');
    const segundo = await carregarCofreNativo(pool, referencias, 'v1');
    const token = await primeiro.cursor.emitir(valor, identidade);
    expect(token).not.toContain(valor);
    await expect(segundo.cursor.abrir(token, identidade)).resolves.toBe(valor);
    await expect(
      segundo.cursor.abrir(token, { ...identidade, usuarioId: valor }),
    ).rejects.toThrow();
    await expect(segundo.cursor.abrir(token, { ...identidade, sessaoId: valor })).rejects.toThrow();
  });

  it('recusa material HMAC inválido sem expor detalhes', async () => {
    const { pool, query } = criarPool();
    query.mockImplementation(async (sql, args) => {
      if (sql.includes('ler_chave_cifra_vault'))
        return {
          rows: [{ chave: args?.[0]?.endsWith('hmac') ? 'inválida' : btoa('a'.repeat(32)) }],
        };
      return { rows: [] };
    });
    await expect(carregarCofreNativo(pool, referencias, 'v1')).rejects.toThrow(
      'Chave criptográfica indisponível.',
    );
  });

  it('rejeita cursor anterior após rotação da chave HMAC do cofre', async () => {
    const { pool, query } = criarPool();
    const identidade = {
      usuarioId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sessaoId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    };
    const primeiro = await carregarCofreNativo(pool, referencias, 'v1');
    const token = await primeiro.cursor.emitir('cccccccc-cccc-4ccc-8ccc-cccccccccccc', identidade);
    query.mockImplementation(async (sql, args) => {
      if (sql.includes('ler_chave_cifra_vault'))
        return {
          rows: [
            {
              chave: btoa(
                String.fromCharCode(
                  ...new Uint8Array(32).fill(args?.[0]?.endsWith('hmac') ? 4 : 1),
                ),
              ),
            },
          ],
        };
      if (sql.includes('ler_chave_atestado_vault'))
        return { rows: [{ chave: new Uint8Array(32).fill(3) }] };
      return { rows: [] };
    });
    const rotacionado = await carregarCofreNativo(pool, referencias, 'v1');
    await expect(rotacionado.cursor.abrir(token, identidade)).rejects.toThrow();
  });
});
