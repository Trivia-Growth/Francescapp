\set ON_ERROR_STOP on
create role anon; create role authenticated; create role service_role;
create schema auth; create schema auth_privado; create schema operacao; create schema cadastro;
create table public.usuario(id uuid primary key);
create table cadastro.paciente(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('teste.ator',true),'')::uuid $$;
create function auth_privado.uid() returns uuid language sql stable as $$ select auth.uid() $$;
\ir ../migrations/20261106140000_criar_paciente_privado.sql
insert into public.usuario values ('10000000-0000-4000-8000-000000000001'), ('10000000-0000-4000-8000-000000000002');
select set_config('teste.ator','10000000-0000-4000-8000-000000000001',false);
do $$
declare a uuid:='10000000-0000-4000-8000-000000000001'; outro uuid:='10000000-0000-4000-8000-000000000002'; r uuid:='20000000-0000-4000-8000-000000000001'; c uuid:='30000000-0000-4000-8000-000000000001';
begin
 if has_function_privilege('authenticated','operacao.reservar_cadastro_privado(uuid,bigint,uuid)','execute') or has_table_privilege('service_role','operacao.reserva_cadastro','select') then raise exception 'GRANT_INDEVIDO'; end if;
 if operacao.reservar_cadastro_privado(outro,1,r)<>'negada' then raise exception 'ATOR_DIVERGENTE'; end if;
 if operacao.reservar_cadastro_privado(a,1,r)<>'aberta' then raise exception 'RESERVA'; end if;
 if operacao.reservar_cadastro_privado(a,1,r)<>'aberta' then raise exception 'RETRY'; end if;
 if operacao.encerrar_cadastro_privado(a,1,r,c)<>'cancelada' then raise exception 'ENCERRAMENTO'; end if;
 if operacao.encerrar_cadastro_privado(a,1,r,c)<>'cancelada' then raise exception 'RETRY_ENCERRAMENTO'; end if;
 if operacao.reservar_cadastro_privado(a,2,'20000000-0000-4000-8000-000000000002')<>'bloqueada' then raise exception 'RESULTADO_NAO_RECONHECIDO'; end if;
 if operacao.reservar_cadastro_privado(a,1,'20000000-0000-4000-8000-000000000003')<>'epoca_antiga' then raise exception 'EPOCA'; end if;
 begin
  insert into operacao.reserva_cadastro(id,ator_usuario_id,epoca,estado,chave_idempotencia)
  values('20000000-0000-4000-8000-000000000004',a,1,'aberta','parcial');
  raise exception 'CHAVE_PARCIAL_ACEITA';
 exception when check_violation then null;
 end;
end $$;
