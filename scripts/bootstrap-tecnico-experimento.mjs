import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, basename } from 'node:path';

// Experimento exclusivamente para fixture local. Não verifica o provedor e
// não é procedimento de bootstrap de produção ou do Supabase remoto.
try {
  if (process.argv.length !== 2) throw new Error();
  let texto = '';
  for await (const parte of process.stdin) {
    texto += parte;
    if (texto.length > 4096) throw new Error();
  }
  const entrada = JSON.parse(texto);
  if (
    !entrada ||
    typeof entrada !== 'object' ||
    Array.isArray(entrada) ||
    Object.keys(entrada).sort().join(',') !== 'confirmacao,porta,socket' ||
    entrada.confirmacao !== 'CONFIRMO SOMENTE FIXTURE' ||
    typeof entrada.socket !== 'string' ||
    !Number.isInteger(entrada.porta) ||
    entrada.porta < 1024 ||
    entrada.porta > 65535
  )
    throw new Error();
  const socket = realpathSync(entrada.socket);
  if (
    dirname(socket) !== realpathSync(tmpdir()) ||
    !/^ffcm-bootstrap\.[A-Za-z0-9]{6,}$/.test(basename(socket))
  )
    throw new Error();
  const env = { PATH: process.env.PATH ?? '/usr/bin:/bin' };
  Object.assign(env, {
    PGHOST: socket,
    PGPORT: String(entrada.porta),
    PGDATABASE: 'ffcm_bootstrap_teste_local',
    PGCONNECT_TIMEOUT: '3',
  });
  const sql = `
begin;
do $$ begin
  if current_database() <> 'ffcm_bootstrap_teste_local' or inet_server_addr() is not null
     or current_setting('listen_addresses') <> '' then raise exception 'fixture recusada'; end if;
end $$;
select identidade.bootstrap_tecnico_experimento(
  'ffcm-fixture', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
  '{"formato":1,"key_id":"fixture","nonce":"AQ","ciphertext":"AQ","tag":"AQ"}'::jsonb,
  'fixture', '{"formato":1,"key_id":"fixture","nonce":"AQ","ciphertext":"Ag","tag":"AQ"}'::jsonb,
  'fixture', '33333333-3333-4333-8333-333333333333');
rollback;`;
  const resultado = spawnSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], {
    input: sql,
    encoding: 'utf8',
    env,
    timeout: 10_000,
    maxBuffer: 4096,
  });
  const saida = resultado.stdout?.trim();
  if (resultado.status !== 0 || (saida !== 'inicializado' && saida !== 'ja_inicializado'))
    throw new Error();
  process.stdout.write(
    `Simulação revertida: ${saida}. Nenhuma nova alteração confirmada nesta transação.\n`,
  );
} catch {
  process.stderr.write('Bootstrap experimental recusado ou indisponível.\n');
  process.exitCode = 1;
}
