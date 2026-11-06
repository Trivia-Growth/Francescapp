import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import pg from 'pg';
import { executarServicoTeste } from './executar-servico-teste.mjs';
import { prepararBootstrap } from './preparar-bootstrap-tecnico.mjs';

test('serviço autoriza, prepara bootstrap e lote, e revoga com auditoria em PostgreSQL', async () => {
  const dir = mkdtempSync('/tmp/ffcm-servico.');
  const data = join(dir, 'data');
  const env = {
    PATH: process.env.PATH,
    PGHOST: dir,
    PGPORT: '55392',
    PGDATABASE: 'postgres',
    LC_ALL: 'C',
  };
  const run = (cmd, args, input) => {
    const resultado = spawnSync(cmd, args, { env, input, encoding: 'utf8' });
    assert.equal(resultado.status, 0, `${cmd}: ${resultado.stderr}`);
    return resultado.stdout;
  };
  const sql = (input) => run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1'], input);
  const aplicar = (arquivo) => run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', arquivo]);
  let iniciado = false;
  try {
    run('initdb', ['-D', data, '-A', 'trust', '--no-instructions']);
    run('pg_ctl', [
      '-D',
      data,
      '-l',
      join(dir, 'log'),
      '-o',
      `-c listen_addresses='' -k ${dir} -p 55392`,
      'start',
    ]);
    iniciado = true;
    sql(`create role anon; create role authenticated; create role service_role; create role operador_integracao login noinherit;
      create schema auth; create table auth.users(id uuid primary key);
      insert into auth.users values ('51000000-0000-4000-8000-000000000001');`);
    aplicar('supabase/migrations/20261017113000_fundacao_identidade_cadastro.sql');
    sql(
      'alter table public.usuario enable row level security; alter table identidade.concessao_equipe enable row level security; alter table identidade.excecao_tecnica enable row level security; alter table auditoria.evento enable row level security;',
    );
    sql(
      readFileSync('supabase/migrations/20261110120000_admissao_tecnica_nativa.sql', 'utf8').split(
        'grant select (usuario_id',
      )[0],
    );
    aplicar('supabase/migrations/20261110170000_operador_tecnico.sql');
    aplicar('supabase/migrations/20261110180000_bootstrap_tecnico.sql');
    sql(`create role ffcmapp_vault_owner nologin; create role ffcmapp_email_hmac_owner nologin;
      grant usage on schema identidade to ffcmapp_vault_owner, ffcmapp_email_hmac_owner;
      create function identidade.ler_chave_cifra_vault(text) returns text language sql as $$ select encode(decode(repeat('01',32),'hex'),'base64') $$;
      create function identidade.ler_chave_hmac_email_bootstrap() returns text language sql as $$ select encode(decode(repeat('02',32),'hex'),'base64') $$;
      alter function identidade.ler_chave_cifra_vault(text) owner to ffcmapp_vault_owner;
      alter function identidade.ler_chave_hmac_email_bootstrap() owner to ffcmapp_email_hmac_owner;
      revoke all on function identidade.ler_chave_cifra_vault(text), identidade.ler_chave_hmac_email_bootstrap() from public;`);
    aplicar('supabase/migrations/20261109120000_preparar_proveniencia_teste.sql');
    sql('alter table operacao.lote_teste enable row level security;');
    aplicar('supabase/drafts/20261112100000_servico_teste_bootstrap_lote.sql');
    sql(`insert into identidade.bootstrap_tecnico_controle(projeto_ref) values('abcdefghijklmnopqrst');
      insert into identidade.cofre_servico_teste_configuracao(projeto_ref,referencia_cifra) values('abcdefghijklmnopqrst','ffcmapp.cifra.teste');
      insert into auditoria.operador_tecnico(codigo,papel_oid,papel_nome,tipo,expira_em) values('op_0123456789abcdef0123456789abcdef','operador_integracao'::regrole::oid,'operador_integracao','servico_teste',clock_timestamp()+interval '30 minutes');`);
    const pool = (user) =>
      new pg.Pool({
        host: dir,
        port: 55392,
        database: 'postgres',
        user,
        connectionTimeoutMillis: 5000,
        query_timeout: 5000,
      });
    const conexao = { host: 'db.abcdefghijklmnopqrst.supabase.co', usuario: 'fixture' };
    const preparador = {
      projetoRef: 'abcdefghijklmnopqrst',
      projetoRefConfirmado: 'abcdefghijklmnopqrst',
      uuidAuth: '51000000-0000-4000-8000-000000000001',
      concessaoId: '52000000-0000-4000-8000-000000000001',
      requestId: '54000000-0000-4000-8000-000000000001',
      loteId: '53000000-0000-4000-8000-000000000001',
      loteIdentificacao: 'lote ficticio',
      email: 'fixture@example.test',
      token: 'fixture',
      motivo: 'fixture',
      keyId: 'fixture',
      referenciaCifra: 'ffcmapp.cifra.teste',
      arquivo: join(dir, 'envelope'),
      conexao,
      operadorServicoTeste: true,
      confirmacao: 'EXECUTAR BOOTSTRAP abcdefghijklmnopqrst',
    };
    const verificar = async () => {};
    const admin = pool(process.env.USER);
    let resultado;
    try {
      resultado = await executarServicoTeste(
        {
          administradorToken: 'fixture',
          preparador,
          codigo: 'op_0123456789abcdef0123456789abcdef',
          arquivoPosse: join(dir, 'posse'),
        },
        {
          verificarAlvoBootstrap: verificar,
          fetch: async (_url, opcoes) => {
            const { query, parameters } = JSON.parse(opcoes.body);
            try {
              const resposta = await admin.query(query, parameters);
              return { ok: true, json: async () => resposta.rows };
            } catch (erro) {
              return { ok: false, json: async () => ({ erro: erro.message }) };
            }
          },
          prepararBootstrap: (dados) =>
            prepararBootstrap(dados, {
              verificarAlvoBootstrap: verificar,
              criarPoolCofre: () => pool('operador_integracao'),
            }),
        },
      );
    } finally {
      await admin.end();
    }
    assert.equal(resultado, 'inicializado');
    sql(`do $$ begin
      if not exists(select 1 from public.usuario where id='51000000-0000-4000-8000-000000000001' and perfil='administrador')
        or not exists(select 1 from operacao.configuracao_lote_teste where lote_teste_id='53000000-0000-4000-8000-000000000001')
        or (select ativo or posse_ativa is not null from auditoria.operador_tecnico)
        or (select rolcanlogin from pg_roles where rolname='operador_integracao')
        or not exists(select 1 from auditoria.evento where acao='servico_teste.encerrado' and resultado='permitido')
      then raise exception 'fluxo incompleto'; end if; end $$;`);
  } finally {
    if (iniciado) spawnSync('pg_ctl', ['-D', data, 'stop', '-m', 'fast'], { env });
    rmSync(dir, { recursive: true, force: true });
  }
});
