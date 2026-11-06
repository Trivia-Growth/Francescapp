import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

test('bootstrap técnico restringe operador, alvo, repetição e auditoria', () => {
  const dir = mkdtempSync('/tmp/ffcm-boot.');
  const data = join(dir, 'data');
  const env = {
    PATH: process.env.PATH,
    PGHOST: dir,
    PGPORT: '55391',
    PGDATABASE: 'postgres',
    LC_ALL: 'C',
  };
  const run = (cmd, args, input) => {
    const r = spawnSync(cmd, args, { env, input, encoding: 'utf8' });
    assert.equal(
      r.status,
      0,
      `${cmd}: ${r.stderr} ${cmd === 'pg_ctl' ? readFileSync(join(dir, 'log'), 'utf8') : ''}`,
    );
    return r.stdout;
  };
  const sql = (input) => run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1'], input);
  let started = false;
  try {
    run('initdb', ['-D', data, '-A', 'trust', '--no-instructions']);
    run('pg_ctl', [
      '-D',
      data,
      '-l',
      join(dir, 'log'),
      '-o',
      `-c listen_addresses='' -k ${dir} -p 55391`,
      'start',
    ]);
    started = true;
    sql(`create role anon; create role authenticated; create role service_role; create role operador_fixture login noinherit; create role outro_fixture login;
      create schema auth; create table auth.users(id uuid primary key);
      insert into auth.users values ('51000000-0000-4000-8000-000000000001');`);
    run('psql', [
      '-X',
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      'supabase/migrations/20261017113000_fundacao_identidade_cadastro.sql',
    ]);
    sql(
      'alter table public.usuario enable row level security; alter table identidade.concessao_equipe enable row level security; alter table identidade.excecao_tecnica enable row level security; alter table auditoria.evento enable row level security;',
    );
    sql(
      readFileSync('supabase/migrations/20261110120000_admissao_tecnica_nativa.sql', 'utf8').split(
        'grant select (usuario_id',
      )[0],
    );
    run('psql', [
      '-X',
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      'supabase/migrations/20261110170000_operador_tecnico.sql',
    ]);
    run('psql', [
      '-X',
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      'supabase/migrations/20261110180000_bootstrap_tecnico.sql',
    ]);
    sql(`create role ffcmapp_vault_owner nologin; create role ffcmapp_email_hmac_owner nologin;
      grant usage on schema identidade to ffcmapp_vault_owner, ffcmapp_email_hmac_owner;
      create function identidade.ler_chave_cifra_vault(text) returns text language sql as $$ select 'chave-ficticia'::text $$;
      create function identidade.ler_chave_hmac_email_bootstrap() returns text language sql as $$ select 'hmac-ficticio'::text $$;
      alter function identidade.ler_chave_cifra_vault(text) owner to ffcmapp_vault_owner;
      alter function identidade.ler_chave_hmac_email_bootstrap() owner to ffcmapp_email_hmac_owner;
      revoke all on function identidade.ler_chave_cifra_vault(text), identidade.ler_chave_hmac_email_bootstrap() from public;`);
    run('psql', [
      '-X',
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      'supabase/migrations/20261109120000_preparar_proveniencia_teste.sql',
    ]);
    sql('alter table operacao.lote_teste enable row level security;');
    run('psql', [
      '-X',
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      'supabase/drafts/20261112100000_servico_teste_bootstrap_lote.sql',
    ]);
    sql(`insert into identidade.bootstrap_tecnico_controle(projeto_ref) values ('fixture');
      insert into identidade.cofre_servico_teste_configuracao(projeto_ref,referencia_cifra) values ('fixture','ffcmapp.cifra.teste');
      insert into auditoria.operador_tecnico(codigo,papel_oid,papel_nome,ativo,tipo,expira_em) values ('op_0123456789abcdef0123456789abcdef', 'operador_fixture'::regrole::oid, 'operador_fixture', true, 'servico_teste', clock_timestamp() + interval '1 hour');
      grant usage on schema identidade to operador_fixture;
      grant execute on function identidade.bootstrap_tecnico(text,uuid,uuid,jsonb,text,jsonb,uuid) to operador_fixture;
      grant execute on function identidade.ler_cofre_servico_teste(text,text,uuid,text) to operador_fixture;
      grant usage on schema identidade to outro_fixture;
      grant execute on function identidade.bootstrap_tecnico(text,uuid,uuid,jsonb,text,jsonb,uuid) to outro_fixture;
      grant execute on function identidade.ler_cofre_servico_teste(text,text,uuid,text) to outro_fixture;
      set session authorization outro_fixture;
      do $$ begin
        begin perform identidade.bootstrap_tecnico('fixture',gen_random_uuid(),gen_random_uuid(),'{}','h','{}',gen_random_uuid()); raise exception 'outro login aceito'; exception when insufficient_privilege then null; end;
        begin perform identidade.ler_cofre_servico_teste('fixture','cifra',gen_random_uuid(),'ffcmapp.cifra.teste'); raise exception 'outro login leu cofre'; exception when insufficient_privilege then null; end;
      end $$;
      reset session authorization;
      set session authorization operador_fixture;
      do $$ declare e jsonb := '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'; r text;
      begin
        if identidade.ler_cofre_servico_teste('fixture','cifra',gen_random_uuid(),'ffcmapp.cifra.teste') <> 'chave-ficticia' or identidade.ler_cofre_servico_teste('fixture','hmac',gen_random_uuid(),null) <> 'hmac-ficticio' then raise exception 'cofre indisponível'; end if;
        begin perform identidade.ler_cofre_servico_teste('outro','cifra',gen_random_uuid(),'ffcmapp.cifra.teste'); raise exception 'outro alvo aceito'; exception when no_data_found then null; end;
        begin perform identidade.bootstrap_tecnico('outro','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001',e,'h',e,gen_random_uuid()); raise exception 'alvo aceito'; exception when invalid_parameter_value then null; end;
        begin perform identidade.bootstrap_tecnico('fixture','51000000-0000-4000-8000-000000000002','52000000-0000-4000-8000-000000000001',e,'h',e,gen_random_uuid()); raise exception 'UUID ausente aceito'; exception when foreign_key_violation then null; end;
        r := identidade.bootstrap_tecnico('fixture','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001',e,'h',e,gen_random_uuid());
        if r <> 'inicializado' then raise exception 'falhou'; end if;
        r := identidade.bootstrap_tecnico('fixture','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001',e,'h',e,gen_random_uuid());
        if r <> 'ja_inicializado' then raise exception 'repetição falhou'; end if;
        begin perform identidade.bootstrap_tecnico('fixture','51000000-0000-4000-8000-000000000001',gen_random_uuid(),e,'h',e,gen_random_uuid()); raise exception 'divergência aceita'; exception when invalid_parameter_value then null; end;
      end $$;
      reset session authorization;
      do $$ begin
        if (select count(*) from auditoria.evento where operador_restrito='op_0123456789abcdef0123456789abcdef' and acao='bootstrap.tecnico') <> 2 then raise exception 'auditoria inválida'; end if;
        if (select count(*) from auditoria.evento where operador_restrito='op_0123456789abcdef0123456789abcdef' and acao='bootstrap.cofre_servico') <> 2 then raise exception 'auditoria do cofre inválida'; end if;
        if has_function_privilege('anon','identidade.bootstrap_tecnico(text,uuid,uuid,jsonb,text,jsonb,uuid)','execute') or has_function_privilege('service_role','identidade.bootstrap_tecnico(text,uuid,uuid,jsonb,text,jsonb,uuid)','execute') then raise exception 'bootstrap exposto'; end if;
        if has_function_privilege('anon','identidade.ler_cofre_servico_teste(text,text,uuid,text)','execute') or has_function_privilege('service_role','identidade.ler_cofre_servico_teste(text,text,uuid,text)','execute') then raise exception 'cofre de serviço exposto'; end if;
      end $$;
      update auditoria.operador_tecnico set expira_em=clock_timestamp() - interval '1 second';
      set session authorization operador_fixture;
      do $$ begin
        begin perform identidade.bootstrap_tecnico('fixture',gen_random_uuid(),gen_random_uuid(),'{}','h','{}',gen_random_uuid()); raise exception 'operador expirado aceito'; exception when insufficient_privilege then null; end;
        begin perform identidade.ler_cofre_servico_teste('fixture','cifra',gen_random_uuid(),'ffcmapp.cifra.teste'); raise exception 'operador expirado leu cofre'; exception when insufficient_privilege then null; end;
      end $$;
      reset session authorization;
      update auditoria.operador_tecnico set ativo=false, expira_em=clock_timestamp() + interval '1 hour';
      set session authorization operador_fixture;
      do $$ begin
        begin perform identidade.bootstrap_tecnico('fixture',gen_random_uuid(),gen_random_uuid(),'{}','h','{}',gen_random_uuid()); raise exception 'operador inativo aceito'; exception when insufficient_privilege then null; end;
        begin perform identidade.ler_cofre_servico_teste('fixture','hmac',gen_random_uuid(),null); raise exception 'operador inativo leu cofre'; exception when insufficient_privilege then null; end;
      end $$;`);
    sql(`update auditoria.operador_tecnico set ativo=true;
      grant execute on function identidade.bootstrap_lote_servico(text,uuid,uuid,jsonb,text,jsonb,uuid,uuid,text) to operador_fixture;
      set session authorization operador_fixture;
      do $$ declare e jsonb := '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'; r text;
      begin
        r := identidade.bootstrap_lote_servico('fixture','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001',e,'h',e,gen_random_uuid(),'53000000-0000-4000-8000-000000000001','lote ficticio');
        if r <> 'ja_inicializado' then raise exception 'resultado inesperado'; end if;
        begin perform identidade.bootstrap_lote_servico('fixture','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001',e,'h',e,gen_random_uuid(),gen_random_uuid(),'outro'); raise exception 'lote divergente aceito'; exception when raise_exception then if sqlerrm='lote divergente aceito' then raise; end if; end;
      end $$;
      reset session authorization;
      do $$ begin if (select count(*) from operacao.lote_teste)<>1 or (select count(*) from auditoria.evento where acao='servico_teste.lote')<>1 then raise exception 'lote ou auditoria inválido'; end if; end $$;`);
    sql(`update identidade.bootstrap_tecnico_controle set projeto_ref='abcdefghijklmnopqrst';
      update identidade.cofre_servico_teste_configuracao set projeto_ref='abcdefghijklmnopqrst';
      update auditoria.operador_tecnico set ativo=false, expira_em=clock_timestamp()+interval '30 minutes';
      revoke usage on schema identidade from operador_fixture;
      revoke execute on function identidade.bootstrap_tecnico(text,uuid,uuid,jsonb,text,jsonb,uuid), identidade.bootstrap_lote_servico(text,uuid,uuid,jsonb,text,jsonb,uuid,uuid,text), identidade.ler_cofre_servico_teste(text,text,uuid,text) from operador_fixture;`);
    const operar = (acao, resultado) =>
      run('psql', [
        '-X',
        '-q',
        '-v',
        'ON_ERROR_STOP=1',
        '-v',
        'projeto=abcdefghijklmnopqrst',
        '-v',
        'codigo=op_0123456789abcdef0123456789abcdef',
        '-v',
        `acao=${acao}`,
        '-v',
        'request=54000000-0000-4000-8000-000000000001',
        '-v',
        `posse=${'a'.repeat(64)}`,
        '-v',
        `resultado=${resultado}`,
        '-f',
        'supabase/drafts/operar_servico_teste.sql',
      ]);
    sql('grant usage on schema identidade to operador_fixture;');
    const comPrivilegio = spawnSync(
      'psql',
      [
        '-X',
        '-q',
        '-v',
        'ON_ERROR_STOP=1',
        '-v',
        'projeto=abcdefghijklmnopqrst',
        '-v',
        'codigo=op_0123456789abcdef0123456789abcdef',
        '-v',
        'acao=autorizar',
        '-v',
        'request=54000000-0000-4000-8000-000000000001',
        '-v',
        `posse=${'a'.repeat(64)}`,
        '-v',
        'resultado=permitido',
        '-f',
        'supabase/drafts/operar_servico_teste.sql',
      ],
      { env, encoding: 'utf8' },
    );
    assert.notEqual(comPrivilegio.status, 0);
    assert.match(comPrivilegio.stderr, /AUTORIZACAO_INVALIDA/);
    sql('revoke usage on schema identidade from operador_fixture;');
    operar('autorizar', 'permitido');
    sql(
      `do $$ begin if not (select ativo from auditoria.operador_tecnico) or not has_function_privilege('operador_fixture','identidade.bootstrap_lote_servico(text,uuid,uuid,jsonb,text,jsonb,uuid,uuid,text)','execute') or (select count(*) from auditoria.evento where acao='servico_teste.autorizado')<>1 then raise exception 'autorização incompleta'; end if; end $$;`,
    );
    const posseErrada = spawnSync(
      'psql',
      [
        '-X',
        '-q',
        '-v',
        'ON_ERROR_STOP=1',
        '-v',
        'projeto=abcdefghijklmnopqrst',
        '-v',
        'codigo=op_0123456789abcdef0123456789abcdef',
        '-v',
        'acao=encerrar',
        '-v',
        'request=54000000-0000-4000-8000-000000000001',
        '-v',
        `posse=${'b'.repeat(64)}`,
        '-v',
        'resultado=indeterminado',
        '-f',
        'supabase/drafts/operar_servico_teste.sql',
      ],
      { env, encoding: 'utf8' },
    );
    assert.notEqual(posseErrada.status, 0);
    sql(
      `do $$ begin if not (select ativo from auditoria.operador_tecnico) or not (select rolcanlogin from pg_roles where rolname='operador_fixture') then raise exception 'posse errada interrompeu serviço'; end if; end $$;`,
    );
    const sessao = spawn(
      'psql',
      [
        '-X',
        '-q',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        "begin; select identidade.ler_cofre_servico_teste('abcdefghijklmnopqrst','hmac',gen_random_uuid(),null); select pg_sleep(60)",
      ],
      {
        env: { ...env, PGUSER: 'operador_fixture', PGAPPNAME: 'fixture_servico' },
        stdio: 'ignore',
      },
    );
    try {
      let aberta = false;
      for (let tentativa = 0; tentativa < 100 && !aberta; tentativa++) {
        aberta = sql(
          "select count(*) from pg_stat_activity where application_name='fixture_servico' and wait_event='PgSleep';",
        ).includes('1');
      }
      assert.ok(aberta, 'sessão de serviço não iniciou');
      // Sem eventos de bootstrap e lote no mesmo request, não registrar sucesso.
      operar('encerrar', 'permitido');
    } finally {
      sessao.kill();
    }
    sql(
      `do $$ begin if (select ativo from auditoria.operador_tecnico) or (select rolcanlogin from pg_roles where rolname='operador_fixture') or has_function_privilege('operador_fixture','identidade.bootstrap_lote_servico(text,uuid,uuid,jsonb,text,jsonb,uuid,uuid,text)','execute') or not exists(select 1 from auditoria.evento where acao='servico_teste.encerrado_indeterminado' and resultado='falhou') then raise exception 'encerramento incompleto'; end if; end $$;`,
    );
  } finally {
    if (started) spawnSync('pg_ctl', ['-D', data, 'stop', '-m', 'fast'], { env });
    rmSync(dir, { recursive: true, force: true });
  }
});
