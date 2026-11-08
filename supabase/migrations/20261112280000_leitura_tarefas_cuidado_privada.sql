-- Wrapper de leitura permanece sem grant até validação no ambiente-alvo.
select set_config('ffcmapp.leitura_tarefas_migrador',current_user,false);
select set_config('ffcmapp.leitura_tarefas_tinha_set',pg_has_role(current_user,'ffcmapp_tarefa_owner','SET')::text,false);
select set_config('ffcmapp.leitura_tarefas_tinha_create',has_schema_privilege('ffcmapp_tarefa_owner','api','CREATE')::text,false);
do $$ begin
 if not exists(select 1 from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid='api.tarefa_cuidado_privado(jsonb)'::regprocedure and r.rolname='ffcmapp_tarefa_owner' and p.prosecdef) then raise exception 'WRAPPER_INESPERADO'; end if;
 if current_setting('ffcmapp.leitura_tarefas_tinha_set')='false' then
  if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor where r.rolname='ffcmapp_tarefa_owner' and u.rolname=current_user and g.rolname=current_user) then raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET'; end if;
  execute format('grant ffcmapp_tarefa_owner to %I with inherit false, set true granted by %I',current_user,current_user);
 end if;
 if current_setting('ffcmapp.leitura_tarefas_tinha_create')='false' then grant create on schema api to ffcmapp_tarefa_owner; end if;
end $$;
set role ffcmapp_tarefa_owner;
create function api.ler_tarefas_cuidado_privado(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path='' set row_security=on as $$
begin
 if p_transporte#>>'{entrada,atestado,operacao}' is distinct from 'api.ler_tarefas_cuidado' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 return api.tarefa_cuidado_privado(p_transporte);
end $$;
revoke all on function api.ler_tarefas_cuidado_privado(jsonb) from public,anon,authenticated,service_role;
select set_config('role',current_setting('ffcmapp.leitura_tarefas_migrador'),false);
do $$ begin
 if current_setting('ffcmapp.leitura_tarefas_tinha_create')='false' then revoke create on schema api from ffcmapp_tarefa_owner; end if;
 if current_setting('ffcmapp.leitura_tarefas_tinha_set')='false' then execute format('revoke ffcmapp_tarefa_owner from %I granted by %I',current_user,current_user); end if;
end $$;
