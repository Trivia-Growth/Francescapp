import { readFileSync } from 'node:fs';
import { createConnection, createServer, type Socket } from 'node:net';
import { describe, expect, it } from 'vitest';
import { criarPoolCofre } from '../supabase/functions/_shared/pool-cofre.ts';
import { criarExecutorCofrePostgres } from '../supabase/functions/_shared/cofre-vault-postgres.ts';

if (
  process.env.FFCM_TLS_FIXTURE !== '1' ||
  !process.env.FFCM_TLS_CERT_VALIDO ||
  !process.env.FFCM_TLS_CERT_OUTRO
)
  throw new Error('Fixture TLS descartável obrigatória.');
const valido = readFileSync(process.env.FFCM_TLS_CERT_VALIDO, 'utf8');
const outro = readFileSync(process.env.FFCM_TLS_CERT_OUTRO, 'utf8');
const base = {
  host: 'localhost.',
  porta: 55431,
  banco: 'postgres',
  usuario: 'ffcm_tls_teste',
  senha: 'senha-ficticia',
  certificadoCa: valido,
};
describe('TLS do pool do cofre', () => {
  it('descarta conexão e sanitiza erro se resposta do COMMIT executado for perdida', async () => {
    const sockets: Socket[] = [];
    let bloquearRespostas = false;
    const proxy = createServer((cliente) => {
      const servidor = createConnection({ host: '127.0.0.1', port: 55431 });
      sockets.push(cliente, servidor);
      cliente.on('error', () => {});
      servidor.on('error', () => {});
      cliente.on('data', (dados) => servidor.write(dados));
      servidor.on('data', (dados) => {
        if (!bloquearRespostas) cliente.write(dados);
      });
      cliente.on('close', () => servidor.destroy());
      servidor.on('close', () => cliente.destroy());
    });
    await new Promise<void>((resolve) => proxy.listen(0, '::1', resolve));
    const endereco = proxy.address();
    if (!endereco || typeof endereco === 'string' || endereco.address !== '::1')
      throw new Error('Proxy local indisponível.');
    const pool = criarPoolCofre({ ...base, porta: endereco.port });
    const observador = criarPoolCofre(base);
    pool.on('error', () => {});
    pool.on('connect', (cliente) => {
      cliente.on('error', () => {});
      cliente.query = new Proxy(cliente.query, {
        apply(alvo, contexto, argumentos) {
          if (argumentos[0] === 'COMMIT') bloquearRespostas = true;
          return Reflect.apply(alvo, contexto, argumentos);
        },
      });
    });
    let operacao: Promise<string> | undefined;
    let commitExecutado = false;
    let resultado = '';
    let clientesRestantes = -1;
    let socketsEncerrados = false;
    try {
      const estabelecida = await pool.query(
        'select pg_backend_pid() as pid, ssl from pg_stat_ssl where pid=pg_backend_pid()',
      );
      expect(estabelecida.rows[0]?.ssl).toBe(true);
      const pid = estabelecida.rows[0].pid as number;
      operacao = criarExecutorCofrePostgres(pool)
        .executar('identidade.ler_chave_cifra_vault', { p_referencia: 'ffcmapp.cifra.aes' })
        .then(
          () => 'sucesso',
          (erro: unknown) => (erro instanceof Error ? erro.message : 'erro desconhecido'),
        );
      for (let i = 0; i < 200; i += 1) {
        const estado = await observador.query(
          'select state, query from pg_stat_activity where pid=$1',
          [pid],
        );
        if (
          bloquearRespostas &&
          estado.rows[0]?.state === 'idle' &&
          estado.rows[0]?.query === 'COMMIT'
        ) {
          commitExecutado = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      resultado = await Promise.race([
        operacao,
        new Promise<string>((resolve) => setTimeout(() => resolve('tempo'), 18000)),
      ]);
      clientesRestantes = pool.totalCount;
      for (let i = 0; i < 20 && !sockets.every((socket) => socket.destroyed); i += 1)
        await new Promise((resolve) => setTimeout(resolve, 25));
      socketsEncerrados = sockets.length === 2 && sockets.every((socket) => socket.destroyed);
    } finally {
      for (const socket of sockets) socket.destroy();
      await operacao;
      await pool.end();
      await observador.end();
      await new Promise<void>((resolve) => proxy.close(() => resolve()));
    }
    expect(commitExecutado).toBe(true);
    expect(resultado).toBe('Chave criptográfica indisponível.');
    expect(clientesRestantes).toBe(0);
    expect(socketsEncerrados).toBe(true);
  }, 30000);
  it('encerra conexão TLS e falha fechada quando respostas param após conexão', async () => {
    const sockets: Socket[] = [];
    let bloquearRespostas = false;
    const proxy = createServer((cliente) => {
      const servidor = createConnection({ host: '127.0.0.1', port: 55431 });
      sockets.push(cliente, servidor);
      cliente.on('error', () => {});
      servidor.on('error', () => {});
      cliente.on('data', (dados) => servidor.write(dados));
      servidor.on('data', (dados) => {
        if (!bloquearRespostas) cliente.write(dados);
      });
      cliente.on('close', () => servidor.destroy());
      servidor.on('close', () => cliente.destroy());
    });
    await new Promise<void>((resolve) => proxy.listen(0, '::1', resolve));
    const endereco = proxy.address();
    if (!endereco || typeof endereco === 'string' || endereco.address !== '::1')
      throw new Error('Proxy local indisponível.');
    const pool = criarPoolCofre({ ...base, porta: endereco.port });
    pool.on('error', () => {});
    pool.on('connect', (cliente) => cliente.on('error', () => {}));
    let desfecho = '';
    let clientesRestantes = -1;
    let socketsEncerrados = false;
    let operacao: Promise<string> | undefined;
    try {
      const estabelecida = await pool.query(
        'select ssl from pg_stat_ssl where pid=pg_backend_pid()',
      );
      expect(estabelecida.rows[0]?.ssl).toBe(true);
      bloquearRespostas = true;
      operacao = criarExecutorCofrePostgres(pool)
        .executar('identidade.ler_chave_cifra_vault', { p_referencia: 'ffcmapp.cifra.aes' })
        .then(
          () => 'sucesso',
          (erro: unknown) =>
            erro instanceof Error && erro.message === 'Chave criptográfica indisponível.'
              ? 'rejeitada'
              : 'erro não sanitizado',
        );
      desfecho = await Promise.race([
        operacao,
        new Promise<string>((resolve) => setTimeout(() => resolve('tempo'), 18000)),
      ]);
      clientesRestantes = pool.totalCount;
      for (let i = 0; i < 20 && !sockets.every((socket) => socket.destroyed); i += 1)
        await new Promise((resolve) => setTimeout(resolve, 25));
      socketsEncerrados = sockets.length === 2 && sockets.every((socket) => socket.destroyed);
    } finally {
      for (const socket of sockets) socket.destroy();
      await operacao;
      await pool.end();
      await new Promise<void>((resolve) => proxy.close(() => resolve()));
    }
    expect(desfecho).toBe('rejeitada');
    expect(clientesRestantes).toBe(0);
    expect(socketsEncerrados).toBe(true);
  }, 25000);
  it('conecta com CA e nome corretos', async () => {
    const pool = criarPoolCofre(base);
    try {
      expect(
        (
          await pool.query(
            'select current_user as usuario, ssl from pg_stat_ssl where pid = pg_backend_pid()',
          )
        ).rows[0],
      ).toEqual({ usuario: 'ffcm_tls_teste', ssl: true });
    } finally {
      await pool.end();
    }
  });
  it('recusa CA incorreta', async () => {
    const pool = criarPoolCofre({ ...base, certificadoCa: outro });
    try {
      await expect(pool.connect()).rejects.toMatchObject({ code: 'DEPTH_ZERO_SELF_SIGNED_CERT' });
    } finally {
      await pool.end();
    }
  });
  it('recusa senha incorreta mesmo com TLS válido', async () => {
    const pool = criarPoolCofre({ ...base, senha: 'senha-ficticia-errada' });
    try {
      await expect(pool.query('select 1')).rejects.toMatchObject({ code: '28P01' });
    } finally {
      await pool.end();
    }
  });
  it('recusa nome incorreto mesmo confiando na CA', async () => {
    const pool = criarPoolCofre({ ...base, porta: 55432, certificadoCa: outro });
    try {
      await expect(pool.connect()).rejects.toMatchObject({ code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
    } finally {
      await pool.end();
    }
  });
});
