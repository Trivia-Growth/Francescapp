begin;
-- DF-023. Preparação local, sem execução/ativação. Senhas pertencem somente ao Auth.
insert into identidade.configuracao_sistema(id,chave,valor,tipo,rotulo,descricao,exposicao) values(gen_random_uuid(),'ffcm.acessos.ativo','false'::jsonb,'booleano','Acessos gerenciados','Ativar somente após provas e revisão independentes.','administracao');
create table identidade.acesso_gerenciado (
 operacao_id uuid primary key, usuario_id uuid unique references auth.users(id),
 nome_cifrado jsonb not null, email_cifrado jsonb not null, motivo_cifrado jsonb not null,
 email_concessao_cifrado jsonb, motivo_concessao_cifrado jsonb,
 email_hmac text not null check(length(email_hmac) between 1 and 256),
 funcao text not null check(funcao in ('administrador','case_manager','familia','profissional')),
 metodo text not null check(metodo in ('google_workspace','interno')),
 estado text not null check(estado in ('reservado','aguardando_confirmacao_email','aguardando_google','ativo','conflito','falha_confirmada')),
 subject_google text, concessao_id uuid unique references identidade.concessao_equipe(id),
 criado_por_usuario_id uuid not null references public.usuario(id), criado_em timestamptz not null default clock_timestamp(),
 chave_idempotencia text not null, digest_idempotencia text not null,
 unique(criado_por_usuario_id,chave_idempotencia),
 check(metodo<>'interno' or usuario_id is not null),
 check(jsonb_typeof(nome_cifrado)='object' and jsonb_typeof(email_cifrado)='object' and jsonb_typeof(motivo_cifrado)='object')
);
create unique index acesso_gerenciado_email_vigente on identidade.acesso_gerenciado(email_hmac) where estado<>'falha_confirmada';
-- UUID interno é reservado ANTES de existir no Auth: vínculo validado na confirmação.
alter table identidade.acesso_gerenciado drop constraint acesso_gerenciado_usuario_id_fkey;
alter table identidade.acesso_gerenciado enable row level security;
alter table identidade.acesso_gerenciado force row level security;
revoke all on identidade.acesso_gerenciado from public,anon,authenticated,service_role;
create role ffcmapp_acessos_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_acessos_owner to current_user with inherit false,set true;
grant usage,create on schema identidade,api to ffcmapp_acessos_owner;
grant usage on schema public,auditoria,auth_privado,bloqueios_auth to ffcmapp_acessos_owner;
grant select,insert,update on identidade.acesso_gerenciado to ffcmapp_acessos_owner;
create policy acessos_owner on identidade.acesso_gerenciado to ffcmapp_acessos_owner using(true) with check(true);
grant select(id,perfil,ativo,versao),insert(id,perfil),update(versao) on public.usuario to ffcmapp_acessos_owner;
create policy acessos_usuario_select on public.usuario for select to ffcmapp_acessos_owner using(true);
create policy acessos_usuario_insert on public.usuario for insert to ffcmapp_acessos_owner with check(exists(select 1 from identidade.acesso_gerenciado g where g.usuario_id=usuario.id and g.estado in ('aguardando_confirmacao_email','aguardando_google','ativo')));
create policy acessos_usuario_lock on public.usuario for update to ffcmapp_acessos_owner using(true) with check(false);
-- Private access administration checks concession-email uniqueness; no application grant.
grant select(id,usuario_id,perfil,estado,metodo,subject_google,versao,habilitado_plano_crise,email_hmac),insert(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,criado_por_usuario_id,motivo_cifrado,vinculada_em),update(versao) on identidade.concessao_equipe to ffcmapp_acessos_owner;
create policy acessos_concessao_select on identidade.concessao_equipe for select to ffcmapp_acessos_owner using(true);
create policy acessos_concessao_insert on identidade.concessao_equipe for insert to ffcmapp_acessos_owner with check(exists(select 1 from identidade.acesso_gerenciado g where g.operacao_id=concessao_equipe.id and g.criado_por_usuario_id=(select auth_privado.uid())));
create policy acessos_concessao_lock on identidade.concessao_equipe for update to ffcmapp_acessos_owner using(true) with check(false);
grant select(session_id,usuario_id,concessao_id,metodo,revogada_em,encerrada_em),insert(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo),update(revogada_em) on identidade.sessao to ffcmapp_acessos_owner;
create policy acessos_sessao_select on identidade.sessao for select to ffcmapp_acessos_owner using(usuario_id=(select auth_privado.uid()));
create policy acessos_sessao_insert on identidade.sessao for insert to ffcmapp_acessos_owner with check(usuario_id=(select auth_privado.uid()));
create policy acessos_sessao_lock on identidade.sessao for update to ffcmapp_acessos_owner using(usuario_id=(select auth_privado.uid())) with check(false);
grant update(dominio_workspace) on identidade.configuracao_auth_nativo to ffcmapp_acessos_owner;
create policy acessos_config_lock on identidade.configuracao_auth_nativo for update to ffcmapp_acessos_owner using(true) with check(false);
grant select(dominio_workspace,google_unico_oauth_confirmado) on identidade.configuracao_auth_nativo to ffcmapp_acessos_owner;
create policy acessos_config on identidade.configuracao_auth_nativo for select to ffcmapp_acessos_owner using(true);
grant insert(id,ator_usuario_id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id) on auditoria.evento to ffcmapp_acessos_owner;
create policy acessos_auditoria on auditoria.evento for insert to ffcmapp_acessos_owner with check(tipo_objeto in ('acesso_gerenciado','sessao') and acao in ('api.reservar_acesso_gerenciado','api.confirmar_acesso_gerenciado','api.consultar_operacao_acesso','api.listar_acessos_gerenciados','confirmar_email_acesso_interno','admitir_sessao_gerenciada','consultar_sessao_gerenciada') and resultado in ('permitido','negado'));
grant execute on function auth_privado.uid(),auth_privado.jwt(),auth_privado.identidades(),auth_privado.sessoes(),bloqueios_auth.travar(uuid,uuid) to ffcmapp_acessos_owner;
alter table identidade.concessao_equipe drop constraint concessao_equipe_metodo_check;
alter table identidade.concessao_equipe add constraint concessao_equipe_metodo_check check(metodo in ('google_workspace','tecnica','interno'));
alter table identidade.concessao_equipe drop constraint concessao_estado_datas_chk;
alter table identidade.concessao_equipe add constraint concessao_estado_datas_chk check((
(estado='pendente' and metodo='google_workspace' and usuario_id is null and subject_google is null and vinculada_em is null and revogada_em is null and revogada_por_usuario_id is null and motivo_revogacao_cifrado is null)
or (estado='vinculada' and usuario_id is not null and vinculada_em is not null and ((metodo='google_workspace' and nullif(btrim(subject_google),'') is not null) or (metodo in ('tecnica','interno') and subject_google is null)) and revogada_em is null and revogada_por_usuario_id is null and motivo_revogacao_cifrado is null)
or (estado='revogada' and revogada_em is not null and revogada_por_usuario_id is not null and motivo_revogacao_cifrado is not null and (metodo='google_workspace' or subject_google is null))) is true);
alter table identidade.sessao drop constraint sessao_metodo_check;
alter table identidade.sessao add constraint sessao_metodo_check check(metodo in ('google_workspace','tecnica','familia','interno'));
alter table identidade.sessao drop constraint sessao_concessao_metodo_chk;
alter table identidade.sessao add constraint sessao_concessao_metodo_chk check((metodo='familia' and concessao_id is null and concessao_versao_admissao is null) or (metodo in ('google_workspace','interno') and ((concessao_id is null and concessao_versao_admissao is null) or (concessao_id is not null and concessao_versao_admissao>0))) or (metodo='tecnica' and concessao_id is not null and concessao_versao_admissao>0));
-- Ponte própria: não expõe Auth global nem identidades fictícias.
create function auth_privado.conta_propria() returns table(id uuid,email_confirmado boolean,operacao_id text)
language sql security definer set search_path='' as $$
 select u.id,u.email_confirmed_at is not null,u.raw_app_meta_data->>'ffcm_provisionamento_id' from auth.users u where u.id=auth.uid()
$$;
revoke all on function auth_privado.conta_propria() from public,anon,authenticated,service_role;
grant execute on function auth_privado.conta_propria() to ffcmapp_acessos_owner;
-- Grants internos são somente aos owners necessários; preserva ACL do verificador.
do $$ declare dono text; tinha boolean; migrador text:=current_user; begin
 select r.rolname into strict dono from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid='identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text)'::regprocedure;
 if dono<>'ffcmapp_atestado_verificador_owner' then raise exception 'OWNER_VERIFICADOR_INESPERADO';end if;
 tinha:=pg_has_role(migrador,dono,'SET');
 if not tinha then
  if exists(select 1 from pg_auth_members where roleid=dono::regrole and member=migrador::regrole and grantor=migrador::regrole) then raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET';end if;
  execute format('grant %I to %I with inherit false,set true granted by %I',dono,migrador,migrador);end if;
 perform set_config('role',dono,true);
 grant execute on function identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text) to ffcmapp_acessos_owner;
 perform set_config('role',migrador,true);
 if not tinha then execute format('revoke %I from %I granted by %I',dono,migrador,migrador);end if;
end $$;

create function auth_privado.conta_gerenciada(p_usuario uuid) returns table(id uuid,email_confirmado boolean,operacao_id text)
language sql security definer set search_path='' as $$ select u.id,u.email_confirmed_at is not null,u.raw_app_meta_data->>'ffcm_provisionamento_id' from auth.users u where u.id=p_usuario $$;
revoke all on function auth_privado.conta_gerenciada(uuid) from public,anon,authenticated,service_role;
grant execute on function auth_privado.conta_gerenciada(uuid) to ffcmapp_acessos_owner;
-- Nenhuma API pública expõe essa bridge; só confirmação da reserva a invoca.

-- Mesma fronteira privada Auth existente: o ambiente nativo não permite
-- presumir delegação de USAGE auth a novo papel. Owner é explícito e guardado.
create function auth_privado.email_conta_gerenciada(p_usuario uuid) returns text language sql security definer set search_path='' as $$ select u.email from auth.users u where u.id=p_usuario $$;
revoke all on function auth_privado.email_conta_gerenciada(uuid) from public,anon,authenticated,service_role;
grant execute on function auth_privado.email_conta_gerenciada(uuid) to ffcmapp_email_hmac_owner;
do $$ declare dono oid;alvo text;begin
 select proowner into strict dono from pg_proc where oid='auth_privado.identidades()'::regprocedure;
 foreach alvo in array array['auth_privado.conta_propria()','auth_privado.conta_gerenciada(uuid)','auth_privado.email_conta_gerenciada(uuid)'] loop
  if (select proowner from pg_proc where oid=to_regprocedure(alvo))<>dono then raise exception 'OWNER_BRIDGE_AUTH_DIVERGENTE';end if;
  execute format('alter function %s owner to %I',alvo,pg_get_userbyid(dono));
 end loop;
end $$;
grant select(chave,valor) on identidade.configuracao_sistema to ffcmapp_acessos_owner;
create policy acessos_flag on identidade.configuracao_sistema for select to ffcmapp_acessos_owner using(chave='ffcm.acessos.ativo');

revoke create on schema identidade,api from ffcmapp_acessos_owner;
revoke ffcmapp_acessos_owner from current_user granted by current_user;
commit;
