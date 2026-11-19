\set ON_ERROR_STOP on
-- ESCRITO, NÃO EXECUTADO. Duas conexões reais; Auth/Vault/conteúdo somente fictícios.
\ir documentos_preautorizacao_local.sql
create extension if not exists dblink;
update identidade.sessao set encerrada_em=null where session_id='22000000-0000-4000-8000-000000000001';
update auth.sessions set not_after=null where id='22000000-0000-4000-8000-000000000001';
create function public.documento_ttl_concorrente_fixture(pasta boolean) returns jsonb language plpgsql as $$
declare e jsonb;t jsonb;previa jsonb;r jsonb;begin
 perform public.acessos_claims_fixture('11000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','oauth');
 e:=public.documento_entrada_previa_fixture('44000000-0000-4000-8000-00000000d001',gen_random_uuid(),0,gen_random_uuid()::text);
 e:=jsonb_set(e,'{aad,registro_id}',e->'registro_id');previa:=public.acessos_assinar_fixture(e,'api.gravar_documento');
 t:=public.acessos_assinar_fixture(jsonb_build_object('request_id',e->'request_id','paciente_id',e->'paciente_id','raiz','raiz-ttl-ficticia','candidata','pasta-ttl-ficticia','marcador',repeat('m',43)),'api.gravar_documento');
 begin
  set local role authenticated;
  if pasta then r:=api.documento_pasta_reservar_privada(t,previa);else r:=api.documento_preautorizar_privada(previa);end if;
  reset role;return r;
 exception when sqlstate 'PZ001' then reset role;return jsonb_build_object('expirou',true);end;
end $$;
revoke all on function public.documento_ttl_concorrente_fixture(boolean) from public,anon,authenticated,service_role;
select dblink_connect('documento_ttl',format('dbname=%L host=%L user=%L application_name=documento_ttl',current_database(),split_part(current_setting('unix_socket_directories'),',',1),current_user));
-- A prévia já passou pelo gate inicial quando bloqueia no INSERT de auditoria.
begin;
lock table auditoria.evento in access exclusive mode;
select dblink_send_query('documento_ttl','select public.documento_ttl_concorrente_fixture(false)');
do $$ declare tentativas integer:=0;begin
 while not exists(select 1 from pg_stat_activity where application_name='documento_ttl' and wait_event_type='Lock') loop
  perform pg_sleep(0.01);tentativas:=tentativas+1;if tentativas>1000 then raise exception 'PREVIA_NAO_ESPEROU';end if;
 end loop;
 perform pg_sleep(21); -- assinador fictício tem TTL de20s; não depende de relógio cliente.
end $$;
commit;
create temp table documento_ttl_resultado as select * from dblink_get_result('documento_ttl') as t(resultado jsonb);
do $$begin if not exists(select 1 from documento_ttl_resultado where resultado='{"expirou":true}'::jsonb) then raise exception 'PREVIA_AUTORIZOU_APOS_TTL';end if;end $$;
-- Reserva bloqueia só depois da prévia/assinatura atuais, no INSERT da tabela de pastas.
begin;
lock table cadastro.documento_pasta in access exclusive mode;
select dblink_send_query('documento_ttl','select public.documento_ttl_concorrente_fixture(true)');
do $$ declare tentativas integer:=0;begin
 while not exists(select 1 from pg_stat_activity where application_name='documento_ttl' and wait_event_type='Lock') loop
  perform pg_sleep(0.01);tentativas:=tentativas+1;if tentativas>1000 then raise exception 'RESERVA_NAO_ESPEROU';end if;
 end loop;
 perform pg_sleep(21);
end $$;
commit;
truncate documento_ttl_resultado;
insert into documento_ttl_resultado select * from dblink_get_result('documento_ttl') as t(resultado jsonb);
do $$begin
 if not exists(select 1 from documento_ttl_resultado where resultado='{"expirou":true}'::jsonb) or exists(select 1 from cadastro.documento_pasta where raiz='raiz-ttl-ficticia') then raise exception 'RESERVA_CONFIRMADA_APOS_TTL';end if;
end $$;
select dblink_disconnect('documento_ttl');
