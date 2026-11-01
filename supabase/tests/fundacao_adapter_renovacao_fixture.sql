-- Exclusivamente fixture de papéis e RPCs; não é migração nem configuração real.
\set ON_ERROR_STOP on
do $$ begin
 if current_database() <> 'ffcm_saida_teste_local' or inet_server_addr() is not null
    or current_setting('unix_socket_directories') not like '%/ffcm-saida.%' then raise exception 'Cluster local descartável obrigatório'; end if;
end $$;
create role ffcm_renovacao_owner nologin;
create role ffcm_renovacao_runtime login noinherit;
grant usage on schema public,identidade to ffcm_renovacao_owner;
grant select(id,ativo),update(id) on public.usuario to ffcm_renovacao_owner;
grant select(id,usuario_id,estado),update(id) on identidade.concessao_equipe to ffcm_renovacao_owner;
grant select(session_id,usuario_id,concessao_id,revogada_em),update(session_id) on identidade.sessao to ffcm_renovacao_owner;
grant select on identidade.credencial_sessao,identidade.prova_saida_fixture to ffcm_renovacao_owner;
grant update(estado,geracao,envelope,tentativa_prova_fixture,verificador_anterior_fixture,verificador_pendente_fixture,envelope_pendente_fixture,xid_liberacao_fixture,xid_persistencia_fixture,xid_inicio_fixture) on identidade.credencial_sessao to ffcm_renovacao_owner;
grant update(geracao,verificador) on identidade.prova_saida_fixture to ffcm_renovacao_owner;
create policy renovar_usuario_read on public.usuario for select to ffcm_renovacao_owner using (true);
create policy renovar_usuario_lock on public.usuario for update to ffcm_renovacao_owner using (true) with check (false);
create policy renovar_usuario_lock_restrito on public.usuario as restrictive for update to ffcm_renovacao_owner using (true) with check (false);
create policy renovar_concessao_read on identidade.concessao_equipe for select to ffcm_renovacao_owner using (true);
create policy renovar_concessao_lock on identidade.concessao_equipe for update to ffcm_renovacao_owner using (true) with check (false);
create policy renovar_concessao_lock_restrito on identidade.concessao_equipe as restrictive for update to ffcm_renovacao_owner using (true) with check (false);
create policy renovar_sessao_read on identidade.sessao for select to ffcm_renovacao_owner using (true);
create policy renovar_sessao_lock on identidade.sessao for update to ffcm_renovacao_owner using (true) with check (false);
create policy renovar_sessao_lock_restrito on identidade.sessao as restrictive for update to ffcm_renovacao_owner using (true) with check (false);
create policy renovar_credencial_read on identidade.credencial_sessao for select to ffcm_renovacao_owner using (true);
create policy renovar_credencial_write on identidade.credencial_sessao for update to ffcm_renovacao_owner using (true) with check (true);
create policy renovar_prova_read on identidade.prova_saida_fixture for select to ffcm_renovacao_owner using (true);
create policy renovar_prova_write on identidade.prova_saida_fixture for update to ffcm_renovacao_owner using (true) with check (true);
grant execute on function identidade.travar_renovacao_prova_fixture(uuid,uuid), identidade.iniciar_prova_experimento(uuid,uuid,bigint,bytea,uuid), identidade.confirmar_inicio_prova_experimento(uuid,uuid,bigint,bytea,uuid,jsonb), identidade.persistir_prova_experimento(uuid,uuid,bigint,bytea,uuid,jsonb,bytea), identidade.confirmar_persistencia_prova_experimento(uuid,uuid,bigint,bytea,uuid,jsonb,bytea), identidade.liberar_prova_experimento(uuid,uuid,bigint,bytea,uuid,jsonb,bytea), identidade.confirmar_prova_experimento(uuid,uuid,bigint,bytea,uuid,jsonb,bytea) to ffcm_renovacao_owner;
create schema renovacao_fixture authorization ffcm_renovacao_owner;
grant usage on schema renovacao_fixture to ffcm_renovacao_runtime;
grant usage on schema saida_fixture to ffcm_renovacao_runtime;
grant execute on function saida_fixture.revogar(uuid,uuid,bigint,bytea,jsonb,uuid) to ffcm_renovacao_runtime;
set role ffcm_renovacao_owner;
create function renovacao_fixture.iniciar(uuid,uuid,bigint,bytea,uuid) returns jsonb language sql security definer set search_path=pg_catalog as $$ select identidade.iniciar_prova_experimento($1,$2,$3,$4,$5) $$;
create function renovacao_fixture.confirmar_inicio(uuid,uuid,bigint,bytea,uuid,jsonb) returns boolean language sql security definer set search_path=pg_catalog as $$ select identidade.confirmar_inicio_prova_experimento($1,$2,$3,$4,$5,$6) $$;
create function renovacao_fixture.persistir(uuid,uuid,bigint,bytea,uuid,jsonb,bytea) returns boolean language sql security definer set search_path=pg_catalog as $$ select identidade.persistir_prova_experimento($1,$2,$3,$4,$5,$6,$7) $$;
create function renovacao_fixture.confirmar_persistencia(uuid,uuid,bigint,bytea,uuid,jsonb,bytea) returns boolean language sql security definer set search_path=pg_catalog as $$ select identidade.confirmar_persistencia_prova_experimento($1,$2,$3,$4,$5,$6,$7) $$;
create function renovacao_fixture.liberar(uuid,uuid,bigint,bytea,uuid,jsonb,bytea) returns boolean language sql security definer set search_path=pg_catalog as $$ select identidade.liberar_prova_experimento($1,$2,$3,$4,$5,$6,$7) $$;
create function renovacao_fixture.confirmar(uuid,uuid,bigint,bytea,uuid,jsonb,bytea) returns boolean language sql security definer set search_path=pg_catalog as $$ select identidade.confirmar_prova_experimento($1,$2,$3,$4,$5,$6,$7) $$;
revoke all on all functions in schema renovacao_fixture from public,anon,authenticated;
grant execute on all functions in schema renovacao_fixture to ffcm_renovacao_runtime;
reset role;

-- Fixture de cofre: segredo fictício, sem Vault e sem privilégios de produção.
create role ffcmapp_vault_executor nologin noinherit;
create role ffcm_vault_runtime login noinherit;
grant ffcmapp_vault_executor to ffcm_vault_runtime;
grant usage on schema identidade to ffcmapp_vault_executor;
create function identidade.ler_chave_cifra_vault(text) returns text language sql stable as $$
 select case when $1='ffcmapp.cifra.teste' then encode(decode(repeat('07',32),'hex'),'base64') else null end
$$;
revoke all on function identidade.ler_chave_cifra_vault(text) from public,anon,authenticated;
grant execute on function identidade.ler_chave_cifra_vault(text) to ffcmapp_vault_executor;
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
 values ('30000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,'google_workspace');
insert into identidade.prova_saida_fixture values ('30000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'));
insert into identidade.credencial_sessao(session_id,estado,geracao,envelope)
 values ('30000000-0000-4000-8000-000000000010','disponivel',1,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
 values ('30000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,'google_workspace');
insert into identidade.prova_saida_fixture values ('30000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'));
insert into identidade.credencial_sessao(session_id,estado,geracao,envelope)
 values ('30000000-0000-4000-8000-000000000011','disponivel',1,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
 values ('30000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,'google_workspace');
insert into identidade.prova_saida_fixture values ('30000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'));
insert into identidade.credencial_sessao(session_id,estado,geracao,envelope)
 values ('30000000-0000-4000-8000-000000000012','disponivel',1,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
 values ('30000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,'google_workspace');
insert into identidade.prova_saida_fixture values ('30000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'));
insert into identidade.credencial_sessao(session_id,estado,geracao,envelope)
 values ('30000000-0000-4000-8000-000000000013','disponivel',1,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');

-- Outra política permissiva não pode transformar privilégios de lock em escrita.
create policy teste_usuario_permissiva on public.usuario for update to ffcm_renovacao_owner using (true) with check (true);
create policy teste_concessao_permissiva on identidade.concessao_equipe for update to ffcm_renovacao_owner using (true) with check (true);
create policy teste_sessao_permissiva on identidade.sessao for update to ffcm_renovacao_owner using (true) with check (true);
set role ffcm_renovacao_owner;
do $$
begin
 begin update public.usuario set id=id where id='10000000-0000-4000-8000-000000000001'; raise exception 'escrita usuário aceita'; exception when insufficient_privilege then null; end;
 begin update identidade.concessao_equipe set id=id where id='20000000-0000-4000-8000-000000000001'; raise exception 'escrita concessão aceita'; exception when insufficient_privilege then null; end;
 begin update identidade.sessao set session_id=session_id where session_id='30000000-0000-4000-8000-000000000013'; raise exception 'escrita sessão aceita'; exception when insufficient_privilege then null; end;
end $$;
reset role;
