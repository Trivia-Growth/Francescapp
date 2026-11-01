\set ON_ERROR_STOP on
do $$ begin
 if current_database() <> 'ffcm_curta_teste_local'
   or current_setting('listen_addresses') <> ''
   or current_setting('unix_socket_directories') !~ '^/tmp/ffcm-curta\.[A-Za-z0-9]+$'
   or current_setting('data_directory') <> current_setting('unix_socket_directories') || '/data'
 then raise exception 'cluster descartável obrigatório'; end if;
end $$;

create extension pgcrypto;
create extension dblink;
\ir ../drafts/20261105100000_autorizacao_curta_experimento.sql

do $$
declare
 u uuid := '11111111-1111-4111-8111-111111111111';
 s uuid := '22222222-2222-4222-8222-222222222222';
 id uuid := '33333333-3333-4333-8333-333333333333';
 entrada text := '{"paciente":"ficticio"}';
 dados text; mac text; variante text; variante_mac text; agora bigint := floor(extract(epoch from clock_timestamp())*1000);
begin
 insert into autorizacao_curta_fixture.sessao values(s,u,1,true);
 insert into autorizacao_curta_fixture.perfil values(u,true);
 insert into autorizacao_curta_fixture.concessao values(u,true);
 dados := jsonb_build_object('usuario_id',u,'session_id',s,'geracao',1,'operacao','fixture.criar',
   'audiencia','fixture','key_id','fixture','id',id,'emitido_em',agora,'expira_em',agora+60000,
   'digest_entrada',translate(rtrim(encode(digest(convert_to(entrada,'UTF8'),'sha256'),'base64'),'='),'+/','-_'))::text;
 mac := translate(rtrim(encode(hmac(convert_to('ffcmapp:autorizacao-curta:v1:'||dados,'UTF8'),decode(repeat('42',32),'hex'),'sha256'),'base64'),'='),'+/','-_');
 if autorizacao_curta_fixture.executar(dados,repeat('A',43),entrada,entrada::jsonb) is not false then raise exception 'assinatura inválida aceita'; end if;
 if autorizacao_curta_fixture.executar(dados,mac,entrada,'{"paciente":"outro"}') is not false then raise exception 'parâmetros alterados aceitos'; end if;
 update autorizacao_curta_fixture.sessao as ss set ativa=false where ss.id=s;
 if autorizacao_curta_fixture.executar(dados,mac,entrada,entrada::jsonb) is not false then raise exception 'sessão revogada aceita'; end if;
 update autorizacao_curta_fixture.sessao as ss set ativa=true,geracao=2 where ss.id=s;
 if autorizacao_curta_fixture.executar(dados,mac,entrada,entrada::jsonb) is not false then raise exception 'geração anterior aceita'; end if;
 update autorizacao_curta_fixture.sessao as ss set geracao=1 where ss.id=s;
 update autorizacao_curta_fixture.perfil set ativo=false where usuario=u;
 if autorizacao_curta_fixture.executar(dados,mac,entrada,entrada::jsonb) is not false then raise exception 'perfil inativo aceito'; end if;
 update autorizacao_curta_fixture.perfil set ativo=true where usuario=u;
 update autorizacao_curta_fixture.concessao set ativa=false where usuario=u;
 if autorizacao_curta_fixture.executar(dados,mac,entrada,entrada::jsonb) is not false then raise exception 'concessão revogada aceita'; end if;
 update autorizacao_curta_fixture.concessao set ativa=true where usuario=u;
 variante:=jsonb_set(jsonb_set(dados::jsonb,'{emitido_em}',to_jsonb(agora-120000)),'{expira_em}',to_jsonb(agora-60000))::text;
 variante_mac:=translate(rtrim(encode(hmac(convert_to('ffcmapp:autorizacao-curta:v1:'||variante,'UTF8'),decode(repeat('42',32),'hex'),'sha256'),'base64'),'='),'+/','-_');
 if autorizacao_curta_fixture.executar(variante,variante_mac,entrada,entrada::jsonb) is not false then raise exception 'autorização expirada aceita'; end if;
 begin
  if autorizacao_curta_fixture.executar(dados,mac,entrada,entrada::jsonb) is not true then raise exception 'controle antes de rollback falhou'; end if;
  raise exception using errcode='P0002',message='forçar rollback';
 exception when sqlstate 'P0002' then null;
 end;
 if (select count(*) from autorizacao_curta_fixture.consumo)<>0 or (select count(*) from autorizacao_curta_fixture.efeito)<>0 or (select count(*) from autorizacao_curta_fixture.auditoria)<>0 then raise exception 'rollback parcial'; end if;
 if autorizacao_curta_fixture.executar(dados,mac,entrada,entrada::jsonb) is not true then raise exception 'operação válida negada'; end if;
 if autorizacao_curta_fixture.executar(dados,mac,entrada,entrada::jsonb) is not false then raise exception 'replay aceito'; end if;
 if (select count(*) from autorizacao_curta_fixture.efeito) <> 1 or (select count(*) from autorizacao_curta_fixture.auditoria) <> 1 then raise exception 'efeito ou auditoria inconsistente'; end if;
end $$;

-- Outra conexão segura o lock até a autorização expirar; o resultado deve negar.
do $$
declare
 u uuid := '11111111-1111-4111-8111-111111111111';
 s uuid := '22222222-2222-4222-8222-222222222222';
 aid uuid := '44444444-4444-4444-8444-444444444444';
 entrada text := '{"paciente":"ficticio"}';
 dados text; mac text; comando text; aceito boolean; esperando boolean := false;
 agora bigint := floor(extract(epoch from clock_timestamp())*1000); i integer;
 conexao text := format('host=%s port=%s dbname=%s', current_setting('unix_socket_directories'), current_setting('port'),current_database());
begin
 dados := jsonb_build_object('usuario_id',u,'session_id',s,'geracao',1,'operacao','fixture.criar',
  'audiencia','fixture','key_id','fixture','id',aid,'emitido_em',agora-58800,'expira_em',agora+1200,
  'digest_entrada',translate(rtrim(encode(digest(convert_to(entrada,'UTF8'),'sha256'),'base64'),'='),'+/','-_'))::text;
 mac := translate(rtrim(encode(hmac(convert_to('ffcmapp:autorizacao-curta:v1:'||dados,'UTF8'),decode(repeat('42',32),'hex'),'sha256'),'base64'),'='),'+/','-_');
 perform dblink_connect('curta_lock',conexao);
 perform dblink_connect('curta_espera',conexao||' application_name=ffcm_curta_espera');
 perform dblink_exec('curta_lock','begin');
 perform dblink_exec('curta_lock',format('update autorizacao_curta_fixture.sessao set ativa=ativa where id=%L',s));
 comando := format('select autorizacao_curta_fixture.executar(%L,%L,%L,%L::jsonb)',dados,mac,entrada,entrada);
 if dblink_send_query('curta_espera',comando)<>1 then raise exception 'consulta assíncrona não iniciada'; end if;
 for i in 1..100 loop
  select exists(select 1 from pg_stat_activity where application_name='ffcm_curta_espera' and wait_event_type='Lock') into esperando;
  exit when esperando;
  perform pg_sleep(0.01);
 end loop;
 if not esperando then raise exception 'teste não comprovou espera pelo lock'; end if;
 perform pg_sleep(1.3);
 perform dblink_exec('curta_lock','commit');
 select resultado into aceito from dblink_get_result('curta_espera') as t(resultado boolean);
 if aceito is distinct from false then raise exception 'autorização expirada durante lock aceita'; end if;
 if exists(select 1 from autorizacao_curta_fixture.consumo where id=aid)
  or exists(select 1 from autorizacao_curta_fixture.efeito where id=aid)
  or exists(select 1 from autorizacao_curta_fixture.auditoria where id=aid) then raise exception 'houve efeito após expiração'; end if;
 perform dblink_disconnect('curta_espera');
 perform dblink_disconnect('curta_lock');
end $$;

-- Concessão revogada antes do lock ser liberado deve impedir a operação.
do $$
declare
 u uuid := '11111111-1111-4111-8111-111111111111';
 s uuid := '22222222-2222-4222-8222-222222222222';
 aid uuid := '55555555-5555-4555-8555-555555555555';
 entrada text := '{"paciente":"ficticio"}'; dados text; mac text; comando text;
 aceito boolean; esperando boolean := false; i integer;
 agora bigint := floor(extract(epoch from clock_timestamp())*1000);
 conexao text := format('host=%s port=%s dbname=%s', current_setting('unix_socket_directories'), current_setting('port'),current_database());
begin
 dados := jsonb_build_object('usuario_id',u,'session_id',s,'geracao',1,'operacao','fixture.criar','audiencia','fixture','key_id','fixture','id',aid,'emitido_em',agora,'expira_em',agora+60000,'digest_entrada',translate(rtrim(encode(digest(convert_to(entrada,'UTF8'),'sha256'),'base64'),'='),'+/','-_'))::text;
 mac := translate(rtrim(encode(hmac(convert_to('ffcmapp:autorizacao-curta:v1:'||dados,'UTF8'),decode(repeat('42',32),'hex'),'sha256'),'base64'),'='),'+/','-_');
 perform dblink_connect('revogador',conexao);
 perform dblink_connect('operador',conexao||' application_name=ffcm_curta_revogada');
 perform dblink_exec('revogador','begin');
 perform dblink_exec('revogador',format('update autorizacao_curta_fixture.concessao set ativa=false where usuario=%L',u));
 comando := format('select autorizacao_curta_fixture.executar(%L,%L,%L,%L::jsonb)',dados,mac,entrada,entrada);
 if dblink_send_query('operador',comando)<>1 then raise exception 'consulta assíncrona não iniciada'; end if;
 for i in 1..100 loop
  select exists(select 1 from pg_stat_activity where application_name='ffcm_curta_revogada' and wait_event_type='Lock') into esperando;
  exit when esperando; perform pg_sleep(0.01);
 end loop;
 if not esperando then raise exception 'revogação concorrente não aguardou lock'; end if;
 perform dblink_exec('revogador','commit');
 select resultado into aceito from dblink_get_result('operador') as t(resultado boolean);
 if aceito is distinct from false then raise exception 'concessão revogada em concorrência aceita'; end if;
 if exists(select 1 from autorizacao_curta_fixture.consumo where id=aid) or exists(select 1 from autorizacao_curta_fixture.efeito where id=aid) or exists(select 1 from autorizacao_curta_fixture.auditoria where id=aid) then raise exception 'efeito após revogação'; end if;
 perform dblink_disconnect('operador'); perform dblink_disconnect('revogador');
 update autorizacao_curta_fixture.concessao set ativa=true where usuario=u;
end $$;

-- Duas transações tentam consumir o mesmo identificador; somente uma confirma.
do $$
declare
 u uuid := '11111111-1111-4111-8111-111111111111'; s uuid := '22222222-2222-4222-8222-222222222222';
 aid uuid := '66666666-6666-4666-8666-666666666666'; entrada text := '{"paciente":"ficticio"}';
 dados text; mac text; comando text; primeiro boolean; segundo boolean; esperando boolean := false; i integer;
 agora bigint := floor(extract(epoch from clock_timestamp())*1000);
 conexao text := format('host=%s port=%s dbname=%s', current_setting('unix_socket_directories'), current_setting('port'),current_database());
begin
 dados := jsonb_build_object('usuario_id',u,'session_id',s,'geracao',1,'operacao','fixture.criar','audiencia','fixture','key_id','fixture','id',aid,'emitido_em',agora,'expira_em',agora+60000,'digest_entrada',translate(rtrim(encode(digest(convert_to(entrada,'UTF8'),'sha256'),'base64'),'='),'+/','-_'))::text;
 mac := translate(rtrim(encode(hmac(convert_to('ffcmapp:autorizacao-curta:v1:'||dados,'UTF8'),decode(repeat('42',32),'hex'),'sha256'),'base64'),'='),'+/','-_');
 comando := format('select autorizacao_curta_fixture.executar(%L,%L,%L,%L::jsonb)',dados,mac,entrada,entrada);
 perform dblink_connect('primeiro',conexao); perform dblink_connect('segundo',conexao||' application_name=ffcm_curta_replay');
 perform dblink_exec('primeiro','begin');
 select resultado into primeiro from dblink('primeiro',comando) as t(resultado boolean);
 if primeiro is distinct from true then raise exception 'primeira operação negada'; end if;
 if dblink_send_query('segundo',comando)<>1 then raise exception 'segunda operação não iniciada'; end if;
 for i in 1..100 loop
  select exists(select 1 from pg_stat_activity where application_name='ffcm_curta_replay' and wait_event_type='Lock') into esperando;
  exit when esperando; perform pg_sleep(0.01);
 end loop;
 if not esperando then raise exception 'replay concorrente não aguardou lock'; end if;
 perform dblink_exec('primeiro','commit');
 select resultado into segundo from dblink_get_result('segundo') as t(resultado boolean);
 if segundo is distinct from false then raise exception 'replay concorrente aceito'; end if;
 if (select count(*) from autorizacao_curta_fixture.consumo where id=aid)<>1 or (select count(*) from autorizacao_curta_fixture.efeito where id=aid)<>1 or (select count(*) from autorizacao_curta_fixture.auditoria where id=aid)<>1 then raise exception 'contagem divergente'; end if;
 perform dblink_disconnect('primeiro'); perform dblink_disconnect('segundo');
end $$;
