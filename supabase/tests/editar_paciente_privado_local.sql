\set ON_ERROR_STOP on
create role anon; create role authenticated; create role service_role;
create schema auth; create schema operacao; create schema cadastro; create schema auth_privado;
create table public.usuario(id uuid primary key);
create table cadastro.paciente(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('teste.ator',true),'')::uuid $$;
create function auth_privado.uid() returns uuid language sql stable as $$ select auth.uid() $$;
insert into public.usuario values ('10000000-0000-4000-8000-000000000002');
create schema identidade; create schema auditoria;
alter table public.usuario add column ativo boolean default true, add column perfil text default 'administrador';
alter table cadastro.paciente add column nome_cifrado jsonb, add column nome_preferencia_cifrado jsonb, add column data_nascimento_cifrada jsonb, add column criado_por_usuario_id uuid, add column versao integer default 1;
create table cadastro.contato_paciente(id uuid,paciente_id uuid,tipo text,valor_cifrado jsonb,versao integer,criado_em timestamptz);
create table operacao.requisicao(id uuid primary key, ator_usuario_id uuid, operacao text, chave_idempotencia text, digest_entrada text, estado text, resultado_id uuid, resultado_versao integer, unique(ator_usuario_id,operacao,chave_idempotencia));
create table auditoria.evento(id uuid primary key, ator_usuario_id uuid, acao text, tipo_objeto text, objeto_id uuid, resultado text, request_id uuid);
create table identidade.configuracao_auth_nativo(dominio_workspace text, google_unico_oauth_confirmado boolean);
create table identidade.concessao_equipe(id uuid, usuario_id uuid, estado text, metodo text, perfil text, subject_google text);
create table identidade.excecao_tecnica(usuario_id uuid, concessao_id uuid);
create table identidade.sessao(session_id uuid, usuario_id uuid, concessao_id uuid, metodo text, revogada_em timestamptz, encerrada_em timestamptz);
create table auth.sessions(id uuid,user_id uuid,not_after timestamptz);
create table auth.identities(user_id uuid,provider text,provider_id text,identity_data jsonb);
-- Fixture apenas: não comprova bloqueios ou comportamento real de Auth.
create schema bloqueios_auth;
create function bloqueios_auth.travar(p_usuario uuid,p_sessao uuid) returns boolean language sql as $$
 select exists(select 1 from auth.sessions where id=p_sessao and user_id=p_usuario)
$$;
grant usage on schema bloqueios_auth to public;
create function auth.jwt() returns jsonb language sql stable as $$ select current_setting('teste.jwt',true)::jsonb $$;
-- Apenas fixture: não comprova verificação criptográfica ou Vault.
create function identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text) returns boolean language sql as $$ select $5='valido' $$;
create function auth_privado.jwt() returns jsonb language sql stable as $$ select auth.jwt() $$;
create function auth_privado.sessoes() returns setof auth.sessions language sql as $$ select * from auth.sessions $$;
create function auth_privado.identidades() returns setof auth.identities language sql as $$ select * from auth.identities $$;
insert into identidade.configuracao_auth_nativo values ('exemplo.test',true);
insert into identidade.concessao_equipe values ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','vinculada','google_workspace','administrador','google-ficticio');
insert into identidade.sessao values ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','google_workspace',null,null);
insert into auth.sessions values ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',null);
insert into auth.identities values ('10000000-0000-4000-8000-000000000002','google','google-ficticio','{"sub":"google-ficticio","email_verified":true,"custom_claims":{"hd":"exemplo.test"}}');
select set_config('teste.ator','10000000-0000-4000-8000-000000000002',false);
select set_config('teste.jwt','{"session_id":"50000000-0000-4000-8000-000000000001","amr":[{"method":"oauth"}]}',false);
alter table cadastro.paciente add column atualizado_em timestamptz default clock_timestamp();
\ir ../migrations/20261109100000_editar_paciente_privado.sql
insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id) values ('60000000-0000-4000-8000-000000000001','{}',auth.uid());
create function auditoria.falhar_fixture() returns trigger language plpgsql as $$ begin raise exception 'AUDITORIA_FIXTURE'; end $$;
do $$
#variable_conflict use_variable
declare e jsonb; t jsonb; r jsonb; paciente uuid:='60000000-0000-4000-8000-000000000001'; aud uuid:='80000000-0000-4000-8000-000000000001'; env jsonb:=jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22));
begin
 if has_function_privilege('anon','operacao.editar_paciente_privado(jsonb)','execute') or has_function_privilege('authenticated','operacao.editar_paciente_privado(jsonb)','execute') or has_function_privilege('service_role','operacao.editar_paciente_privado(jsonb)','execute') then raise exception 'GRANT_INDEVIDO'; end if;
 e:=jsonb_build_object('request_id','70000000-0000-4000-8000-000000000001','paciente_id',paciente,'versao_esperada',1,'auditoria_id',aud,'chave_idempotencia','editar','digest_idempotencia',repeat('a',43),'nome',env,'motivo',env,'aad',jsonb_build_object('nome',jsonb_build_object('tabela','cadastro.paciente','registro_id',paciente::text,'campo','nome','formato',1),'motivo',jsonb_build_object('tabela','auditoria.evento','registro_id',aud::text,'campo','motivo','formato',1)),'atestado',jsonb_build_object('usuario_id',auth.uid(),'session_id',auth.jwt()->>'session_id','request_id','70000000-0000-4000-8000-000000000001','operacao','api.editar_paciente','emitido_em',clock_timestamp()-interval '1 second','expira_em',clock_timestamp()+interval '20 seconds','mac','valido'));
 t:=jsonb_build_object('entrada',e,'entrada_canonica','{}','dados_canonicos','{}');
 update public.usuario set perfil='profissional' where id=auth.uid(); r:=operacao.editar_paciente_privado(t); if r#>>'{erro,codigo}' <> 'sem_permissao' then raise exception 'PROFISSIONAL_ACEITO'; end if;
 update public.usuario set perfil='administrador' where id=auth.uid();
 begin perform operacao.editar_paciente_privado(jsonb_set(t,'{entrada,aad,motivo,registro_id}',to_jsonb(gen_random_uuid()::text))); raise exception 'AAD_ACEITO'; exception when invalid_parameter_value then null; end;
 create trigger falha before insert on auditoria.evento for each row execute function auditoria.falhar_fixture();
 begin perform operacao.editar_paciente_privado(t); raise exception 'AUDITORIA_IGNORADA'; exception when raise_exception then if sqlerrm <> 'AUDITORIA_FIXTURE' then raise; end if; end;
 drop trigger falha on auditoria.evento;
 if (select versao from cadastro.paciente where id=paciente)<>1 or exists(select 1 from operacao.requisicao where resultado_id=paciente) then raise exception 'ROLLBACK_INCOMPLETO'; end if;
 r:=operacao.editar_paciente_privado(t); if r->>'ok'<>'true' or (select motivo_cifrado from auditoria.evento where id=aud) is distinct from env then raise exception 'EDICAO_FALHOU %',r; end if;
 r:=operacao.editar_paciente_privado(t); if r->>'repeticao'<>'true' or (select versao from cadastro.paciente where id=paciente)<>2 then raise exception 'REPLAY_FALHOU'; end if;
 r:=operacao.editar_paciente_privado(jsonb_set(t,'{entrada,digest_idempotencia}',to_jsonb(repeat('b',43)))); if r#>>'{erro,codigo}'<>'conflito_idempotencia' then raise exception 'CONFLITO_IDEMPOTENCIA'; end if;
 t:=jsonb_set(t,'{entrada,chave_idempotencia}','"outra"'); r:=operacao.editar_paciente_privado(t); if r#>>'{erro,codigo}'<>'conflito' then raise exception 'VERSAO_ANTIGA_ACEITA'; end if;
 update cadastro.paciente set nome_preferencia_cifrado=env, data_nascimento_cifrada=env where id=paciente;
 t:=jsonb_set(t,'{entrada,versao_esperada}','2'); t:=jsonb_set(t,'{entrada,nome_preferencia}','null');
 t:=jsonb_set(t,'{entrada,auditoria_id}',to_jsonb(gen_random_uuid()::text));
 t:=jsonb_set(t,'{entrada,aad,motivo,registro_id}',t#>'{entrada,auditoria_id}');
 r:=operacao.editar_paciente_privado(t);
 if r->>'ok'<>'true' or (select nome_preferencia_cifrado is not null or data_nascimento_cifrada is distinct from env from cadastro.paciente where id=paciente) then raise exception 'OPCIONAIS_INCORRETOS'; end if;

 -- Sessão técnica exige exceção individual e vínculo exato; replay não contorna revogação.
 perform set_config('teste.jwt','{"session_id":"50000000-0000-4000-8000-000000000001","amr":[{"method":"password"}]}',false);
 update identidade.sessao set metodo='tecnica';
 r:=operacao.editar_paciente_privado(t); if r#>>'{erro,codigo}'<>'sem_permissao' then raise exception 'EXCECAO_AUSENTE_ACEITA'; end if;
 insert into identidade.excecao_tecnica values (auth.uid(),'40000000-0000-4000-8000-000000000001');
 r:=operacao.editar_paciente_privado(t); if r->>'repeticao'<>'true' then raise exception 'TECNICA_NEGADA %',r; end if;
 update identidade.excecao_tecnica set concessao_id=gen_random_uuid();
 r:=operacao.editar_paciente_privado(t); if r#>>'{erro,codigo}'<>'sem_permissao' then raise exception 'CONCESSAO_DIVERGENTE_ACEITA'; end if;
 update identidade.excecao_tecnica set concessao_id='40000000-0000-4000-8000-000000000001';
 update identidade.concessao_equipe set estado='revogada';
 r:=operacao.editar_paciente_privado(t); if r#>>'{erro,codigo}'<>'sem_permissao' then raise exception 'CONCESSAO_REVOGADA_ACEITA'; end if;
 update identidade.concessao_equipe set estado='vinculada';
 update identidade.sessao set metodo='google_workspace';
 r:=operacao.editar_paciente_privado(t); if r#>>'{erro,codigo}'<>'sem_permissao' then raise exception 'METODO_DIVERGENTE_ACEITO'; end if;
 update identidade.sessao set metodo='tecnica';
 update identidade.sessao set revogada_em=clock_timestamp(); r:=operacao.editar_paciente_privado(t); if r#>>'{erro,codigo}'<>'sem_permissao' then raise exception 'REVOGACAO_IGNORADA'; end if;
end $$;
