-- Somente banco descartável; não prova gateway, Vault nem operação remota.
\set ON_ERROR_STOP on
do $$ begin
 if current_database() <> 'ffcm_saida_teste_local' or inet_server_addr() is not null
    or current_setting('unix_socket_directories') not like '%/ffcm-saida.%' then
   raise exception 'Cluster local descartável obrigatório';
 end if;
end $$;
create role anon nologin;
create role authenticated nologin;
create role ffcm_saida_owner nologin;
create role ffcm_saida_runtime nologin;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
\ir ../migrations/20261017113000_fundacao_identidade_cadastro.sql
create table identidade.prova_saida_fixture (
 session_id uuid primary key references identidade.sessao(session_id),
 usuario_id uuid not null references public.usuario(id),
 geracao bigint not null check (geracao > 0),
 verificador bytea not null check (octet_length(verificador)=32)
);
revoke all on identidade.prova_saida_fixture from public, anon, authenticated, ffcm_saida_runtime;
grant usage on schema identidade, auditoria, public to ffcm_saida_owner;
grant select(id) on identidade.concessao_equipe, public.usuario to ffcm_saida_owner;
grant select(session_id,usuario_id,concessao_id,revogada_em) on identidade.sessao to ffcm_saida_owner;
grant select(session_id,usuario_id,geracao,verificador) on identidade.prova_saida_fixture to ffcm_saida_owner;
grant update(id) on identidade.concessao_equipe, public.usuario to ffcm_saida_owner;
grant update(revogada_em,revogada_por_usuario_id,motivo_revogacao_cifrado) on identidade.sessao to ffcm_saida_owner;
grant update(session_id) on identidade.prova_saida_fixture to ffcm_saida_owner;
grant insert on auditoria.evento to ffcm_saida_owner;
create schema saida_fixture authorization ffcm_saida_owner;
grant usage on schema saida_fixture to ffcm_saida_runtime;
set role ffcm_saida_owner;
\ir ../drafts/20261102120000_saida_prova_experimento.sql
grant execute on function saida_fixture.revogar(uuid,uuid,bigint,bytea,jsonb,uuid) to ffcm_saida_runtime;
reset role;
insert into auth.users values ('10000000-0000-4000-8000-000000000001');
insert into public.usuario(id,perfil) values ('10000000-0000-4000-8000-000000000001','administrador');
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,vinculada_em)
 values ('20000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','ficticio','administrador','google_workspace','vinculada','10000000-0000-4000-8000-000000000001','ficticio','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',clock_timestamp());
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
 values ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,'google_workspace');
insert into identidade.prova_saida_fixture values ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'));
create function auditoria.falhar_fixture() returns trigger language plpgsql as $$
begin
 if current_setting('ffcm_teste.falha_auditoria',true)='sim' then raise exception 'falha fictícia' using errcode='23514'; end if;
 return new;
end $$;
create trigger falhar_fixture before insert on auditoria.evento for each row execute function auditoria.falhar_fixture();
set role ffcm_saida_runtime;
do $$
declare s uuid := '30000000-0000-4000-8000-000000000001'; u uuid := '10000000-0000-4000-8000-000000000001';
 h bytea := decode(repeat('01',32),'hex'); motivo jsonb := '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}';
begin
 if saida_fixture.revogar(s,u,2,h,motivo,gen_random_uuid()) is distinct from false
   or saida_fixture.revogar(s,u,1,decode(repeat('02',32),'hex'),motivo,gen_random_uuid()) is distinct from false
   or saida_fixture.revogar(s,'10000000-0000-4000-8000-000000000099',1,h,motivo,gen_random_uuid()) is distinct from false then
   raise exception 'prova ou identidade incorreta aceita';
 end if;
 begin perform * from identidade.sessao; raise exception 'leitura direta aceita'; exception when insufficient_privilege then null; end;
 perform set_config('ffcm_teste.falha_auditoria','sim',true);
 begin
   perform saida_fixture.revogar(s,u,1,h,motivo,gen_random_uuid());
   raise exception 'falha de auditoria aceita';
 exception when check_violation then null; end;
 perform set_config('ffcm_teste.falha_auditoria','não',true);
end $$;
reset role;
do $$ begin
 if exists (select 1 from identidade.sessao where revogada_em is not null)
    or exists (select 1 from auditoria.evento) then raise exception 'falha de auditoria deixou efeitos'; end if;
end $$;
set role ffcm_saida_runtime;
do $$
declare s uuid := '30000000-0000-4000-8000-000000000001'; u uuid := '10000000-0000-4000-8000-000000000001';
 h bytea := decode(repeat('01',32),'hex'); motivo jsonb := '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}';
begin
 if saida_fixture.revogar(s,u,1,h,motivo,'40000000-0000-4000-8000-000000000001') is distinct from true then raise exception 'saída válida negada'; end if;
 if saida_fixture.revogar(s,u,1,h,motivo,'40000000-0000-4000-8000-000000000002') is distinct from true then raise exception 'repetição negada'; end if;
end $$;
reset role;
do $$ begin
 if (select revogada_em is null from identidade.sessao limit 1) or (select count(*) from auditoria.evento where acao='sessao.sair') <> 1 then
   raise exception 'revogação ou auditoria incorreta';
 end if;
 if has_function_privilege('anon','saida_fixture.revogar(uuid,uuid,bigint,bytea,jsonb,uuid)','execute')
 or has_function_privilege('authenticated','saida_fixture.revogar(uuid,uuid,bigint,bytea,jsonb,uuid)','execute') then raise exception 'saída exposta'; end if;
 if has_column_privilege('ffcm_saida_owner','identidade.concessao_equipe','estado','update')
 or has_column_privilege('ffcm_saida_owner','public.usuario','ativo','update')
 or has_column_privilege('ffcm_saida_owner','identidade.prova_saida_fixture','verificador','update') then
   raise exception 'owner de teste pode alterar autoridade ou prova';
 end if;
end $$;
-- Demonstra que grants não substituem políticas RLS para o owner restrito.
alter table identidade.sessao enable row level security;
set role ffcm_saida_runtime;
do $$ begin
 if saida_fixture.revogar('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'),'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',gen_random_uuid()) is distinct from false then raise exception 'RLS ausente aceito'; end if;
end $$;
reset role;
-- Com RLS completo, nenhum papel público ou de runtime recebe acesso direto.
\ir ../migrations/20261026143000_fundacao_grants_rls.sql
\ir ../drafts/20261029110000_sessao_renovacao_fencing.sql
alter table identidade.prova_saida_fixture enable row level security;
\ir ../drafts/20261102130000_saida_rls_experimento.sql
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
 values ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,'google_workspace');
insert into identidade.prova_saida_fixture values ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'));
set role ffcm_saida_runtime;
do $$ begin
 if saida_fixture.revogar('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',1,decode(repeat('02',32),'hex'),'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',gen_random_uuid()) is distinct from false then raise exception 'prova incorreta aceita com RLS'; end if;
 if saida_fixture.revogar('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'),'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',gen_random_uuid()) is distinct from true then raise exception 'RLS negou saída válida'; end if;
 if saida_fixture.revogar('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'),'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',gen_random_uuid()) is distinct from true then raise exception 'RLS negou repetição de saída'; end if;
 for i in 1..5 loop
   begin
     execute (array['select id from public.usuario', 'select id from identidade.concessao_equipe', 'select session_id from identidade.sessao', 'select session_id from identidade.prova_saida_fixture', 'select id from auditoria.evento'])[i];
     raise exception 'leitura direta aceita';
   exception when insufficient_privilege then null; end;
   begin
     execute (array['update public.usuario set id=id', 'update identidade.concessao_equipe set id=id', 'update identidade.sessao set session_id=session_id', 'update identidade.prova_saida_fixture set session_id=session_id', 'update auditoria.evento set id=id'])[i];
     raise exception 'escrita direta aceita';
   exception when insufficient_privilege then null; end;
 end loop;
end $$;
reset role;
do $$ begin
 if not exists (select 1 from identidade.sessao where session_id='30000000-0000-4000-8000-000000000002' and revogada_em is not null)
    or (select count(*) from auditoria.evento where objeto_id='30000000-0000-4000-8000-000000000002') <> 1
    or pg_has_role('ffcm_saida_runtime','ffcm_saida_owner','member') then raise exception 'RLS ou isolamento incorreto'; end if;
end $$;
-- Conferir ACL efetiva por coluna separadamente das negações por RLS.
do $$
declare v_coluna record; v_privilegio text;
begin
 for v_coluna in
   select c.oid, a.attname from pg_class c join pg_namespace n on n.oid=c.relnamespace
   join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
   where (n.nspname,c.relname) in (('public','usuario'),('identidade','concessao_equipe'),
     ('identidade','sessao'),('identidade','prova_saida_fixture'),('auditoria','evento'))
 loop
   foreach v_privilegio in array array['SELECT','UPDATE','INSERT','REFERENCES'] loop
     if has_column_privilege('ffcm_saida_runtime',v_coluna.oid,v_coluna.attname,v_privilegio) then
       raise exception 'privilégio direto de coluna concedido ao runtime';
     end if;
   end loop;
 end loop;
end $$;
-- O proprietário restrito pode adquirir locks, mas não alterar dados de
-- identidade nem desfazer revogação, mesmo se seu papel for usado diretamente.
-- Simula outra policy permissiva: a proteção restritiva deve prevalecer.
create policy outra_usuario_fixture on public.usuario for update to ffcm_saida_owner using (true) with check (true);
create policy outra_concessao_fixture on identidade.concessao_equipe for update to ffcm_saida_owner using (true) with check (true);
create policy outra_prova_fixture on identidade.prova_saida_fixture for update to ffcm_saida_owner using (true) with check (true);
create policy outra_sessao_fixture on identidade.sessao for update to ffcm_saida_owner using (true) with check (true);
set role ffcm_saida_owner;
do $$
begin
 begin
   update public.usuario set id=id;
   raise exception 'owner alterou usuário';
 exception when insufficient_privilege then null; end;
 begin
   update identidade.concessao_equipe set id=id;
   raise exception 'owner alterou concessão';
 exception when insufficient_privilege then null; end;
 begin
   update identidade.prova_saida_fixture set session_id=session_id;
   raise exception 'owner alterou prova';
 exception when insufficient_privilege then null; end;
 begin
   update identidade.sessao set revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null
     where session_id='30000000-0000-4000-8000-000000000002';
   raise exception 'owner reabriu sessão';
 exception when insufficient_privilege or check_violation then null; end;
 begin
   update identidade.sessao set revogada_em=clock_timestamp()
     where session_id='30000000-0000-4000-8000-000000000002';
   raise exception 'owner alterou tombstone';
 exception when check_violation then null; end;
end $$;
reset role;
do $$ begin
 begin
   update identidade.sessao set motivo_revogacao_cifrado='{"formato":1,"key_id":"teste","nonce":"outro","ciphertext":"c","tag":"t"}'
     where session_id='30000000-0000-4000-8000-000000000002';
   raise exception 'motivo do tombstone alterado';
 exception when check_violation then null; end;
 begin
   update identidade.sessao set revogada_por_usuario_id=null
     where session_id='30000000-0000-4000-8000-000000000002';
   raise exception 'autor do tombstone alterado';
 exception when check_violation then null; end;
 begin
   delete from identidade.sessao where session_id='30000000-0000-4000-8000-000000000002';
   raise exception 'tombstone excluído';
 exception when check_violation then null; end;
end $$;
