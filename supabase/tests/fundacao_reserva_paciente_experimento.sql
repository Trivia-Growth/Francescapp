-- Somente clone PostgreSQL descartável com fixtures existentes; sem Auth/Vault reais.
\set ON_ERROR_STOP on
begin;
do $$ begin
 if current_database()<>'ffcm_reserva_paciente_fixture' or inet_server_addr() is not null
  or current_setting('unix_socket_directories') !~ '^/tmp/ffcm-admissao[.][A-Za-z0-9]+$'
  or current_setting('data_directory')<>current_setting('unix_socket_directories')||'/data' then raise exception 'clone isolado obrigatório'; end if;
end $$;
\ir ../drafts/20261103090000_reserva_cadastro_experimento.sql
\ir ../drafts/20261103100000_reserva_autorizada_experimento.sql
\ir ../drafts/20261103110000_reserva_capacidade_experimento.sql
\ir ../drafts/20261103120000_reserva_paciente_experimento.sql
\ir ../drafts/20261103140000_prova_owner_experimento.sql
\ir ../drafts/20261103150000_atestado_owner_experimento.sql
\ir ../drafts/20261103160000_autoridade_owner_experimento.sql
\ir ../drafts/20261103170000_cadastro_owner_experimento.sql
do $$ begin
 if not exists(select 1 from pg_proc p join pg_roles r on r.oid=p.proowner
   where p.oid='saida_fixture.autorizar_prova(bigint,bytea)'::regprocedure
     and p.prosecdef and r.rolname='ffcm_prova_owner_local' and not r.rolsuper and not r.rolbypassrls and not r.rolcanlogin) then
  raise exception 'owner da prova não isolado';
 end if;
 if not exists(select 1 from pg_proc p join pg_roles r on r.oid=p.proowner
   where p.oid='experimento_atestado.verificar_com_chave_interna(text,text,jsonb,jsonb,text)'::regprocedure
     and p.prosecdef and r.rolname='ffcm_atestado_chave_owner_local' and not r.rolsuper and not r.rolbypassrls and not r.rolcanlogin) then
  raise exception 'owner da chave não isolado';
 end if;
 if exists(select 1 from pg_proc p join pg_roles r on r.oid=p.proowner
   where p.oid in ('identidade.sessao_atual_valida()'::regprocedure,
     'experimento_atestado.verificar_criar_paciente(text,text,jsonb,jsonb,text)'::regprocedure,
     'experimento_atestado.criar_paciente(jsonb)'::regprocedure,
     'reserva_fixture.criar_paciente_reservado_fixture(jsonb,bigint,bytea)'::regprocedure)
     and (r.rolsuper or r.rolbypassrls or r.rolcanlogin)) then
  raise exception 'owner de sessão ou autoridade privilegiado';
 end if;
end $$;
-- Grant restrito a este teste, revertido ao fim; não autoriza uso em runtime.
create role ffcm_reserva_executor_fixture nologin;
grant usage on schema reserva_fixture, experimento_atestado to ffcm_reserva_executor_fixture;
grant execute on function reserva_fixture.criar_paciente_reservado_fixture(jsonb,bigint,bytea) to ffcm_reserva_executor_fixture;
do $$ begin
 if has_function_privilege('ffcm_reserva_executor_fixture','experimento_atestado.criar_paciente(jsonb)','execute')
 or has_function_privilege('ffcm_reserva_executor_fixture','experimento_atestado.criar_paciente_com_prova_fixture(jsonb,bigint,bytea)','execute')
 or pg_has_role('ffcm_reserva_executor_fixture','ffcm_prova_owner_local','member')
 or pg_has_role('anon','ffcm_prova_owner_local','member')
 or pg_has_role('authenticated','ffcm_prova_owner_local','member')
 or pg_has_role('ffcm_reserva_executor_fixture','ffcm_cadastro_owner_local','member')
 or has_table_privilege('ffcm_reserva_executor_fixture','cadastro.paciente','select')
 or has_table_privilege('ffcm_reserva_executor_fixture','cadastro.paciente','insert') then
  raise exception 'executor pode contornar reserva';
 end if;
 if has_function_privilege('ffcm_reserva_executor_fixture','experimento_atestado.ler_chave_interna(text)','execute')
 or has_function_privilege('ffcm_reserva_executor_fixture','experimento_atestado.assinar_fixture(jsonb)','execute')
 or has_function_privilege('ffcm_reserva_executor_fixture','identidade.sessao_atual_valida()','execute')
 or has_function_privilege('ffcm_reserva_executor_fixture','experimento_atestado.verificar_criar_paciente(text,text,jsonb,jsonb,text)','execute')
 or pg_has_role('ffcm_reserva_executor_fixture','ffcm_atestado_chave_owner_local','member') then
  raise exception 'executor pode obter chave';
 end if;
end $$;
do $$
declare papel text; owner_local text; tabela regclass; coluna text; privilegio text; helper regprocedure;
begin
 foreach papel in array array['ffcm_reserva_executor_fixture','anon','authenticated'] loop
  foreach owner_local in array array['ffcm_prova_owner_local','ffcm_atestado_chave_owner_local','ffcm_autoridade_owner_local','ffcm_cadastro_owner_local'] loop
   if pg_has_role(papel,owner_local,'member') then raise exception 'membership transitiva indevida: % -> %',papel,owner_local; end if;
  end loop;
  foreach tabela in array array['reserva_fixture.reserva'::regclass,'reserva_fixture.ator'::regclass,
   'reserva_fixture.capacidade_fixture'::regclass,'reserva_fixture.efeito'::regclass,
   'cadastro.paciente'::regclass,'operacao.requisicao'::regclass,'auditoria.evento'::regclass] loop
   foreach privilegio in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES'] loop
    if has_table_privilege(papel,tabela,privilegio) then raise exception 'privilégio direto indevido: % % %',papel,tabela,privilegio; end if;
   end loop;
   for coluna in select attname from pg_attribute where attrelid=tabela and attnum>0 and not attisdropped loop
    foreach privilegio in array array['SELECT','INSERT','UPDATE','REFERENCES'] loop
     if has_column_privilege(papel,tabela,coluna,privilegio) then raise exception 'privilégio de coluna indevido: % %.% %',papel,tabela,coluna,privilegio; end if;
    end loop;
   end loop;
  end loop;
  foreach helper in array array['reserva_fixture.abrir(uuid,bigint,uuid)'::regprocedure,
   'reserva_fixture.confirmar(uuid,bigint,uuid)'::regprocedure,'reserva_fixture.fechar(uuid,bigint,uuid)'::regprocedure,
   'reserva_fixture.capacidade_vigente_fixture(bigint,bigint,bytea)'::regprocedure,
   'reserva_fixture.vincular_capacidade_fixture(bigint,bigint,bytea)'::regprocedure,
   'experimento_atestado.criar_paciente(jsonb)'::regprocedure,
   'experimento_atestado.criar_paciente_com_prova_fixture(jsonb,bigint,bytea)'::regprocedure,
   'experimento_atestado.assinar_fixture(jsonb)'::regprocedure,
   'experimento_atestado.ler_chave_interna(text)'::regprocedure,
   'experimento_atestado.verificar_criar_paciente(text,text,jsonb,jsonb,text)'::regprocedure,
   'experimento_atestado.verificar_com_chave_interna(text,text,jsonb,jsonb,text)'::regprocedure,
   'saida_fixture.autorizar_prova(bigint,bytea)'::regprocedure,
   'identidade.sessao_atual_valida()'::regprocedure] loop
   if has_function_privilege(papel,helper,'EXECUTE') then raise exception 'helper acessível: % %',papel,helper; end if;
  end loop;
 end loop;
end $$;
set local role ffcm_reserva_executor_fixture;
do $$ begin
 begin perform id from reserva_fixture.reserva; raise exception 'executor leu reserva diretamente';
 exception when insufficient_privilege then null; end;
 begin perform reserva_id from reserva_fixture.efeito; raise exception 'executor leu efeitos diretamente';
 exception when insufficient_privilege then null; end;
 begin perform reserva_fixture.abrir(null,1,null); raise exception 'executor acessou abertura direta';
 exception when insufficient_privilege then null; end;
 begin perform reserva_fixture.capacidade_vigente_fixture(1,1,''::bytea); raise exception 'executor acessou capacidade';
 exception when insufficient_privilege then null; end;
 begin perform experimento_atestado.assinar_fixture('{}'::jsonb); raise exception 'executor acessou assinador fixture';
 exception when insufficient_privilege then null; end;
 begin perform experimento_atestado.criar_paciente('{}'::jsonb); raise exception 'acesso direto permitido';
 exception when insufficient_privilege then null; end;
 begin perform experimento_atestado.criar_paciente_com_prova_fixture('{}'::jsonb,1,''::bytea); raise exception 'acesso por prova sem reserva permitido';
 exception when insufficient_privilege then null; end;
 if reserva_fixture.criar_paciente_reservado_fixture('{"entrada":{"request_id":"b1000000-0000-4000-8000-000000000021","reserva_id":"b2000000-0000-4000-8000-000000000021","geracao_reserva":1}}'::jsonb,1,''::bytea)->>'ok' is distinct from 'false' then
  raise exception 'wrapper aceitou prova ausente';
 end if;
end $$;
reset role;
insert into reserva_fixture.ator(id) values('61000000-0000-4000-8000-000000000001');
set local role ffcm_prova_owner_local;
do $$ declare stmt text; begin
 begin perform envelope from identidade.credencial_sessao; raise exception 'credencial exposta ao owner de prova';
 exception when insufficient_privilege then null; end;
 foreach stmt in array array[
  'update public.usuario set id=id where id=''61000000-0000-4000-8000-000000000001''',
  'update identidade.concessao_equipe set id=id where usuario_id=''61000000-0000-4000-8000-000000000001''',
  'update identidade.sessao set session_id=session_id where session_id=''63000000-0000-4000-8000-000000000001''',
  'update identidade.credencial_sessao set session_id=session_id where session_id=''63000000-0000-4000-8000-000000000001''',
  'update identidade.prova_saida_fixture set session_id=session_id where session_id=''63000000-0000-4000-8000-000000000001'''
 ] loop
  begin execute stmt; raise exception 'owner de prova pôde alterar tabela: %',stmt;
  exception when insufficient_privilege then null; end;
 end loop;
end $$;
reset role;
select set_config('ffcm_fixture.usuario','61000000-0000-4000-8000-000000000001',true);
select set_config('ffcm_fixture.sessao','63000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"session_id":"63000000-0000-4000-8000-000000000001"}',true);
create function pg_temp.rejeitar_auditoria_fixture() returns trigger language plpgsql as $$
begin
 if current_setting('ffcm_fixture.rejeitar_auditoria',true)='sim' then return null; end if;
 return new;
end $$;
create trigger rejeitar_auditoria_fixture before insert on auditoria.evento for each row execute function pg_temp.rejeitar_auditoria_fixture();
create function pg_temp.suprimir_efeito_fixture() returns trigger language plpgsql as $$
begin
 if current_setting('ffcm_fixture.suprimir_efeito',true)='sim' then return null; end if;
 return new;
end $$;
create trigger suprimir_efeito_fixture before insert on reserva_fixture.efeito for each row execute function pg_temp.suprimir_efeito_fixture();
create function pg_temp.suprimir_confirmacao_fixture() returns trigger language plpgsql as $$
begin
 if current_setting('ffcm_fixture.suprimir_confirmacao',true)='sim' then return null; end if;
 return new;
end $$;
create trigger suprimir_confirmacao_fixture before update on reserva_fixture.reserva for each row execute function pg_temp.suprimir_confirmacao_fixture();
do $$
declare a uuid:='61000000-0000-4000-8000-000000000001'; v_reserva_fixture uuid:='b2000000-0000-4000-8000-000000000021';
 e jsonb:='{"request_id":"b1000000-0000-4000-8000-000000000021","auditoria_id":"b3000000-0000-4000-8000-000000000021","paciente_id":"b4000000-0000-4000-8000-000000000021","reserva_id":"b2000000-0000-4000-8000-000000000021","geracao_reserva":1,"chave_idempotencia":"fixture-reserva-paciente","digest_idempotencia":"digest-ficticio","nome":{"formato":1,"key_id":"v1","nonce":"fake","ciphertext":"fake","tag":"fake"},"aad":{"nome":{"tabela":"cadastro.paciente","registro_id":"b4000000-0000-4000-8000-000000000021","campo":"nome","formato":1}}}'; t jsonb; r jsonb;
begin
 t:=experimento_atestado.assinar_fixture(e);
 execute 'set local role ffcm_reserva_executor_fixture';
 r:=reserva_fixture.criar_paciente_reservado_fixture(t,1,decode(repeat('01',32),'hex'));
 execute 'reset role';
 if r->>'ok' is distinct from 'false' or exists(select 1 from cadastro.paciente where id='b4000000-0000-4000-8000-000000000021') then raise exception 'criação sem capacidade permitida'; end if;
 perform set_config('ffcm_fixture.rejeitar_auditoria','sim',true);
 begin
  execute 'set local role ffcm_reserva_executor_fixture';
  r:=reserva_fixture.criar_paciente_reservado_fixture(t,1,decode(repeat('01',32),'hex'));
  raise exception 'negativa sem auditoria aceita';
 exception when sqlstate 'P0001' then
  if sqlerrm='negativa sem auditoria aceita' then raise; end if;
 end;
 perform set_config('ffcm_fixture.rejeitar_auditoria','nao',true);
 if reserva_fixture.vincular_capacidade_fixture(1,1,decode(repeat('01',32),'hex')) is not true or reserva_fixture.abrir(a,1,v_reserva_fixture)<>'aberta' then raise exception 'preparo fixture negado'; end if;
 perform set_config('ffcm_fixture.suprimir_efeito','sim',true);
 begin
  execute 'set local role ffcm_reserva_executor_fixture';
  r:=reserva_fixture.criar_paciente_reservado_fixture(t,1,decode(repeat('01',32),'hex'));
  raise exception 'efeito ausente produziu sucesso';
 exception when sqlstate 'P0002' then
  if sqlerrm<>'EFEITO_NAO_REGISTRADO' then raise; end if;
 end;
 perform set_config('ffcm_fixture.suprimir_efeito','nao',true);
 if exists(select 1 from cadastro.paciente where id='b4000000-0000-4000-8000-000000000021')
 or exists(select 1 from operacao.requisicao where chave_idempotencia='fixture-reserva-paciente')
 or exists(select 1 from auditoria.evento where acao='api.criar_paciente' and resultado='permitido' and objeto_id='b4000000-0000-4000-8000-000000000021')
 or not exists(select 1 from reserva_fixture.reserva where id=v_reserva_fixture and estado='aberta') then
  raise exception 'efeito ausente não reverteu transação';
 end if;
 perform set_config('ffcm_fixture.suprimir_confirmacao','sim',true);
 begin
  execute 'set local role ffcm_reserva_executor_fixture';
  r:=reserva_fixture.criar_paciente_reservado_fixture(t,1,decode(repeat('01',32),'hex'));
  raise exception 'confirmação ausente produziu sucesso';
 exception when sqlstate 'P0002' then
  if sqlerrm<>'RESERVA_NAO_CONFIRMADA' then raise; end if;
 end;
 perform set_config('ffcm_fixture.suprimir_confirmacao','nao',true);
 if exists(select 1 from cadastro.paciente where id='b4000000-0000-4000-8000-000000000021')
 or exists(select 1 from reserva_fixture.efeito where reserva_id=v_reserva_fixture)
 or exists(select 1 from operacao.requisicao where chave_idempotencia='fixture-reserva-paciente')
 or exists(select 1 from auditoria.evento where acao='api.criar_paciente' and resultado='permitido' and objeto_id='b4000000-0000-4000-8000-000000000021')
 or not exists(select 1 from reserva_fixture.reserva where id=v_reserva_fixture and estado='aberta') then
  raise exception 'confirmação ausente não reverteu transação';
 end if;
 execute 'set local role ffcm_reserva_executor_fixture';
 r:=reserva_fixture.criar_paciente_reservado_fixture(t,1,decode(repeat('01',32),'hex'));
 execute 'reset role';
 if r->>'ok' is distinct from 'true' or r#>>'{dados,paciente_id}' is distinct from 'b4000000-0000-4000-8000-000000000021' then raise exception 'paciente reservado negado'; end if;
 if not exists(select 1 from reserva_fixture.reserva where id=v_reserva_fixture and estado='confirmada' and paciente_resultado='b4000000-0000-4000-8000-000000000021') then raise exception 'reserva não confirmou paciente'; end if;
 execute 'set local role ffcm_reserva_executor_fixture';
 r:=reserva_fixture.criar_paciente_reservado_fixture(t,1,decode(repeat('01',32),'hex'));
 execute 'reset role';
 if r->>'ok' is distinct from 'true' or r#>>'{dados,paciente_id}' is distinct from 'b4000000-0000-4000-8000-000000000021' or (select count(*) from cadastro.paciente where id='b4000000-0000-4000-8000-000000000021')<>1 then raise exception 'resultado perdido não recuperado'; end if;
 t:=experimento_atestado.assinar_fixture(jsonb_set(e,'{digest_idempotencia}','"outro-digest"'));
 execute 'set local role ffcm_reserva_executor_fixture';
 r:=reserva_fixture.criar_paciente_reservado_fixture(t,1,decode(repeat('01',32),'hex'));
 execute 'reset role';
 if r#>>'{erro,codigo}' is distinct from 'conflito_idempotencia' then raise exception 'reuso divergente não negado'; end if;
 t:=experimento_atestado.assinar_fixture(e);
 execute 'set local role ffcm_reserva_executor_fixture';
 r:=reserva_fixture.criar_paciente_reservado_fixture(jsonb_set(t,'{entrada,geracao_reserva}','2'),1,decode(repeat('01',32),'hex'));
 execute 'reset role';
 if r->>'ok' is distinct from 'false' then raise exception 'geração adulterada aceita'; end if;
 update identidade.sessao set revogada_em=clock_timestamp(),revogada_por_usuario_id=a,
  motivo_revogacao_cifrado='{"formato":1,"key_id":"teste","nonce":"falso","ciphertext":"falso","tag":"falso"}'
  where session_id='63000000-0000-4000-8000-000000000001';
 execute 'set local role ffcm_reserva_executor_fixture';
 r:=reserva_fixture.criar_paciente_reservado_fixture(t,1,decode(repeat('01',32),'hex'));
 execute 'reset role';
 if r->>'ok' is distinct from 'false' or r ? 'dados' then raise exception 'retry após revogação devolveu dados'; end if;
end $$;
rollback;
