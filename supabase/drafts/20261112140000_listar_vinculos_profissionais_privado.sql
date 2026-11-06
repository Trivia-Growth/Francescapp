-- Draft: leitura administrativa, sem grant à aplicação. Revisão e provas reais pendentes.
create role ffcmapp_listar_vinculos_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_listar_vinculos_owner to current_user with inherit false, set true;
grant usage on schema public, cadastro, auditoria, auth_privado, api to ffcmapp_listar_vinculos_owner;
grant execute on function auth_privado.uid() to ffcmapp_listar_vinculos_owner;
-- Somente o owner pode conceder EXECUTE da sessão, inclusive com migrador restrito.
select set_config('ffcmapp.vinculos_sessao_migrador',current_user,false);
select set_config('ffcmapp.vinculos_tinha_owner_sessao',pg_has_role(current_user,'ffcmapp_auth_nativo_owner','SET')::text,false);
do $$ begin
 if current_setting('ffcmapp.vinculos_tinha_owner_sessao')='false' then
  if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor where r.rolname='ffcmapp_auth_nativo_owner' and u.rolname=current_user and g.rolname=current_user) then raise exception 'MEMBERSHIP_SESSAO_EXISTENTE_SEM_SET'; end if;
  execute format('grant ffcmapp_auth_nativo_owner to %I with inherit false, set true granted by %I',current_user,current_user);
 end if;
end $$;
set role ffcmapp_auth_nativo_owner;
grant execute on function api.consultar_sessao_nativa(uuid) to ffcmapp_listar_vinculos_owner;
reset role;
select set_config('role',current_setting('ffcmapp.vinculos_sessao_migrador'),false);
do $$ begin
 if current_setting('ffcmapp.vinculos_tinha_owner_sessao')='false' then execute format('revoke ffcmapp_auth_nativo_owner from %I granted by %I',current_user,current_user); end if;
end $$;
grant select (id, perfil, ativo) on public.usuario to ffcmapp_listar_vinculos_owner;
grant select (id, paciente_id, usuario_id, revogada_em, versao) on cadastro.acesso_paciente to ffcmapp_listar_vinculos_owner;
grant insert (id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id) on auditoria.evento to ffcmapp_listar_vinculos_owner;
create policy listar_vinculos_usuario on public.usuario for select to ffcmapp_listar_vinculos_owner
 using (id=(select auth_privado.uid()) or perfil='profissional');
create policy listar_vinculos_acesso on cadastro.acesso_paciente for select to ffcmapp_listar_vinculos_owner
 using (exists(select 1 from public.usuario a where a.id=(select auth_privado.uid()) and a.ativo and a.perfil='administrador')
 and exists(select 1 from public.usuario p where p.id=usuario_id and p.perfil='profissional'));
create policy listar_vinculos_auditoria on auditoria.evento for insert to ffcmapp_listar_vinculos_owner
 with check (ator_usuario_id=(select auth_privado.uid()) and acao='api.listar_vinculos_profissionais' and tipo_objeto='paciente');
create function api.listar_vinculos_profissionais_privado(p_request_id uuid, p_paciente_id uuid, p_cursor uuid default null)
 returns jsonb language plpgsql security definer set search_path='' set row_security=on as $$
declare sessao jsonb; ator uuid:=auth_privado.uid(); pagina jsonb;
begin
 if p_request_id is null or p_paciente_id is null then raise exception using errcode='22023',message='ENTRADA_INVALIDA'; end if;
 sessao:=api.consultar_sessao_nativa(p_request_id);
 if sessao is null or sessao#>>'{usuario,id}' is distinct from ator::text or sessao#>>'{usuario,perfil}' is distinct from 'administrador' then
  if exists(select 1 from public.usuario where id=ator) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,'api.listar_vinculos_profissionais','paciente',null,'negado',p_request_id);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',p_request_id);
 end if;
 with itens as (
  select a.id,a.usuario_id,a.revogada_em,a.versao from cadastro.acesso_paciente a
  where a.paciente_id=p_paciente_id and (p_cursor is null or a.id>p_cursor) order by a.id limit 51
 ), numerados as (select *, row_number() over(order by id) n from itens)
 select jsonb_build_object('itens',coalesce(jsonb_agg(jsonb_build_object('id',id,'usuario_id',usuario_id,'revogado',revogada_em is not null,'versao',versao) order by id) filter(where n<=50),'[]'::jsonb),
 'proximo_cursor',case when count(*)>50 then max(id::text) filter(where n=50) end) into pagina from numerados;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
 values(gen_random_uuid(),ator,'api.listar_vinculos_profissionais','paciente',p_paciente_id,'permitido',p_request_id);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 return jsonb_build_object('ok',true,'dados',pagina,'request_id',p_request_id);
end $$;
grant create on schema api to ffcmapp_listar_vinculos_owner;
alter function api.listar_vinculos_profissionais_privado(uuid,uuid,uuid) owner to ffcmapp_listar_vinculos_owner;
revoke create on schema api from ffcmapp_listar_vinculos_owner;
select set_config('ffcmapp.listar_vinculos_migrador',current_user,false);
set role ffcmapp_listar_vinculos_owner;
revoke all on function api.listar_vinculos_profissionais_privado(uuid,uuid,uuid) from public,anon,authenticated,service_role;
reset role;
select set_config('role',current_setting('ffcmapp.listar_vinculos_migrador'),false);
revoke ffcmapp_listar_vinculos_owner from current_user;
