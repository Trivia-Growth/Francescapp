-- Apenas PostgreSQL descartável e Vault fictício do runner existente.
\set ON_ERROR_STOP on
\ir fundacao_verificador_nativo_local.sql
create role service_role nologin;
create table auth.sessions(id uuid primary key, user_id uuid not null, not_after timestamptz);
create table auth.identities(user_id uuid, provider text, provider_id text, identity_data jsonb);
create table identidade.configuracao_auth_nativo(dominio_workspace text, google_unico_oauth_confirmado boolean);
insert into identidade.configuracao_auth_nativo values ('fixture.example',true);
create or replace function auth.jwt() returns jsonb language sql as $$
  select jsonb_build_object('session_id',current_setting('ffcm_fixture.sessao',true),
    'amr',case when current_setting('ffcm_fixture.oauth',true)='sim' then '[{"method":"oauth"}]'::jsonb else '[]'::jsonb end)
$$;
alter table identidade.sessao add column encerrada_em timestamptz;
\ir ../drafts/20261106120000_carteira_nativa_autorizacao_experimento.sql
update identidade.referencias_atestado_vault set ativa=true where referencia='ffcmapp.atestado.teste';
begin;
insert into auth.users(id) values ('aa000000-0000-4000-8000-000000000001');
insert into public.usuario(id,perfil) values ('aa000000-0000-4000-8000-000000000001','administrador');
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,vinculada_em)
values ('aa000000-0000-4000-8000-000000000002','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','carteira-nativa-fixture','administrador','google_workspace','vinculada','aa000000-0000-4000-8000-000000000001','carteira-nativa-fixture','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',clock_timestamp());
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
values ('aa000000-0000-4000-8000-000000000003','aa000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000002',1,'google_workspace');
insert into auth.sessions(id,user_id) values ('aa000000-0000-4000-8000-000000000003','aa000000-0000-4000-8000-000000000001');
insert into auth.identities values ('aa000000-0000-4000-8000-000000000001','google','carteira-nativa-fixture',
  '{"sub":"carteira-nativa-fixture","email_verified":true,"custom_claims":{"hd":"fixture.example"}}');
select set_config('ffcm_fixture.usuario','aa000000-0000-4000-8000-000000000001',true);
select set_config('ffcm_fixture.sessao','aa000000-0000-4000-8000-000000000003',true);
select set_config('ffcm_fixture.oauth','sim',true);
do $$
declare e text := '{"limite":1}'; d text; mac text;
begin
  if has_function_privilege('authenticated','experimento_atestado.autorizar_carteira_nativa_fixture(text,text,jsonb,jsonb,text)','execute')
    or has_function_privilege('anon','experimento_atestado.autorizar_carteira_nativa_fixture(text,text,jsonb,jsonb,text)','execute') then
    raise exception 'função exposta';
  end if;
  d:=jsonb_build_object('key_id','teste','digest_entrada',translate(rtrim(encode(extensions.digest(convert_to(e,'UTF8'),'sha256'),'base64'),'='),'+/','-_'),
    'usuario_id',auth.uid(),'session_id',auth.jwt()->>'session_id','operacao','api.listar_pacientes',
    'emitido_em',clock_timestamp()-interval '1 second','expira_em',clock_timestamp()+interval '20 seconds')::text;
  mac:=translate(rtrim(encode(extensions.hmac(convert_to('ffcmapp:atestado:v1:'||d,'UTF8'),decode(repeat('42',32),'hex'),'sha256'),'base64'),'='),'+/','-_');
  if experimento_atestado.autorizar_carteira_nativa_fixture(e,d,e::jsonb,d::jsonb,mac) is distinct from true then raise exception 'autorização válida recusada'; end if;
  if experimento_atestado.autorizar_carteira_nativa_fixture(e,d,'{"limite":2}'::jsonb,d::jsonb,mac) is distinct from false then raise exception 'entrada adulterada aceita'; end if;
  if experimento_atestado.autorizar_carteira_nativa_fixture(e,d,e::jsonb,d::jsonb,repeat('A',43)) is distinct from false then raise exception 'assinatura adulterada aceita'; end if;
  perform set_config('ffcm_fixture.oauth','nao',true);
  if experimento_atestado.autorizar_carteira_nativa_fixture(e,d,e::jsonb,d::jsonb,mac) is distinct from false then raise exception 'AMR divergente aceito'; end if;
  perform set_config('ffcm_fixture.oauth','sim',true);
  update auth.identities set identity_data=jsonb_set(identity_data,'{custom_claims,hd}','"outro.example"');
  if experimento_atestado.autorizar_carteira_nativa_fixture(e,d,e::jsonb,d::jsonb,mac) is distinct from false then raise exception 'domínio divergente aceito'; end if;
  update auth.identities set identity_data=jsonb_set(identity_data,'{custom_claims,hd}','"fixture.example"');
  update identidade.sessao set metodo='tecnica' where session_id='aa000000-0000-4000-8000-000000000003';
  if experimento_atestado.autorizar_carteira_nativa_fixture(e,d,e::jsonb,d::jsonb,mac) is distinct from false then raise exception 'método divergente aceito'; end if;
  update identidade.sessao set metodo='google_workspace' where session_id='aa000000-0000-4000-8000-000000000003';
  update identidade.sessao set encerrada_em=clock_timestamp() where session_id='aa000000-0000-4000-8000-000000000003';
  if experimento_atestado.autorizar_carteira_nativa_fixture(e,d,e::jsonb,d::jsonb,mac) is distinct from false then raise exception 'sessão encerrada aceita'; end if;
end $$;
rollback;
