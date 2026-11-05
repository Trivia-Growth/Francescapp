-- Exceção para ambiente de teste. O login identifica um serviço, não uma pessoa.
alter table auditoria.operador_tecnico
  add column tipo text not null default 'individual' check (tipo in ('individual', 'servico_teste')),
  add column expira_em timestamptz,
  add constraint operador_prazo_servico_chk check (
    (tipo = 'individual' and expira_em is null) or
    (tipo = 'servico_teste' and expira_em is not null)
  );
grant select (tipo, expira_em) on auditoria.operador_tecnico to ffcmapp_operador_resolver_owner;

select set_config('ffcmapp.servico_migrador', current_user, false);
select set_config('ffcmapp.servico_tinha_set', pg_has_role(current_user, 'ffcmapp_operador_resolver_owner', 'SET')::text, false);
select set_config('ffcmapp.servico_tinha_create', exists(select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a join pg_roles r on r.oid=a.grantee where n.nspname='auditoria' and r.rolname='ffcmapp_operador_resolver_owner' and a.privilege_type='CREATE')::text,false);
do $$ begin
 if current_setting('ffcmapp.servico_tinha_set') = 'false' then
  if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor where r.rolname='ffcmapp_operador_resolver_owner' and u.rolname=current_user and g.rolname=current_user) then
   raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET';
  end if;
  execute format('grant ffcmapp_operador_resolver_owner to %I with inherit false, set true granted by %I',current_user,current_user);
 end if;
end $$;
do $$ begin if current_setting('ffcmapp.servico_tinha_create')='false' then grant create on schema auditoria to ffcmapp_operador_resolver_owner; end if; end $$;
set role ffcmapp_operador_resolver_owner;
create or replace function auditoria.operador_tecnico_atual() returns text
language plpgsql security definer set search_path = '' as $$
declare v_codigo text;
begin
 select o.codigo into v_codigo from auditoria.operador_tecnico o
 join pg_catalog.pg_roles r on r.oid=o.papel_oid and r.rolname=o.papel_nome
 where r.rolname=session_user and r.rolcanlogin and o.ativo
   and (o.tipo='individual' or (o.tipo='servico_teste' and o.expira_em > clock_timestamp()))
 for share of o;
 if not found then raise exception using errcode='42501', message='OPERADOR_NAO_AUTORIZADO'; end if;
 return v_codigo;
end $$;
select set_config('role', current_setting('ffcmapp.servico_migrador'), false);
do $$ begin if current_setting('ffcmapp.servico_tinha_create')='false' then revoke create on schema auditoria from ffcmapp_operador_resolver_owner; end if; end $$;
do $$ begin if current_setting('ffcmapp.servico_tinha_set')='false' then execute format('revoke ffcmapp_operador_resolver_owner from %I granted by %I',current_user,current_user); end if; end $$;
