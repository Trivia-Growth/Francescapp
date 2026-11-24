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
-- Substituição de valor pela função do próprio Vault, que é `security definer`: é o único
-- caminho de escrita que um Supabase gerenciado concede à fatia.
create function vault.update_secret(secret_id uuid,new_secret text default null,new_name text default null,new_description text default null,new_key_id uuid default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 update vault.secrets set secret = coalesce(new_secret, secret), name = coalesce(new_name, name) where id = secret_id;
end $$;
revoke all on function vault.update_secret(uuid,text,text,text,uuid) from public, anon, authenticated, service_role;
\ir ../migrations/20261125020000_segredos_integracoes.sql
-- Correção do cofre gerenciado: sem `for update` em `vault.secrets` e com `vault.update_secret`
-- na substituição. Sem esta linha a prova exercitaria a função antiga, que não funciona contra
-- um Supabase gerenciado (24/11/2026).
\ir ../migrations/20261124160000_segredos_integracoes_cofre_gerenciado.sql

-- Reproduz o privilégio REAL do Vault gerenciado, e é isto que dá valor à prova.
-- `vault.secrets` pertence a `supabase_admin`, e nem o papel administrativo do projeto pode
-- conceder UPDATE: o `grant update (name)` da migration 20261125020000 vira um aviso e não
-- concede nada. Aqui o migrador é dono da tabela, então o grant PEGARIA e esconderia o
-- defeito — foi exatamente assim que a falha chegou à produção sem ninguém ver.
--
-- Com o revoke abaixo, reintroduzir `for update` ou `update` direto em `vault.secrets` faz
-- esta prova falhar, que é o alarme que faltava.
revoke update on vault.secrets from ffcmapp_segredos_integracoes_owner;

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
 -- Substituir agora troca o VALOR no mesmo registro do cofre, em vez de renomear o anterior
 -- e criar outro: o papel da fatia não pode escrever em `vault.secrets` num Supabase
 -- gerenciado (24/11/2026). O cofre fica com um registro por chave; o histórico de quem
 -- trocou, quando e em que versão continua em `identidade.segredo_integracao_versao`.
 if r#>>'{dados,versao}' <> '2' or (select count(*) from vault.secrets) <> 1 then raise exception 'SUBSTITUICAO_FALHOU'; end if;
 if (select id from vault.secrets where name='ffcmapp.integracao.openrouter') <> antigo then raise exception 'SUBSTITUICAO_TROCOU_REGISTRO'; end if;
 if (select count(*) from identidade.segredo_integracao_versao v join identidade.segredos_integracoes c on c.id=v.segredo_id where c.chave='ffcmapp.integracao.openrouter') <> 2 then raise exception 'HISTORICO_PERDIDO'; end if;
 -- O valor anterior deixa de existir no cofre, de propósito: credencial girada que continua
 -- recuperável é passivo. O que precisa sobreviver é o registro de que houve troca, e isso é
 -- conferido acima, em `identidade.segredo_integracao_versao`.
 if exists(select 1 from vault.secrets where secret='segredo-ficticio-invalido-primeiro') then raise exception 'VALOR_ANTIGO_SOBREVIVEU'; end if;
 if not exists(select 1 from vault.secrets where id=antigo and secret='segredo-ficticio-invalido-segundo' and name='ffcmapp.integracao.openrouter') then raise exception 'VALOR_NOVO_NAO_GRAVADO'; end if;
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
 if (select count(*) from vault.secrets) <> 1 then raise exception 'NEGATIVA_ALTEROU'; end if;
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
