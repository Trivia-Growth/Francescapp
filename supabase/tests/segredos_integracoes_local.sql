\set ON_ERROR_STOP on
\ir anamnese_operacoes_local.sql

-- Adapter local do Vault: prova SQL/ACL/transação, não criptografia da extensão.
create table vault.secrets(id uuid primary key default gen_random_uuid(), name text unique, secret text);
revoke all on vault.secrets from public, anon, authenticated, service_role;
create function vault.create_secret(new_secret text,new_name text default null,new_description text default '',new_key_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare resultado uuid;
begin
 insert into vault.secrets(name,secret) values(new_name,new_secret) returning id into resultado;
 return resultado;
end $$;
revoke all on function vault.create_secret(text,text,text,uuid) from public, anon, authenticated, service_role;
\ir ../migrations/20261125020000_segredos_integracoes.sql

insert into auth.users values ('10000000-0000-4000-8000-000000000004');
insert into public.usuario(id,perfil) values ('10000000-0000-4000-8000-000000000004','familia');
insert into auth.sessions values ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004',null);

do $$
#variable_conflict use_variable
declare
 ator uuid := '10000000-0000-4000-8000-000000000001';
 sessao uuid := '20000000-0000-4000-8000-000000000001';
 profissional uuid := '10000000-0000-4000-8000-000000000002';
 familia uuid := '10000000-0000-4000-8000-000000000004';
 e jsonb; r jsonb; antigo uuid; papel text; alvo uuid;
begin
 foreach papel in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(papel,'identidade.segredos_integracoes','select')
    or has_table_privilege(papel,'identidade.segredos_integracoes','update')
    or has_table_privilege(papel,'identidade.segredo_integracao_versao','select')
    or has_table_privilege(papel,'vault.secrets','select')
    or has_function_privilege(papel,'vault.create_secret(text,text,text,uuid)','execute')
    or has_function_privilege(papel,'operacao.segredos_integracoes_operacao_privada(jsonb)','execute') then
   raise exception 'ACESSO_DIRETO_INDEVIDO';
  end if;
 end loop;
 if has_column_privilege('ffcmapp_segredos_integracoes_owner','vault.secrets','secret','select') then raise exception 'OWNER_LE_SEGREDO'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r := api.segredos_integracoes_privado(public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid()),'api.listar_segredos_integracoes',ator,sessao));
 if r->>'ok' <> 'true' or jsonb_array_length(r->'dados') <> 4 then raise exception 'CATALOGO_FALHOU'; end if;
 e := jsonb_build_object('request_id',gen_random_uuid(),'segredo_chave','ffcmapp.integracao.openrouter','valor','segredo-ficticio-invalido-primeiro','versao_esperada',0,'chave_idempotencia','ficticio-primeiro','digest_idempotencia',repeat('a',43),'auditoria_id',gen_random_uuid());
 r := api.segredos_integracoes_privado(public.assinar_anamnese_fixture(e,'api.gravar_segredos_integracoes',ator,sessao));
 if r->>'ok' <> 'true' or r#>>'{dados,versao}' <> '1' or r#>>'{dados,cadastrado}' <> 'true' or r#>'{dados,valor}' is not null then raise exception 'CADASTRO_FALHOU'; end if;
 if r::text like '%segredo-ficticio%' then raise exception 'RESPOSTA_VAZOU'; end if;
 select id into antigo from vault.secrets where name='ffcmapp.integracao.openrouter';
 r := api.segredos_integracoes_privado(public.assinar_anamnese_fixture(e,'api.gravar_segredos_integracoes',ator,sessao));
 if r#>>'{dados,versao}' <> '1' or (select count(*) from vault.secrets) <> 1 then raise exception 'REPLAY_CRIOU_VERSAO'; end if;
 e := e || jsonb_build_object('request_id',gen_random_uuid(),'valor','segredo-ficticio-invalido-segundo','versao_esperada',1,'chave_idempotencia','ficticio-segundo','digest_idempotencia',repeat('b',43),'auditoria_id',gen_random_uuid());
 r := api.segredos_integracoes_privado(public.assinar_anamnese_fixture(e,'api.gravar_segredos_integracoes',ator,sessao));
 if r#>>'{dados,versao}' <> '2' or (select count(*) from vault.secrets) <> 2 then raise exception 'SUBSTITUICAO_FALHOU'; end if;
 if not exists(select 1 from vault.secrets where id=antigo and secret='segredo-ficticio-invalido-primeiro' and name like 'ffcmapp.integracao.openrouter.versao.%') then raise exception 'ANTERIOR_NAO_PRESERVADO'; end if;
 if not exists(select 1 from vault.secrets where name='ffcmapp.integracao.openrouter' and secret='segredo-ficticio-invalido-segundo') then raise exception 'CANONICO_INCORRETO'; end if;
 r := api.segredos_integracoes_privado(public.assinar_anamnese_fixture(e || jsonb_build_object('chave_idempotencia','ficticio-obsoleto'),'api.gravar_segredos_integracoes',ator,sessao));
 if r#>>'{erro,codigo}' <> 'conflito' then raise exception 'OBSOLETO_ACEITO'; end if;
 foreach alvo in array array[profissional,familia] loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',alvo,'session_id',replace(alvo::text,'10000000-','20000000-'),'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
  r := api.segredos_integracoes_privado(public.assinar_anamnese_fixture(e,'api.gravar_segredos_integracoes',alvo,replace(alvo::text,'10000000-','20000000-')::uuid));
  if r#>>'{erro,codigo}' <> 'sem_permissao' then raise exception 'PERFIL_GRAVOU'; end if;
  r := api.segredos_integracoes_privado(public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid()),'api.listar_segredos_integracoes',alvo,replace(alvo::text,'10000000-','20000000-')::uuid));
  if r#>>'{erro,codigo}' <> 'sem_permissao' then raise exception 'PERFIL_LISTOU'; end if;
 end loop;
 update identidade.sessao set revogada_em=clock_timestamp(), revogada_por_usuario_id=ator,
   motivo_revogacao_cifrado='{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}'::jsonb where session_id=sessao;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r := api.segredos_integracoes_privado(public.assinar_anamnese_fixture(e,'api.gravar_segredos_integracoes',ator,sessao));
 if r#>>'{erro,codigo}' <> 'sem_permissao' then raise exception 'REVOGADA_ACEITA'; end if;
 if (select count(*) from vault.secrets) <> 2 then raise exception 'NEGATIVA_ALTEROU'; end if;
 if exists(select 1 from auditoria.evento a where to_jsonb(a)::text like '%segredo-ficticio%') then raise exception 'AUDITORIA_VAZOU'; end if;
end $$;

-- Acesso direto autenticado sem atestado também falha.
set role authenticated;
do $$ begin
 begin perform api.segredos_integracoes_privado('{}'::jsonb); raise exception 'SEM_ATESTADO_ACEITO'; exception when insufficient_privilege then null; end;
 begin perform * from identidade.segredos_integracoes; raise exception 'METADADOS_DIRETOS'; exception when insufficient_privilege then null; end;
 begin perform * from vault.secrets; raise exception 'VAULT_DIRETO'; exception when insufficient_privilege then null; end;
end $$;
reset role;
