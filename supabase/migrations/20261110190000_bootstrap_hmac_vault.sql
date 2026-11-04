-- Preparação local para bootstrap: não cria login nem concede acesso a operador.
-- Executor recebe a chave integral. Atribuição individual temporária e uso
-- exigem revisão S-02 e controle operacional antes da ativação.
create role ffcmapp_bootstrap_hmac_executor nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant usage on schema identidade to ffcmapp_bootstrap_hmac_executor;
select set_config('ffcmapp.hmac_migrador', current_user, false);
select set_config('ffcmapp.hmac_membro_preexistente',
  exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid
    join pg_roles u on u.oid=m.member where r.rolname='ffcmapp_email_hmac_owner' and u.rolname=current_user)::text, false);
do $$ begin
  if current_setting('ffcmapp.hmac_membro_preexistente') = 'false' then
    execute format('grant ffcmapp_email_hmac_owner to %I with inherit false, set true', current_user);
  elsif not exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid
    join pg_roles u on u.oid=m.member where r.rolname='ffcmapp_email_hmac_owner' and u.rolname=current_user and m.set_option) then
    raise exception 'MEMBERSHIP_SEM_SET';
  end if;
end $$;
select set_config('ffcmapp.hmac_tinha_create', exists(select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a join pg_roles r on r.oid=a.grantee where n.nspname='identidade' and r.rolname='ffcmapp_email_hmac_owner' and a.privilege_type='CREATE')::text, false);
grant create on schema identidade to ffcmapp_email_hmac_owner;
set role ffcmapp_email_hmac_owner;
create function identidade.ler_chave_hmac_email_bootstrap()
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_referencia text; v_chave text; v_bytes bytea;
begin
  select referencia_hmac_email into strict v_referencia from identidade.configuracao_auth_nativo;
  select decrypted_secret into strict v_chave from vault.decrypted_secrets where name = v_referencia;
  v_bytes := decode(v_chave, 'base64');
  if v_bytes is null or octet_length(v_bytes) <> 32 or encode(v_bytes, 'base64') <> v_chave then
    raise exception 'CHAVE_INVALIDA';
  end if;
  return v_chave;
exception when others then
  raise exception using errcode = '55000', message = 'CONFIGURACAO_HMAC_EMAIL_INDISPONIVEL';
end $$;
revoke all on function identidade.ler_chave_hmac_email_bootstrap() from public, anon, authenticated, service_role;
grant execute on function identidade.ler_chave_hmac_email_bootstrap() to ffcmapp_bootstrap_hmac_executor;
select set_config('role', current_setting('ffcmapp.hmac_migrador'), false);
do $$ begin
  if current_setting('ffcmapp.hmac_tinha_create') = 'false' then
    revoke create on schema identidade from ffcmapp_email_hmac_owner;
  end if;
end $$;
do $$ begin
  if current_setting('ffcmapp.hmac_membro_preexistente') = 'false' then
    revoke ffcmapp_email_hmac_owner from current_user granted by current_user;
  end if;
end $$;
