-- Claims são fixtures, não comprovam verificação JWT pelo gateway real.
\set ON_ERROR_STOP on
do $$ begin
 if current_database() <> 'ffcm_saida_teste_local' or inet_server_addr() is not null
    or current_setting('unix_socket_directories') not like '%/ffcm-saida.%' then raise exception 'Cluster local descartável obrigatório'; end if;
end $$;
create or replace function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create or replace function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
grant usage on schema auth to ffcm_saida_owner;
grant select(ativo) on public.usuario to ffcm_saida_owner;
grant select(usuario_id,estado) on identidade.concessao_equipe to ffcm_saida_owner;
grant select(session_id,estado,geracao) on identidade.credencial_sessao to ffcm_saida_owner;
grant update(session_id) on identidade.credencial_sessao to ffcm_saida_owner;
create policy credencial_owner_select_fixture on identidade.credencial_sessao for select to ffcm_saida_owner using (true);
create policy credencial_owner_lock_fixture on identidade.credencial_sessao for update to ffcm_saida_owner using (true) with check (true);
create policy credencial_owner_sem_escrita_fixture on identidade.credencial_sessao as restrictive for update to ffcm_saida_owner using (true) with check (false);
grant execute on function identidade.travar_renovacao_prova_fixture(uuid,uuid) to ffcm_saida_owner;
set role ffcm_saida_owner;
\ir ../drafts/20261102150000_autorizacao_renovacao_experimento.sql
reset role;
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
 values ('30000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,'google_workspace');
insert into identidade.prova_saida_fixture values ('30000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'));
insert into identidade.credencial_sessao(session_id,estado,geracao,envelope)
 values ('30000000-0000-4000-8000-000000000009','disponivel',1,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
set role ffcm_saida_owner;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
select set_config('request.jwt.claims','{"session_id":"30000000-0000-4000-8000-000000000009"}',false);
do $$ begin
 if saida_fixture.autorizar_prova(1,decode(repeat('01',32),'hex')) is distinct from true then raise exception 'autorização válida negada'; end if;
 if saida_fixture.autorizar_prova(2,decode(repeat('01',32),'hex')) is distinct from false or saida_fixture.autorizar_prova(1,decode(repeat('02',32),'hex')) is distinct from false then raise exception 'geração ou prova incorreta aceita'; end if;
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000099',true);
 if saida_fixture.autorizar_prova(1,decode(repeat('01',32),'hex')) is distinct from false then raise exception 'outro ator aceito'; end if;
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
 perform set_config('request.jwt.claims','{"session_id":"inválido"}',true);
 if saida_fixture.autorizar_prova(1,decode(repeat('01',32),'hex')) is distinct from false then raise exception 'sessão inválida aceita'; end if;
 perform set_config('request.jwt.claims','{}',true);
 if saida_fixture.autorizar_prova(1,decode(repeat('01',32),'hex')) is distinct from false then raise exception 'sessão ausente aceita'; end if;
end $$;
reset role;
do $$ begin
 if has_column_privilege('ffcm_saida_owner','identidade.credencial_sessao','envelope','select')
    or has_column_privilege('ffcm_saida_runtime','identidade.credencial_sessao','estado','select')
    or has_function_privilege('authenticated','saida_fixture.autorizar_prova(bigint,bytea)','execute')
    or has_function_privilege('ffcm_saida_runtime','saida_fixture.autorizar_prova(bigint,bytea)','execute') then raise exception 'privilégio indevido'; end if;
end $$;
do $$ begin
 if identidade.iniciar_prova_experimento('30000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'),'40000000-0000-4000-8000-000000000009') is null then raise exception 'início negado'; end if;
end $$;
set role ffcm_saida_owner;
do $$ begin
 if saida_fixture.autorizar_prova(1,decode(repeat('01',32),'hex')) is distinct from false then raise exception 'prova usada durante renovação'; end if;
end $$;
reset role;
do $$ begin
 if identidade.persistir_prova_experimento('30000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'),'40000000-0000-4000-8000-000000000009','{"formato":1,"key_id":"teste","nonce":"novo","ciphertext":"c","tag":"t"}',decode(repeat('02',32),'hex')) is distinct from true then raise exception 'persistência negada'; end if;
 if identidade.liberar_prova_experimento('30000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'),'40000000-0000-4000-8000-000000000009','{"formato":1,"key_id":"teste","nonce":"novo","ciphertext":"c","tag":"t"}',decode(repeat('02',32),'hex')) is distinct from true then raise exception 'liberação negada'; end if;
end $$;
set role ffcm_saida_owner;
do $$ begin
 if saida_fixture.autorizar_prova(1,decode(repeat('01',32),'hex')) is distinct from false or saida_fixture.autorizar_prova(2,decode(repeat('02',32),'hex')) is distinct from true then raise exception 'rotação de prova não respeitada'; end if;
end $$;
reset role;
do $$ begin
 if saida_fixture.revogar('30000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000001',2,decode(repeat('02',32),'hex'),'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',gen_random_uuid()) is distinct from true then raise exception 'saída negada'; end if;
end $$;
set role ffcm_saida_owner;
do $$ begin
 if saida_fixture.autorizar_prova(2,decode(repeat('02',32),'hex')) is distinct from false then raise exception 'JWT antigo aceito após revogação'; end if;
end $$;
reset role;
