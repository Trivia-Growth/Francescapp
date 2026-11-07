-- PREPARAÇÃO LOCAL: sem grants a runtime. Antes de promover, comprovar gateway JWT,
-- privilégios Vault, canal sem logs de parâmetros e concorrência/revogação reais.
select set_config('ffcmapp.migrador_agenda', current_user, false);
create role ffcmapp_agenda_google_executor nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role ffcmapp_agenda_vault_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_agenda_vault_owner to current_user with inherit false, set true;
create role ffcmapp_agenda_google_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_agenda_google_owner to current_user with inherit false, set true;
grant usage, create on schema identidade to ffcmapp_agenda_google_owner;
grant usage on schema identidade to ffcmapp_agenda_google_executor;
grant usage on schema auth_privado, vault, extensions, cadastro, auditoria to ffcmapp_agenda_google_owner;
grant execute on function extensions.digest(bytea,text) to ffcmapp_agenda_google_owner;
select set_config('ffcmapp.agenda_tinha_verificador',pg_has_role(current_user,'ffcmapp_atestado_verificador_owner','SET')::text,false);
do $$ begin
 if current_setting('ffcmapp.agenda_tinha_verificador')='false' then
  if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor
   where r.rolname='ffcmapp_atestado_verificador_owner' and u.rolname=current_user and g.rolname=current_user) then
   raise exception 'MEMBERSHIP_VERIFICADOR_CONCEDENTE_EXISTENTE_SEM_SET';
  end if;
  execute format('grant ffcmapp_atestado_verificador_owner to %I with inherit false, set true granted by %I',current_user,current_user);
 end if;
end $$;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text) to ffcmapp_agenda_google_owner;
reset role;
select set_config('role',current_setting('ffcmapp.migrador_agenda'),false);
do $$ begin
 if current_setting('ffcmapp.agenda_tinha_verificador')='false' then
  execute format('revoke ffcmapp_atestado_verificador_owner from %I granted by %I',current_user,current_user);
 end if;
end $$;
grant execute on function auth_privado.sessoes(), auth_privado.identidades() to ffcmapp_agenda_google_owner;
grant select (id, ativo, perfil), update (versao) on public.usuario to ffcmapp_agenda_google_owner;
grant select (id, usuario_id, perfil, estado, metodo, subject_google), update (versao) on identidade.concessao_equipe to ffcmapp_agenda_google_owner;
grant select (session_id, usuario_id, concessao_id, metodo, revogada_em, encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_agenda_google_owner;
grant select on identidade.configuracao_auth_nativo to ffcmapp_agenda_google_owner;
grant select (id,nome_cifrado,nome_preferencia_cifrado,versao) on cadastro.paciente to ffcmapp_agenda_google_owner;
grant select (id,paciente_id,usuario_id,revogada_em), update (id) on cadastro.acesso_paciente to ffcmapp_agenda_google_owner;
grant insert (id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) on auditoria.evento to ffcmapp_agenda_google_owner;
create policy agenda_google_paciente on cadastro.paciente for select to ffcmapp_agenda_google_owner
  using (exists(select 1 from cadastro.acesso_paciente ap where ap.paciente_id=cadastro.paciente.id and ap.usuario_id=nullif(current_setting('ffcmapp.agenda_usuario',true),'')::uuid and ap.revogada_em is null));
create policy agenda_google_acesso on cadastro.acesso_paciente for select to ffcmapp_agenda_google_owner
  using (usuario_id=nullif(current_setting('ffcmapp.agenda_usuario',true),'')::uuid);
create policy agenda_google_acesso_lock on cadastro.acesso_paciente for update to ffcmapp_agenda_google_owner
  using (usuario_id=nullif(current_setting('ffcmapp.agenda_usuario',true),'')::uuid) with check (false);
create policy agenda_google_auditoria on auditoria.evento for insert to ffcmapp_agenda_google_owner
  with check (ator_usuario_id=nullif(current_setting('ffcmapp.agenda_usuario',true),'')::uuid);
create policy agenda_google_usuario on public.usuario for select to ffcmapp_agenda_google_owner
  using (id=nullif(current_setting('ffcmapp.agenda_usuario',true),'')::uuid);
create policy agenda_google_concessao on identidade.concessao_equipe for select to ffcmapp_agenda_google_owner
  using (usuario_id=nullif(current_setting('ffcmapp.agenda_usuario',true),'')::uuid);
create policy agenda_google_sessao on identidade.sessao for select to ffcmapp_agenda_google_owner
  using (usuario_id=nullif(current_setting('ffcmapp.agenda_usuario',true),'')::uuid
    and session_id=nullif(current_setting('ffcmapp.agenda_sessao',true),'')::uuid);
create policy agenda_google_usuario_lock on public.usuario for update to ffcmapp_agenda_google_owner
  using (id=nullif(current_setting('ffcmapp.agenda_usuario',true),'')::uuid) with check (false);
create policy agenda_google_concessao_lock on identidade.concessao_equipe for update to ffcmapp_agenda_google_owner
  using (usuario_id=nullif(current_setting('ffcmapp.agenda_usuario',true),'')::uuid) with check (false);
create policy agenda_google_sessao_lock on identidade.sessao for update to ffcmapp_agenda_google_owner
  using (usuario_id=nullif(current_setting('ffcmapp.agenda_usuario',true),'')::uuid
    and session_id=nullif(current_setting('ffcmapp.agenda_sessao',true),'')::uuid) with check (false);
create policy agenda_google_config on identidade.configuracao_auth_nativo for select to ffcmapp_agenda_google_owner using (true);
grant execute on function vault.create_secret(text,text,text,uuid) to ffcmapp_agenda_google_owner;
grant usage on schema identidade, vault to ffcmapp_agenda_vault_owner;
grant select on vault.decrypted_secrets to ffcmapp_agenda_vault_owner;
grant select (id), delete on vault.secrets to ffcmapp_agenda_vault_owner;
grant execute on function vault._crypto_aead_det_decrypt(bytea,bytea,bigint,bytea,bytea)
  to ffcmapp_agenda_vault_owner;
set role ffcmapp_agenda_google_owner;
alter default privileges revoke execute on functions from public;

create table identidade.agenda_google_desconexao_recibo (
  usuario_id uuid not null,
  operacao_id uuid not null,
  subject_google text not null,
  versao bigint not null,
  resultado text not null check (resultado in ('desconectado','conflito','cancelada')),
  primary key(usuario_id,operacao_id)
);
create table identidade.agenda_google_vinculo_paciente (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  subject_google text not null,
  evento_id text not null check (evento_id ~ '^[A-Za-z0-9_-]{1,1024}$'),
  paciente_id uuid not null,
  criado_em timestamptz not null default clock_timestamp(),
  retirado_em timestamptz,
  constraint agenda_google_vinculo_ordem check (retirado_em is null or retirado_em>=criado_em)
);
create unique index agenda_google_vinculo_ativo on identidade.agenda_google_vinculo_paciente(usuario_id,subject_google,evento_id) where retirado_em is null;
create table identidade.agenda_google_escrita (
  usuario_id uuid not null,
  operacao_id uuid not null,
  evento_id text not null check (evento_id ~ '^[A-Za-z0-9_-]{1,1024}$'),
  acao text not null check (acao in ('criar','alterar','cancelar')),
  subject_google text not null,
  estado text not null check (estado in ('pendente','confirmada','nao_realizada')),
  primary key(usuario_id,operacao_id)
);
create unique index agenda_google_escrita_unica_pendente on identidade.agenda_google_escrita(usuario_id) where estado='pendente';
create table identidade.agenda_google_requisicao (
  request_id uuid primary key,
  expira_em timestamptz not null
);
create table identidade.agenda_google_geracao (
  usuario_id uuid primary key,
  geracao bigint not null default 0
);
create table identidade.agenda_google_state (
  hash text primary key check (hash ~ '^[0-9a-f]{64}$'),
  usuario_id uuid not null,
  sessao_id uuid not null,
  geracao bigint not null,
  selado text not null check (octet_length(selado) between 1 and 2048),
  expira_em timestamptz not null default (clock_timestamp() + interval '10 minutes')
);
create table identidade.agenda_google_credencial (
  usuario_id uuid primary key,
  subject_google text not null check (length(subject_google) between 1 and 255),
  geracao bigint not null,
  segredo_id uuid not null unique
);
revoke all on identidade.agenda_google_state, identidade.agenda_google_credencial, identidade.agenda_google_geracao, identidade.agenda_google_requisicao, identidade.agenda_google_escrita, identidade.agenda_google_vinculo_paciente, identidade.agenda_google_desconexao_recibo from public, anon, authenticated, service_role;

-- Owner do Vault é isolado e só recebe chamada vinculada ao usuário em contexto.
grant select (usuario_id, segredo_id) on identidade.agenda_google_credencial to ffcmapp_agenda_vault_owner;
reset role;
select set_config('role',current_setting('ffcmapp.migrador_agenda'),false);
grant create on schema identidade to ffcmapp_agenda_vault_owner;
set role ffcmapp_agenda_vault_owner;
create function identidade.agenda_google_vault(p_segredo uuid, p_excluir boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare v_usuario uuid := nullif(current_setting('ffcmapp.agenda_usuario',true),'')::uuid; v_valor text;
begin
 if v_usuario is null or p_segredo is null or p_excluir is null or not exists
   (select 1 from identidade.agenda_google_credencial c where c.usuario_id=v_usuario and c.segredo_id=p_segredo) then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if p_excluir then
  delete from vault.secrets where id=p_segredo;
  return null;
 end if;
 select d.decrypted_secret into v_valor from vault.decrypted_secrets d where d.id=p_segredo;
 return v_valor;
end $$;
revoke all on function identidade.agenda_google_vault(uuid,boolean) from public, anon, authenticated, service_role;
grant execute on function identidade.agenda_google_vault(uuid,boolean) to ffcmapp_agenda_google_owner;
reset role;
select set_config('role',current_setting('ffcmapp.migrador_agenda'),false);
revoke create on schema identidade from ffcmapp_agenda_vault_owner;
set role ffcmapp_agenda_google_owner;


-- Contexto interno somente após verificação do atestado pelo wrapper privado.
-- Funções auxiliares não têm grants para executor ou papéis públicos.
create function identidade.agenda_google_contexto()
returns table(usuario_id uuid, sessao_id uuid) language sql stable security definer set search_path = '' as $$
  select nullif(current_setting('ffcmapp.agenda_usuario',true),'')::uuid,
    nullif(current_setting('ffcmapp.agenda_sessao',true),'')::uuid
$$;

create function identidade.agenda_google_registrar_state(p_hash text, p_selado text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_usuario uuid; v_sessao uuid; v_geracao bigint;
begin
  select c.usuario_id,c.sessao_id into v_usuario,v_sessao from identidade.agenda_google_contexto() c;
  if v_usuario is null or p_hash !~ '^[0-9a-f]{64}$' or p_selado is null or octet_length(p_selado) not between 1 and 2048 then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_usuario::text, 0));
  insert into identidade.agenda_google_geracao(usuario_id) values(v_usuario) on conflict do nothing;
  select geracao into v_geracao from identidade.agenda_google_geracao where usuario_id=v_usuario;
  insert into identidade.agenda_google_state(hash,usuario_id,sessao_id,geracao,selado) values(p_hash,v_usuario,v_sessao,v_geracao,p_selado);
  return true;
end $$;

-- DELETE é a única operação de consumo: chamadas concorrentes não recebem a mesma linha.
create function identidade.agenda_google_consumir_state(p_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_usuario uuid; v_sessao uuid; v_selado text; v_geracao bigint;
begin
  select c.usuario_id,c.sessao_id into v_usuario,v_sessao from identidade.agenda_google_contexto() c;
  if v_usuario is null or p_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  delete from identidade.agenda_google_state s where s.hash=p_hash and s.usuario_id=v_usuario
    and s.sessao_id=v_sessao and s.expira_em>clock_timestamp() returning s.selado,s.geracao into v_selado,v_geracao;
  if v_selado is null then return null; end if;
  return pg_catalog.jsonb_build_object('selado',v_selado,'geracao',v_geracao::text);
end $$;

-- O armazenamento e a substituição são transacionais; erro não remove segredo vigente.
create function identidade.agenda_google_salvar_credencial(p_refresh text, p_geracao bigint, p_subject text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_usuario uuid; v_sessao uuid; v_antigo uuid; v_novo uuid; v_geracao bigint;
begin
  select c.usuario_id,c.sessao_id into v_usuario,v_sessao from identidade.agenda_google_contexto() c;
  if v_usuario is null or p_refresh is null or octet_length(p_refresh) not between 1 and 4096
    or p_subject is null or length(p_subject) not between 1 and 255 then return false; end if;
  if not exists (select 1 from identidade.sessao s join identidade.concessao_equipe c on c.id=s.concessao_id
    join auth_privado.identidades() i on i.user_id=s.usuario_id and i.provider='google' and i.provider_id=c.subject_google
    where s.usuario_id=v_usuario and s.session_id=v_sessao and c.subject_google=p_subject) then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_usuario::text, 0));
  select geracao into v_geracao from identidade.agenda_google_geracao where usuario_id=v_usuario;
  if v_geracao is null or v_geracao is distinct from p_geracao then return false; end if;
  update identidade.agenda_google_geracao set geracao=geracao+1 where usuario_id=v_usuario returning geracao into v_geracao;
  select segredo_id into v_antigo from identidade.agenda_google_credencial where usuario_id=v_usuario for update;
  v_novo := vault.create_secret(p_refresh, null, null, null);
  if v_antigo is not null then perform identidade.agenda_google_vault(v_antigo,true); end if;
  insert into identidade.agenda_google_credencial(usuario_id,subject_google,geracao,segredo_id) values(v_usuario,p_subject,v_geracao,v_novo)
    on conflict(usuario_id) do update set subject_google=excluded.subject_google,geracao=excluded.geracao,segredo_id=excluded.segredo_id;
  return true;
end $$;
create function identidade.agenda_google_ler_credencial()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_usuario uuid; v_sessao uuid; v_refresh text; v_atual text; v_registrado text; v_geracao bigint;
begin
  select c.usuario_id,c.sessao_id into v_usuario,v_sessao from identidade.agenda_google_contexto() c;
  if v_usuario is null then return null; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_usuario::text, 0));
  select con.subject_google into v_atual from identidade.sessao s
    join identidade.concessao_equipe con on con.id=s.concessao_id
    where s.usuario_id=v_usuario and s.session_id=v_sessao;
  select c.subject_google into v_registrado from identidade.agenda_google_credencial c where c.usuario_id=v_usuario;
  if v_registrado is not null and v_registrado is distinct from v_atual then
    perform identidade.agenda_google_revogar_credencial();
    return null;
  end if;
  select identidade.agenda_google_vault(c.segredo_id,false),c.geracao into v_refresh,v_geracao from identidade.agenda_google_credencial c
    join identidade.sessao s on s.usuario_id=c.usuario_id and s.session_id=v_sessao
    join identidade.concessao_equipe con on con.id=s.concessao_id and con.subject_google=c.subject_google
    join auth_privado.identidades() i on i.user_id=c.usuario_id and i.provider='google' and i.provider_id=c.subject_google
    where c.usuario_id=v_usuario;
  if v_refresh is null then return null; end if;
  return pg_catalog.jsonb_build_object('refresh',v_refresh,'geracao',v_geracao::text);
end $$;
create function identidade.agenda_google_revogar_credencial()
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_usuario uuid; v_sessao uuid; v_segredo uuid;
begin
  select c.usuario_id,c.sessao_id into v_usuario,v_sessao from identidade.agenda_google_contexto() c;
  if v_usuario is null then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_usuario::text, 0));
  insert into identidade.agenda_google_geracao(usuario_id,geracao) values(v_usuario,1)
    on conflict(usuario_id) do update set geracao=identidade.agenda_google_geracao.geracao+1;
  select segredo_id into v_segredo from identidade.agenda_google_credencial where usuario_id=v_usuario;
  if v_segredo is not null then perform identidade.agenda_google_vault(v_segredo,true); end if;
  delete from identidade.agenda_google_credencial where usuario_id=v_usuario;
  delete from identidade.agenda_google_state where usuario_id=v_usuario;
  return true;
end $$;
-- O executor apresenta atestado emitido após validação do JWT no servidor. O valor sensível
-- viaja separado do envelope assinado, ligado por SHA-256; proteger parâmetros
-- contra logs continua sendo pré-condição. Nenhum executor recebe grant aqui.
create function identidade.agenda_google_operacao_privada(p_transporte jsonb, p_valor text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e jsonb := p_transporte->'entrada'; a jsonb := e->'atestado';
  v_usuario uuid; v_sessao uuid; v_req uuid; v_inicio timestamptz; v_fim timestamptz;
  v_acao text; v_resultado jsonb; v_valor_hash text;
begin
  if jsonb_typeof(p_transporte) is distinct from 'object'
    or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
    or jsonb_typeof(e) is distinct from 'object'
    or e - array['request_id','hash','valor_hash','geracao','subject','operacao_id','evento_id','acao','desfecho','paciente_id','vinculo_id','eventos','atestado'] <> '{}'::jsonb
    or jsonb_typeof(a) is distinct from 'object' then
    raise exception using errcode='42501', message='SEM_PERMISSAO';
  end if;
  begin
    v_usuario := (a->>'usuario_id')::uuid; v_sessao := (a->>'session_id')::uuid;
    v_req := (e->>'request_id')::uuid;
    v_inicio := (a->>'emitido_em')::timestamptz; v_fim := (a->>'expira_em')::timestamptz;
    v_acao := a->>'operacao';
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode='42501', message='SEM_PERMISSAO';
  end;
  if v_usuario is null or v_sessao is null or v_req is null or v_inicio is null or v_fim is null
    or v_acao not in ('agenda.registrar','agenda.consumir','agenda.salvar','agenda.ler','agenda.revogar','agenda.reservar_escrita','agenda.pendencia','agenda.resolver_escrita','agenda.vincular','agenda.retirar_vinculo','agenda.consultar_vinculos','agenda.desconectar','agenda.status_conexao','agenda.consultar_desconexao','agenda.cancelar_desconexao')
    or v_acao is null or a->>'usuario_id' is distinct from v_usuario::text
    or a->>'session_id' is distinct from v_sessao::text or a->>'request_id' is distinct from v_req::text
    or v_inicio>clock_timestamp() or v_fim<=clock_timestamp() or v_fim<=v_inicio or v_fim-v_inicio>interval '30 seconds'
    or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then
    raise exception using errcode='42501', message='SEM_PERMISSAO';
  end if;
  perform set_config('ffcmapp.agenda_usuario',v_usuario::text,true);
  perform set_config('ffcmapp.agenda_sessao',v_sessao::text,true);
  -- Mesma ordem das operações privadas: concessão, usuário, sessão.
  perform 1 from identidade.concessao_equipe c where c.usuario_id=v_usuario and c.estado='vinculada' for share;
  if not found then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
  perform 1 from public.usuario u where u.id=v_usuario and u.ativo for share;
  if not found then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
  perform 1 from identidade.sessao s where s.usuario_id=v_usuario and s.session_id=v_sessao
    and s.revogada_em is null and s.encerrada_em is null for share;
  if not found then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
  if not exists (
    select 1 from identidade.sessao s
    join public.usuario u on u.id=s.usuario_id and u.ativo
    join identidade.concessao_equipe c on c.id=s.concessao_id and c.usuario_id=u.id
      and c.estado='vinculada' and c.metodo='google_workspace' and c.perfil=u.perfil
      and c.perfil in ('administrador','profissional')
    join auth_privado.sessoes() auth_s on auth_s.id=s.session_id and auth_s.user_id=u.id
      and (auth_s.not_after is null or auth_s.not_after>clock_timestamp())
    join auth_privado.identidades() i on i.user_id=u.id and i.provider='google'
      and i.provider_id=c.subject_google and i.identity_data->>'sub'=i.provider_id
      and i.identity_data->>'email_verified'='true'
    join identidade.configuracao_auth_nativo conf on conf.google_unico_oauth_confirmado
      and i.identity_data#>>'{custom_claims,hd}'=conf.dominio_workspace
    where s.usuario_id=v_usuario and s.session_id=v_sessao and s.metodo='google_workspace'
      and s.revogada_em is null and s.encerrada_em is null
      and (select count(*) from auth_privado.identidades() j where j.user_id=u.id and j.provider='google')=1
  ) then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
  if p_valor is not null then
    v_valor_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(p_valor,'UTF8'),'sha256'),'hex');
  end if;
  if e->>'valor_hash' is distinct from v_valor_hash then raise exception using errcode='42501', message='SEM_PERMISSAO'; end if;
  insert into identidade.agenda_google_requisicao(request_id,expira_em) values(v_req,v_fim) on conflict do nothing;
  if not found then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
  case v_acao
    when 'agenda.registrar' then v_resultado := to_jsonb(identidade.agenda_google_registrar_state(e->>'hash',p_valor));
    when 'agenda.consumir' then v_resultado := identidade.agenda_google_consumir_state(e->>'hash');
    when 'agenda.salvar' then
      if coalesce(e->>'geracao','') !~ '^[0-9]{1,18}$' then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
      v_resultado := to_jsonb(identidade.agenda_google_salvar_credencial(p_valor,(e->>'geracao')::bigint,e->>'subject'));
    when 'agenda.ler' then v_resultado := identidade.agenda_google_ler_credencial();
    when 'agenda.revogar' then v_resultado := to_jsonb(identidade.agenda_google_revogar_credencial());
    when 'agenda.status_conexao' then
      declare v_geracao bigint; v_conectado boolean;
      begin
        if not exists(select 1 from identidade.sessao s join identidade.concessao_equipe c on c.id=s.concessao_id
          where s.usuario_id=v_usuario and s.session_id=v_sessao and c.subject_google=e->>'subject') then
          raise exception using errcode='42501',message='SEM_PERMISSAO';
        end if;
        perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_usuario::text, 0));
        insert into identidade.agenda_google_geracao(usuario_id) values(v_usuario) on conflict do nothing;
        select geracao into v_geracao from identidade.agenda_google_geracao where usuario_id=v_usuario;
        select exists(select 1 from identidade.agenda_google_credencial g where g.usuario_id=v_usuario and g.subject_google=e->>'subject') into v_conectado;
        v_resultado := jsonb_build_object('estado',case when v_conectado then 'conectado' else 'desconectado' end,'versao',v_geracao::text);
      end;
    when 'agenda.cancelar_desconexao' then
      declare v_recibo record; v_geracao bigint; v_conectado boolean; v_desfecho text;
      begin
        if coalesce(e->>'operacao_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          or coalesce(e->>'geracao','') !~ '^(0|[1-9][0-9]{0,17})$'
          or not exists(select 1 from identidade.sessao s join identidade.concessao_equipe c on c.id=s.concessao_id
            where s.usuario_id=v_usuario and s.session_id=v_sessao and c.subject_google=e->>'subject') then
          raise exception using errcode='42501',message='SEM_PERMISSAO';
        end if;
        -- Mesmo lock de desconectar: cancelamento e pedido atrasado têm ordem única.
        perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_usuario::text, 0));
        select * into v_recibo from identidade.agenda_google_desconexao_recibo r where r.usuario_id=v_usuario and r.operacao_id=(e->>'operacao_id')::uuid;
        if found then
          if v_recibo.subject_google is distinct from e->>'subject' or v_recibo.versao::text is distinct from e->>'geracao' then
            raise exception using errcode='42501',message='SEM_PERMISSAO';
          end if;
          v_desfecho := v_recibo.resultado;
        else
          insert into identidade.agenda_google_desconexao_recibo(usuario_id,operacao_id,subject_google,versao,resultado)
            values(v_usuario,(e->>'operacao_id')::uuid,e->>'subject',(e->>'geracao')::bigint,'cancelada');
          v_desfecho := 'cancelada';
        end if;
        select geracao into v_geracao from identidade.agenda_google_geracao where usuario_id=v_usuario;
        if v_geracao is null then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
        select exists(select 1 from identidade.agenda_google_credencial g where g.usuario_id=v_usuario and g.subject_google=e->>'subject') into v_conectado;
        v_resultado := jsonb_build_object('estado',v_desfecho,'conexao_atual',case when v_conectado then 'conectado' else 'desconectado' end,'versao_atual',v_geracao::text);
      end;
    when 'agenda.consultar_desconexao' then
      declare v_recibo record; v_geracao bigint; v_conectado boolean;
      begin
        if coalesce(e->>'operacao_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          or not exists(select 1 from identidade.sessao s join identidade.concessao_equipe c on c.id=s.concessao_id
            where s.usuario_id=v_usuario and s.session_id=v_sessao and c.subject_google=e->>'subject') then
          raise exception using errcode='42501',message='SEM_PERMISSAO';
        end if;
        perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_usuario::text, 0));
        select * into v_recibo from identidade.agenda_google_desconexao_recibo r
          where r.usuario_id=v_usuario and r.operacao_id=(e->>'operacao_id')::uuid and r.subject_google=e->>'subject';
        if not found then
          v_resultado := jsonb_build_object('estado','desconhecido');
        else
          select geracao into v_geracao from identidade.agenda_google_geracao where usuario_id=v_usuario;
          select exists(select 1 from identidade.agenda_google_credencial g where g.usuario_id=v_usuario and g.subject_google=e->>'subject') into v_conectado;
          v_resultado := jsonb_build_object('estado',v_recibo.resultado,'conexao_atual',case when v_conectado then 'conectado' else 'desconectado' end,'versao_atual',v_geracao::text);
        end if;
      end;
    when 'agenda.desconectar' then
      declare v_geracao bigint; v_subject text; v_recibo record; v_desfecho text; v_conectado boolean;
      begin
        if coalesce(e->>'subject','')='' or coalesce(e->>'geracao','') !~ '^[0-9]{1,18}$'
          or coalesce(e->>'operacao_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
          raise exception using errcode='42501',message='SEM_PERMISSAO';
        end if;
        perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_usuario::text, 0));
        if not exists(select 1 from identidade.sessao s join identidade.concessao_equipe c on c.id=s.concessao_id
          where s.usuario_id=v_usuario and s.session_id=v_sessao and c.subject_google=e->>'subject') then
          raise exception using errcode='42501',message='SEM_PERMISSAO';
        end if;
        select * into v_recibo from identidade.agenda_google_desconexao_recibo r where r.usuario_id=v_usuario and r.operacao_id=(e->>'operacao_id')::uuid;
        if found then
          if v_recibo.subject_google is distinct from e->>'subject' or v_recibo.versao::text is distinct from e->>'geracao' then
            raise exception using errcode='42501',message='SEM_PERMISSAO';
          end if;
          v_resultado := jsonb_build_object('estado',v_recibo.resultado);
        else
          insert into identidade.agenda_google_geracao(usuario_id) values(v_usuario) on conflict do nothing;
          select geracao into v_geracao from identidade.agenda_google_geracao where usuario_id=v_usuario;
          select g.subject_google into v_subject from identidade.agenda_google_credencial g where g.usuario_id=v_usuario;
          if v_geracao::text is distinct from e->>'geracao' or (v_subject is not null and v_subject is distinct from e->>'subject') then
            v_desfecho := 'conflito';
          else
            perform identidade.agenda_google_revogar_credencial();
            insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
              values(gen_random_uuid(),v_usuario,'agenda.desconectar','usuario',v_usuario,'permitido',v_req);
            v_desfecho := 'desconectado';
          end if;
          insert into identidade.agenda_google_desconexao_recibo(usuario_id,operacao_id,subject_google,versao,resultado)
            values(v_usuario,(e->>'operacao_id')::uuid,e->>'subject',(e->>'geracao')::bigint,v_desfecho);
          v_resultado := jsonb_build_object('estado',v_desfecho);
        end if;
        select geracao into v_geracao from identidade.agenda_google_geracao where usuario_id=v_usuario;
        select exists(select 1 from identidade.agenda_google_credencial g where g.usuario_id=v_usuario and g.subject_google=e->>'subject') into v_conectado;
        v_resultado := v_resultado || jsonb_build_object('conexao_atual',case when v_conectado then 'conectado' else 'desconectado' end,'versao_atual',v_geracao::text);
      end;
    when 'agenda.consultar_vinculos' then
      if jsonb_typeof(e->'eventos') is distinct from 'array' or jsonb_array_length(e->'eventos') not between 1 and 250
        or exists(select 1 from jsonb_array_elements(e->'eventos') x where jsonb_typeof(x)<>'string' or (x#>>'{}') !~ '^[A-Za-z0-9_-]{1,1024}$')
        or coalesce(e->>'geracao','') !~ '^[0-9]{1,18}$' then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_usuario::text, 0));
      if not exists (select 1 from identidade.sessao s join identidade.concessao_equipe c on c.id=s.concessao_id
        join identidade.agenda_google_credencial g on g.usuario_id=s.usuario_id and g.subject_google=c.subject_google
        where s.usuario_id=v_usuario and s.session_id=v_sessao and c.perfil='profissional'
          and c.subject_google=e->>'subject' and g.geracao=(e->>'geracao')::bigint) then
        raise exception using errcode='42501',message='SEM_PERMISSAO';
      end if;
      -- Mantém revogação de acesso bloqueada até concluir leitura e auditoria.
      perform 1 from cadastro.acesso_paciente ap join identidade.agenda_google_vinculo_paciente v on v.paciente_id=ap.paciente_id
        where ap.usuario_id=v_usuario and ap.revogada_em is null and v.usuario_id=v_usuario
          and v.subject_google=e->>'subject' and v.retirado_em is null and v.evento_id in (select jsonb_array_elements_text(e->'eventos')) for share of ap;
      select coalesce(jsonb_agg(jsonb_build_object('evento_id',v.evento_id,'vinculo_id',v.id,'paciente',jsonb_build_object('paciente_id',p.id,'nome',p.nome_cifrado,'nome_preferencia',p.nome_preferencia_cifrado,'versao',p.versao)) order by v.evento_id),'[]'::jsonb)
        into v_resultado from identidade.agenda_google_vinculo_paciente v
        join cadastro.paciente p on p.id=v.paciente_id
        join cadastro.acesso_paciente ap on ap.paciente_id=v.paciente_id and ap.usuario_id=v_usuario and ap.revogada_em is null
        where v.usuario_id=v_usuario and v.subject_google=e->>'subject' and v.retirado_em is null and v.evento_id in (select jsonb_array_elements_text(e->'eventos'));
      insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
        select gen_random_uuid(),v_usuario,'agenda.consultar_vinculo','paciente',v.paciente_id,'permitido',v_req
        from identidade.agenda_google_vinculo_paciente v
        join cadastro.acesso_paciente ap on ap.paciente_id=v.paciente_id and ap.usuario_id=v_usuario and ap.revogada_em is null
        where v.usuario_id=v_usuario and v.subject_google=e->>'subject' and v.retirado_em is null and v.evento_id in (select jsonb_array_elements_text(e->'eventos'));
    when 'agenda.vincular' then
      declare v_paciente uuid; v_existente uuid;
      begin
        if coalesce(e->>'paciente_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          or coalesce(e->>'evento_id','') !~ '^[A-Za-z0-9_-]{1,1024}$' then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
        v_paciente := (e->>'paciente_id')::uuid;
        if coalesce(e->>'geracao','') !~ '^[0-9]{1,18}$' then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
        perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_usuario::text, 0));
        if not exists (select 1 from identidade.sessao s join identidade.concessao_equipe c on c.id=s.concessao_id
          join identidade.agenda_google_credencial g on g.usuario_id=s.usuario_id and g.subject_google=c.subject_google
          where s.usuario_id=v_usuario and s.session_id=v_sessao and c.perfil='profissional' and c.subject_google=e->>'subject' and g.geracao=(e->>'geracao')::bigint) then
          raise exception using errcode='42501',message='SEM_PERMISSAO';
        end if;
        perform 1 from cadastro.acesso_paciente ap where ap.usuario_id=v_usuario and ap.paciente_id=v_paciente and ap.revogada_em is null for share;
        if not found then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
        insert into identidade.agenda_google_vinculo_paciente(usuario_id,subject_google,evento_id,paciente_id)
          values(v_usuario,e->>'subject',e->>'evento_id',v_paciente) on conflict do nothing;
        select paciente_id into v_existente from identidade.agenda_google_vinculo_paciente
          where usuario_id=v_usuario and subject_google=e->>'subject' and evento_id=e->>'evento_id' and retirado_em is null;
        insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
          values(gen_random_uuid(),v_usuario,'agenda.vincular','paciente',v_paciente,case when v_existente=v_paciente then 'permitido' else 'negado' end,v_req);
        v_resultado := jsonb_build_object('estado',case when v_existente=v_paciente then 'vinculado' else 'conflito' end);
      end;
    when 'agenda.retirar_vinculo' then
      declare v_paciente uuid; v_vinculo uuid; v_retirado timestamptz;
      begin
        if coalesce(e->>'paciente_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          or coalesce(e->>'vinculo_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          or coalesce(e->>'evento_id','') !~ '^[A-Za-z0-9_-]{1,1024}$'
          or coalesce(e->>'geracao','') !~ '^[0-9]{1,18}$' then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
        v_paciente := (e->>'paciente_id')::uuid; v_vinculo := (e->>'vinculo_id')::uuid;
        perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_usuario::text, 0));
        if not exists (select 1 from identidade.sessao s join identidade.concessao_equipe c on c.id=s.concessao_id
          join identidade.agenda_google_credencial g on g.usuario_id=s.usuario_id and g.subject_google=c.subject_google
          where s.usuario_id=v_usuario and s.session_id=v_sessao and c.perfil='profissional' and c.subject_google=e->>'subject' and g.geracao=(e->>'geracao')::bigint) then
          raise exception using errcode='42501',message='SEM_PERMISSAO';
        end if;
        perform 1 from cadastro.acesso_paciente ap where ap.usuario_id=v_usuario and ap.paciente_id=v_paciente and ap.revogada_em is null for share;
        if not found then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
        select retirado_em into v_retirado from identidade.agenda_google_vinculo_paciente
          where id=v_vinculo and usuario_id=v_usuario and subject_google=e->>'subject' and evento_id=e->>'evento_id' and paciente_id=v_paciente for update;
        if found then
          if v_retirado is null then update identidade.agenda_google_vinculo_paciente set retirado_em=clock_timestamp() where id=v_vinculo; end if;
          insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
            values(gen_random_uuid(),v_usuario,'agenda.retirar_vinculo','paciente',v_paciente,'permitido',v_req);
          v_resultado := jsonb_build_object('estado','retirado');
        else
          insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
            values(gen_random_uuid(),v_usuario,'agenda.retirar_vinculo','paciente',v_paciente,'negado',v_req);
          v_resultado := jsonb_build_object('estado','nao_encontrado');
        end if;
      end;
    when 'agenda.pendencia' then
      select case when w.subject_google=(select c.subject_google from identidade.sessao s join identidade.concessao_equipe c on c.id=s.concessao_id where s.usuario_id=v_usuario and s.session_id=v_sessao)
        then jsonb_build_object('operacao_id',w.operacao_id,'evento_id',w.evento_id,'acao',w.acao)
        else jsonb_build_object('conta_anterior',true) end into v_resultado
        from identidade.agenda_google_escrita w where w.usuario_id=v_usuario and w.estado='pendente';
    when 'agenda.reservar_escrita' then
      if coalesce(e->>'operacao_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or coalesce(e->>'evento_id','') !~ '^[A-Za-z0-9_-]{1,1024}$'
        or coalesce(e->>'acao','') not in ('criar','alterar','cancelar')
        or not exists (select 1 from identidade.sessao s join identidade.concessao_equipe c on c.id=s.concessao_id where s.usuario_id=v_usuario and s.session_id=v_sessao and c.subject_google=e->>'subject') then
        raise exception using errcode='42501',message='SEM_PERMISSAO';
      end if;
      begin
      insert into identidade.agenda_google_escrita(usuario_id,operacao_id,evento_id,acao,subject_google,estado)
        values(v_usuario,(e->>'operacao_id')::uuid,e->>'evento_id',e->>'acao',e->>'subject','pendente')
        on conflict(usuario_id,operacao_id) do update set estado='pendente'
        where identidade.agenda_google_escrita.estado='nao_realizada'
          and identidade.agenda_google_escrita.evento_id=excluded.evento_id and identidade.agenda_google_escrita.acao=excluded.acao
          and identidade.agenda_google_escrita.subject_google=excluded.subject_google;
      v_resultado := to_jsonb(found);
      exception when unique_violation then v_resultado := 'false'::jsonb; end;
    when 'agenda.resolver_escrita' then
      if coalesce(e->>'operacao_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception using errcode='42501',message='SEM_PERMISSAO';
      end if;
      if coalesce(e->>'desfecho','') not in ('confirmada','nao_realizada') then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
      update identidade.agenda_google_escrita set estado=e->>'desfecho'
        where usuario_id=v_usuario and operacao_id=(e->>'operacao_id')::uuid and estado='pendente'
          and subject_google=e->>'subject'
          and exists(select 1 from identidade.sessao s join identidade.concessao_equipe c on c.id=s.concessao_id where s.usuario_id=v_usuario and s.session_id=v_sessao and c.subject_google=e->>'subject');
      v_resultado := to_jsonb(found);
  end case;
  if v_fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=v_sessao and s.user_id=v_usuario and (s.not_after is null or s.not_after>clock_timestamp())) then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
  return v_resultado;
end $$;
revoke all on function identidade.agenda_google_contexto(), identidade.agenda_google_registrar_state(text,text),
  identidade.agenda_google_consumir_state(text), identidade.agenda_google_salvar_credencial(text,bigint,text),
  identidade.agenda_google_ler_credencial(), identidade.agenda_google_revogar_credencial(),
  identidade.agenda_google_operacao_privada(jsonb,text)
  from public, anon, authenticated, service_role;
grant execute on function identidade.agenda_google_operacao_privada(jsonb,text) to ffcmapp_agenda_google_executor;
reset role;
select set_config('role', current_setting('ffcmapp.migrador_agenda'), false);
revoke create on schema identidade from ffcmapp_agenda_google_owner;
revoke ffcmapp_agenda_google_owner from current_user;

revoke ffcmapp_agenda_vault_owner from current_user;
