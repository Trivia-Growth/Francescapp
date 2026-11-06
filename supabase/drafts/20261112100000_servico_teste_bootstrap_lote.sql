-- Preparação transacional; não concede EXECUTE a logins.
BEGIN;
-- Exceção para ambiente de teste. O login identifica um serviço, não uma pessoa.
alter table auditoria.operador_tecnico
  add column tipo text not null default 'individual' check (tipo in ('individual', 'servico_teste')),
  add column expira_em timestamptz,
  add column posse_ativa text check (posse_ativa is null or posse_ativa ~ '^[0-9a-f]{64}$'),
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

-- RASCUNHO para projeto de teste sem dados reais; revisão e prova reais pendentes.
-- A autorização operacional é durável antes de disponibilizar este acesso;
-- a auditoria desta função é transacional e pode ser revertida pelo cliente.
-- Não comprova cada leitura. Chaves podem ser copiadas e exigem rotação e
-- revisão antes de dados reais; revogar acesso não elimina cópias anteriores.
create role ffcmapp_servico_cofre_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;

create table identidade.cofre_servico_teste_configuracao (
  unico boolean primary key default true check (unico),
  projeto_ref text not null,
  referencia_cifra text not null check (referencia_cifra ~ '^ffcmapp\.cifra\.[a-z0-9][a-z0-9_-]{0,63}$')
);
alter table identidade.cofre_servico_teste_configuracao enable row level security;
revoke all on identidade.cofre_servico_teste_configuracao from public, anon, authenticated, service_role;
grant usage on schema identidade, auditoria to ffcmapp_servico_cofre_owner;
grant select on identidade.cofre_servico_teste_configuracao to ffcmapp_servico_cofre_owner;
grant select (projeto_ref) on identidade.bootstrap_tecnico_controle to ffcmapp_servico_cofre_owner;
grant select (codigo, tipo) on auditoria.operador_tecnico to ffcmapp_servico_cofre_owner;
grant insert (id, operador_restrito, acao, tipo_objeto, objeto_id, resultado, request_id) on auditoria.evento to ffcmapp_servico_cofre_owner;
create policy cofre_servico_config_select on identidade.cofre_servico_teste_configuracao for select to ffcmapp_servico_cofre_owner using (true);
create policy cofre_servico_controle_select on identidade.bootstrap_tecnico_controle for select to ffcmapp_servico_cofre_owner using (true);
create policy cofre_servico_operador_select on auditoria.operador_tecnico for select to ffcmapp_servico_cofre_owner using (true);
create policy cofre_servico_auditoria_insert on auditoria.evento for insert to ffcmapp_servico_cofre_owner with check (acao='bootstrap.cofre_servico' and ator_usuario_id is null and operador_restrito is not null);

-- EXECUTE é concedido pelos owners efetivos, preservando memberships anteriores.
select set_config('ffcmapp.cofre_grant_migrador', current_user, false);
do $$ declare v_role text; v_tinha boolean; begin
 for v_role in select unnest(array['ffcmapp_operador_resolver_owner','ffcmapp_vault_owner','ffcmapp_email_hmac_owner']) loop
  v_tinha := pg_has_role(current_user,v_role,'SET');
  perform set_config('ffcmapp.cofre_grant_' || v_role, v_tinha::text, false);
  if not v_tinha then
   if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor where r.rolname=v_role and u.rolname=current_user and g.rolname=current_user) then raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET'; end if;
   execute format('grant %I to %I with inherit false, set true granted by %I',v_role,current_user,current_user);
  end if;
 end loop;
 if (select pg_get_userbyid(proowner) from pg_proc where oid='auditoria.operador_tecnico_atual()'::regprocedure) <> 'ffcmapp_operador_resolver_owner'
   or (select pg_get_userbyid(proowner) from pg_proc where oid='identidade.ler_chave_cifra_vault(text)'::regprocedure) <> 'ffcmapp_vault_owner'
   or (select pg_get_userbyid(proowner) from pg_proc where oid='identidade.ler_chave_hmac_email_bootstrap()'::regprocedure) <> 'ffcmapp_email_hmac_owner' then raise exception 'OWNER_DIVERGENTE'; end if;
end $$;
set role ffcmapp_operador_resolver_owner;
grant execute on function auditoria.operador_tecnico_atual() to ffcmapp_servico_cofre_owner;
select set_config('role',current_setting('ffcmapp.cofre_grant_migrador'),false);
set role ffcmapp_vault_owner;
grant execute on function identidade.ler_chave_cifra_vault(text) to ffcmapp_servico_cofre_owner;
select set_config('role',current_setting('ffcmapp.cofre_grant_migrador'),false);
set role ffcmapp_email_hmac_owner;
grant execute on function identidade.ler_chave_hmac_email_bootstrap() to ffcmapp_servico_cofre_owner;
select set_config('role',current_setting('ffcmapp.cofre_grant_migrador'),false);
do $$ declare v_role text; begin
 for v_role in select unnest(array['ffcmapp_operador_resolver_owner','ffcmapp_vault_owner','ffcmapp_email_hmac_owner']) loop
  if current_setting('ffcmapp.cofre_grant_' || v_role)='false' then execute format('revoke %I from %I granted by %I',v_role,current_user,current_user); end if;
 end loop;
end $$;

-- O migrador precisa poder SET ROLE neste owner; acesso é removido após criação.
select set_config('ffcmapp.cofre_servico_migrador', current_user, false);
select set_config('ffcmapp.cofre_servico_tinha_set', pg_has_role(current_user,'ffcmapp_servico_cofre_owner','SET')::text, false);
do $$ begin
 if current_setting('ffcmapp.cofre_servico_tinha_set')='false' then
  execute format('grant ffcmapp_servico_cofre_owner to %I with inherit false, set true granted by %I',current_user,current_user);
 end if;
end $$;
grant create on schema identidade to ffcmapp_servico_cofre_owner;
set role ffcmapp_servico_cofre_owner;
create function identidade.ler_cofre_servico_teste(p_projeto text, p_tipo text, p_request uuid, p_referencia text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_operador text; v_ref text; v_valor text;
begin
  v_operador := auditoria.operador_tecnico_atual();
  if p_request is null or p_tipo is null or p_tipo not in ('cifra','hmac') or not exists
    (select 1 from auditoria.operador_tecnico where codigo=v_operador and tipo='servico_teste') then
    raise exception using errcode='42501', message='OPERADOR_NAO_AUTORIZADO';
  end if;
  select c.referencia_cifra into strict v_ref
    from identidade.cofre_servico_teste_configuracao c
    join identidade.bootstrap_tecnico_controle b on b.projeto_ref=c.projeto_ref
    where c.projeto_ref=p_projeto and (p_tipo <> 'cifra' or c.referencia_cifra=p_referencia);
  if p_tipo='cifra' then v_valor := identidade.ler_chave_cifra_vault(v_ref);
  else v_valor := identidade.ler_chave_hmac_email_bootstrap(); end if;
  insert into auditoria.evento(id,operador_restrito,acao,tipo_objeto,resultado,request_id)
    values(gen_random_uuid(),v_operador,'bootstrap.cofre_servico','cofre','permitido',p_request);
  return v_valor;
end $$;
revoke all on function identidade.ler_cofre_servico_teste(text,text,uuid,text) from public, anon, authenticated, service_role;
select set_config('role',current_setting('ffcmapp.cofre_servico_migrador'),false);
revoke create on schema identidade from ffcmapp_servico_cofre_owner;
do $$ begin if current_setting('ffcmapp.cofre_servico_tinha_set')='false' then execute format('revoke ffcmapp_servico_cofre_owner from %I granted by %I',current_user,current_user); end if; end $$;

-- RASCUNHO: sem concessão a login. Requer revisão e prova integrada.
grant usage on schema operacao to ffcmapp_bootstrap_owner;
grant select, insert on operacao.lote_teste to ffcmapp_bootstrap_owner;
grant select, insert, update on operacao.configuracao_lote_teste to ffcmapp_bootstrap_owner;
grant select (codigo,tipo) on auditoria.operador_tecnico to ffcmapp_bootstrap_owner;
create policy bootstrap_lote_operador_select on auditoria.operador_tecnico for select to ffcmapp_bootstrap_owner using (true);
create policy bootstrap_lote_select on operacao.lote_teste for select to ffcmapp_bootstrap_owner using (true);
create policy bootstrap_lote_insert on operacao.lote_teste for insert to ffcmapp_bootstrap_owner with check (true);
create policy bootstrap_lote_config_select on operacao.configuracao_lote_teste for select to ffcmapp_bootstrap_owner using (true);
create policy bootstrap_lote_config_insert on operacao.configuracao_lote_teste for insert to ffcmapp_bootstrap_owner with check (true);
create policy bootstrap_lote_evento on auditoria.evento for insert to ffcmapp_bootstrap_owner with check (acao='servico_teste.lote' and ator_usuario_id is null and operador_restrito is not null);

select set_config('ffcmapp.lote_migrador', current_user, false);
select set_config('ffcmapp.lote_tinha_set', pg_has_role(current_user,'ffcmapp_bootstrap_owner','SET')::text, false);
select set_config('ffcmapp.lote_tinha_create', exists(select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a join pg_roles r on r.oid=a.grantee where n.nspname='identidade' and r.rolname='ffcmapp_bootstrap_owner' and a.privilege_type='CREATE')::text, false);
do $$ begin
 if current_setting('ffcmapp.lote_tinha_set')='false' then
  if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor where r.rolname='ffcmapp_bootstrap_owner' and u.rolname=current_user and g.rolname=current_user) then raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET'; end if;
  execute format('grant ffcmapp_bootstrap_owner to %I with inherit false, set true granted by %I',current_user,current_user);
 end if;
 if current_setting('ffcmapp.lote_tinha_create')='false' then grant create on schema identidade to ffcmapp_bootstrap_owner; end if;
end $$;
set role ffcmapp_bootstrap_owner;
create function identidade.bootstrap_lote_servico(
 p_projeto text,p_usuario uuid,p_concessao uuid,p_email_cifrado jsonb,p_email_hmac text,
 p_motivo_cifrado jsonb,p_request uuid,p_lote uuid,p_identificacao text
) returns text language plpgsql security definer set search_path='' as $$
declare v_operador text; v_resultado text; v_lote uuid;
begin
 v_operador := auditoria.operador_tecnico_atual();
 if not exists(select 1 from auditoria.operador_tecnico where codigo=v_operador and tipo='servico_teste') then raise exception using errcode='42501', message='OPERADOR_NAO_AUTORIZADO'; end if;
 if p_lote is null or p_identificacao is null or btrim(p_identificacao)='' or length(p_identificacao)>200 then raise exception 'LOTE_INVALIDO'; end if;
 v_resultado := identidade.bootstrap_tecnico(p_projeto,p_usuario,p_concessao,p_email_cifrado,p_email_hmac,p_motivo_cifrado,p_request);
 lock table operacao.configuracao_lote_teste in exclusive mode;
 select lote_teste_id into v_lote from operacao.configuracao_lote_teste;
 if v_lote is null then
  insert into operacao.lote_teste(id,identificacao,responsavel_usuario_id) values(p_lote,btrim(p_identificacao),p_usuario);
  insert into operacao.configuracao_lote_teste(lote_teste_id) values(p_lote);
 elsif v_lote<>p_lote or not exists(select 1 from operacao.lote_teste where id=p_lote and identificacao=btrim(p_identificacao) and responsavel_usuario_id=p_usuario and encerrado_em is null) then
  raise exception 'LOTE_DIVERGENTE';
 end if;
 insert into auditoria.evento(id,operador_restrito,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),v_operador,'servico_teste.lote','lote_teste',p_lote,'permitido',p_request);
 return v_resultado;
end $$;
revoke all on function identidade.bootstrap_lote_servico(text,uuid,uuid,jsonb,text,jsonb,uuid,uuid,text) from public,anon,authenticated,service_role;
select set_config('role',current_setting('ffcmapp.lote_migrador'),false);
do $$ begin
 if current_setting('ffcmapp.lote_tinha_create')='false' then revoke create on schema identidade from ffcmapp_bootstrap_owner; end if;
 if current_setting('ffcmapp.lote_tinha_set')='false' then execute format('revoke ffcmapp_bootstrap_owner from %I granted by %I',current_user,current_user); end if;
end $$;

-- Canal administrativo: cada fase é um SELECT parametrizado e atômico.
create function operacao.fase_servico_teste(p_fase text,p_projeto text,p_codigo text,p_acao text,p_request text,p_resultado text,p_posse text)
returns void language plpgsql security invoker set search_path = '' as $func$
begin
 if p_fase not in ('pre_encerrar','principal') or (p_fase='pre_encerrar' and p_acao <> 'encerrar') then raise exception 'FASE_INVALIDA'; end if;
 perform set_config('ffcmapp.op_projeto',p_projeto,true), set_config('ffcmapp.op_codigo',p_codigo,true), set_config('ffcmapp.op_acao',p_acao,true), set_config('ffcmapp.op_request',p_request,true), set_config('ffcmapp.op_resultado',p_resultado,true), set_config('ffcmapp.op_posse',p_posse,true);
 if p_fase='pre_encerrar' then execute $bloco$do $$
declare v_papel name; v_codigo text := current_setting('ffcmapp.op_codigo');
begin
 if not exists(select 1 from identidade.bootstrap_tecnico_controle where projeto_ref=current_setting('ffcmapp.op_projeto')) then raise exception 'ALVO_NAO_CONFIGURADO'; end if;
 if not exists(select 1 from auditoria.evento where operador_restrito=v_codigo and acao='servico_teste.autorizado' and request_id=current_setting('ffcmapp.op_request')::uuid and resultado='permitido') then raise exception 'OPERACAO_NAO_AUTORIZADA'; end if;
 select o.papel_nome into strict v_papel from auditoria.operador_tecnico o join pg_catalog.pg_roles r on r.oid=o.papel_oid and r.rolname=o.papel_nome where o.codigo=v_codigo and o.tipo='servico_teste' and o.ativo and o.posse_ativa=current_setting('ffcmapp.op_posse');
 execute format('alter role %I nologin',v_papel);
 insert into auditoria.evento(id,operador_restrito,acao,tipo_objeto,resultado,request_id)
 values(gen_random_uuid(),v_codigo,'servico_teste.encerramento_iniciado','operacao','permitido',current_setting('ffcmapp.op_request')::uuid);
end $$;$bloco$; else execute $bloco$do $$
declare
  v_projeto text := current_setting('ffcmapp.op_projeto');
  v_codigo text := current_setting('ffcmapp.op_codigo');
  v_acao text := current_setting('ffcmapp.op_acao');
  v_request uuid := current_setting('ffcmapp.op_request')::uuid;
  v_posse text := current_setting('ffcmapp.op_posse');
  v_resultado text := current_setting('ffcmapp.op_resultado');
  v_operador auditoria.operador_tecnico%rowtype;
  v_pid integer;
begin
  if v_projeto !~ '^[a-z0-9]{20}$' or v_codigo !~ '^op_[0-9a-f]{32}$' or v_posse !~ '^[0-9a-f]{64}$'
    or v_acao not in ('autorizar','encerrar')
    or v_resultado not in ('permitido','falhou','indeterminado') then
    raise exception 'ENTRADA_INVALIDA';
  end if;
  if not exists (select 1 from identidade.bootstrap_tecnico_controle where projeto_ref=v_projeto)
    or not exists (select 1 from identidade.cofre_servico_teste_configuracao where projeto_ref=v_projeto) then
    raise exception 'ALVO_NAO_CONFIGURADO';
  end if;
  if v_acao='encerrar' then
    if not exists(select 1 from auditoria.operador_tecnico where codigo=v_codigo and ativo and posse_ativa=v_posse) then raise exception 'POSSE_INVALIDA'; end if;
    -- Após NOLOGIN confirmado, termina sessões que poderiam segurar FOR SHARE.
    for v_pid in select a.pid from pg_catalog.pg_stat_activity a join auditoria.operador_tecnico o on o.papel_nome=a.usename where o.codigo=v_codigo and a.pid<>pg_backend_pid() loop
      if not pg_catalog.pg_terminate_backend(v_pid) then raise exception 'SESSAO_NAO_TERMINADA'; end if;
    end loop;
  end if;
  select * into strict v_operador from auditoria.operador_tecnico where codigo=v_codigo for update;
  if v_operador.tipo <> 'servico_teste' or not exists
    (select 1 from pg_catalog.pg_roles where oid=v_operador.papel_oid and rolname=v_operador.papel_nome and (v_acao='encerrar' or rolcanlogin)) then
    raise exception 'SERVICO_INVALIDO';
  end if;
  if v_acao='autorizar' then
    if exists(select 1 from pg_catalog.pg_auth_members m where m.member=v_operador.papel_oid
      or (m.roleid=v_operador.papel_oid and not coalesce(m.member=(select oid from pg_catalog.pg_roles where rolname='postgres') and m.grantor=(select oid from pg_catalog.pg_roles where rolname='supabase_admin') and m.admin_option and not m.inherit_option and not m.set_option,false)))
      or exists(select 1 from pg_catalog.pg_roles where oid=v_operador.papel_oid and (rolsuper or rolcreatedb or rolcreaterole or rolinherit or rolreplication or rolbypassrls))
      or exists(select 1 from pg_catalog.pg_shdepend where refclassid='pg_authid'::regclass and refobjid=v_operador.papel_oid and deptype in ('a','o'))
      or exists(select 1 from pg_catalog.pg_namespace n where n.nspname in ('identidade','auditoria','operacao','cadastro','vault') and has_schema_privilege(v_operador.papel_oid,n.oid,'USAGE'))
      or has_function_privilege(v_operador.papel_oid,'identidade.bootstrap_tecnico(text,uuid,uuid,jsonb,text,jsonb,uuid)','EXECUTE')
      or has_function_privilege(v_operador.papel_oid,'identidade.bootstrap_lote_servico(text,uuid,uuid,jsonb,text,jsonb,uuid,uuid,text)','EXECUTE')
      or has_function_privilege(v_operador.papel_oid,'identidade.ler_cofre_servico_teste(text,text,uuid,text)','EXECUTE')
      or has_function_privilege(v_operador.papel_oid,'identidade.ler_chave_cifra_vault(text)','EXECUTE')
      or has_function_privilege(v_operador.papel_oid,'identidade.ler_chave_hmac_email_bootstrap()','EXECUTE')
      or exists(select 1 from auditoria.evento where operador_restrito=v_codigo and acao='servico_teste.autorizado' and request_id=v_request)
      or v_operador.ativo or v_operador.posse_ativa is not null or v_operador.expira_em <= clock_timestamp()
      or v_operador.expira_em > clock_timestamp() + interval '1 hour' or v_resultado <> 'permitido' then
      raise exception 'AUTORIZACAO_INVALIDA';
    end if;
    insert into auditoria.evento(id,operador_restrito,acao,tipo_objeto,resultado,request_id)
      values(gen_random_uuid(),v_codigo,'servico_teste.autorizado','operacao','permitido',v_request);
    execute format('grant usage on schema identidade to %I',v_operador.papel_nome);
    execute format('grant execute on function identidade.bootstrap_lote_servico(text,uuid,uuid,jsonb,text,jsonb,uuid,uuid,text) to %I',v_operador.papel_nome);
    execute format('grant execute on function identidade.ler_cofre_servico_teste(text,text,uuid,text) to %I',v_operador.papel_nome);
    update auditoria.operador_tecnico set ativo=true, posse_ativa=v_posse where codigo=v_codigo;
  else
    update auditoria.operador_tecnico set ativo=false, posse_ativa=null where codigo=v_codigo and posse_ativa=v_posse;
    execute format('revoke execute on function identidade.bootstrap_lote_servico(text,uuid,uuid,jsonb,text,jsonb,uuid,uuid,text) from %I',v_operador.papel_nome);
    execute format('revoke execute on function identidade.ler_cofre_servico_teste(text,text,uuid,text) from %I',v_operador.papel_nome);
    execute format('alter role %I nologin',v_operador.papel_nome);
    if v_resultado='permitido' and (
      not exists(select 1 from auditoria.evento where operador_restrito=v_codigo and acao='bootstrap.tecnico' and request_id=v_request and resultado='permitido')
      or not exists(select 1 from auditoria.evento where operador_restrito=v_codigo and acao='servico_teste.lote' and request_id=v_request and resultado='permitido')
    ) then v_resultado := 'indeterminado'; end if;
    insert into auditoria.evento(id,operador_restrito,acao,tipo_objeto,resultado,request_id)
      values(gen_random_uuid(),v_codigo,case when v_resultado='indeterminado' then 'servico_teste.encerrado_indeterminado' else 'servico_teste.encerrado' end,'operacao',case when v_resultado='indeterminado' then 'falhou' else v_resultado end,v_request);
  end if;
end $$;$bloco$; end if;
end $func$;
revoke all on function operacao.fase_servico_teste(text,text,text,text,text,text,text) from public,anon,authenticated,service_role;

COMMIT;
