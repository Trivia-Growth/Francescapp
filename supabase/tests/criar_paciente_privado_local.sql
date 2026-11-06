\set ON_ERROR_STOP on
\ir barreira_cadastro_privada_local.sql
create schema identidade; create schema auditoria;
alter table public.usuario add column ativo boolean default true, add column perfil text default 'administrador';
alter table cadastro.paciente add column nome_cifrado jsonb, add column nome_preferencia_cifrado jsonb, add column data_nascimento_cifrada jsonb, add column criado_por_usuario_id uuid, add column versao integer default 1;
create table cadastro.contato_paciente(id uuid,paciente_id uuid,tipo text,valor_cifrado jsonb,versao integer,criado_em timestamptz);
create table operacao.requisicao(id uuid primary key, ator_usuario_id uuid, operacao text, chave_idempotencia text, digest_entrada text, estado text, resultado_id uuid, resultado_versao integer, unique(ator_usuario_id,operacao,chave_idempotencia));
create table auditoria.evento(id uuid primary key, ator_usuario_id uuid, acao text, tipo_objeto text, objeto_id uuid, resultado text, request_id uuid);
create table identidade.configuracao_auth_nativo(dominio_workspace text, google_unico_oauth_confirmado boolean);
create table identidade.concessao_equipe(id uuid, usuario_id uuid, estado text, metodo text, perfil text, subject_google text);
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
\ir ../migrations/20261106150000_criar_paciente.sql
do $$
begin
 if has_function_privilege('anon','operacao.criar_paciente_privado(jsonb)','execute')
  or has_function_privilege('authenticated','operacao.criar_paciente_privado(jsonb)','execute')
  or has_function_privilege('service_role','operacao.criar_paciente_privado(jsonb)','execute') then
  raise exception 'GRANT_INDEVIDO';
 end if;
end $$;
insert into identidade.configuracao_auth_nativo values ('exemplo.test',true);
insert into identidade.concessao_equipe values ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','vinculada','google_workspace','administrador','google-ficticio');
insert into identidade.sessao values ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','google_workspace',null,null);
insert into auth.sessions values ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',null);
insert into auth.identities values ('10000000-0000-4000-8000-000000000002','google','google-ficticio','{"sub":"google-ficticio","email_verified":true,"custom_claims":{"hd":"exemplo.test"}}');
select set_config('teste.ator','10000000-0000-4000-8000-000000000002',false);
select set_config('teste.jwt','{"session_id":"50000000-0000-4000-8000-000000000001","amr":[{"method":"oauth"}]}',false);
select operacao.reservar_cadastro_privado(auth.uid(),1,'20000000-0000-4000-8000-000000000010');
create function auditoria.falhar_fixture() returns trigger language plpgsql as $$ begin raise exception 'AUDITORIA_FIXTURE'; end $$;
do $$
#variable_conflict use_variable
declare e jsonb; t jsonb; resultado jsonb; paciente uuid:='60000000-0000-4000-8000-000000000001';
begin
 e:=jsonb_build_object('request_id','70000000-0000-4000-8000-000000000001','paciente_id',paciente,'reserva_id','20000000-0000-4000-8000-000000000010','geracao_reserva',1,'auditoria_id','80000000-0000-4000-8000-000000000001','chave_idempotencia','chave-ficticia','digest_idempotencia',repeat('a',43),
  'nome',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),
  'aad',jsonb_build_object('nome',jsonb_build_object('tabela','cadastro.paciente','registro_id',paciente::text,'campo','nome','formato',1)),
  'atestado',jsonb_build_object('usuario_id',auth.uid(),'session_id',auth.jwt()->>'session_id','request_id','70000000-0000-4000-8000-000000000001','operacao','api.criar_paciente','emitido_em',clock_timestamp()-interval '1 second','expira_em',clock_timestamp()+interval '20 seconds','mac','valido'));
 t:=jsonb_build_object('entrada',e,'entrada_canonica','{}','dados_canonicos','{}');
 begin
  perform operacao.criar_paciente_privado(jsonb_set(t,'{entrada,atestado,mac}','"invalido"'));
  raise exception 'ATESTADO_ACEITO';
 exception when insufficient_privilege then null; end;
 update public.usuario set perfil='profissional' where id=auth.uid();
 resultado:=operacao.criar_paciente_privado(t);
 if resultado#>>'{erro,codigo}' <> 'sem_permissao' then raise exception 'PROFISSIONAL_ACEITO'; end if;
 t:=jsonb_set(t,'{entrada,auditoria_id}',to_jsonb(gen_random_uuid()));
 update public.usuario set perfil='administrador' where id=auth.uid();
 create trigger falha before insert on auditoria.evento for each row execute function auditoria.falhar_fixture();
 begin
  perform operacao.criar_paciente_privado(t);
  raise exception 'AUDITORIA_IGNORADA';
 exception when raise_exception then if sqlerrm <> 'AUDITORIA_FIXTURE' then raise; end if; end;
 drop trigger falha on auditoria.evento;
 if exists(select 1 from cadastro.paciente where id=paciente) or exists(select 1 from operacao.requisicao where resultado_id=paciente) then raise exception 'ROLLBACK_INCOMPLETO'; end if;
 resultado:=operacao.criar_paciente_privado(t);
 if resultado->>'ok' <> 'true' or resultado#>'{dados,contatos}' <> '[]'::jsonb then raise exception 'CRIACAO_FALHOU: %',resultado; end if;
 t:=jsonb_set(t,'{entrada,paciente_id}',to_jsonb('60000000-0000-4000-8000-000000000002'::text));
 t:=jsonb_set(t,'{entrada,aad,nome,registro_id}',to_jsonb('60000000-0000-4000-8000-000000000002'::text));
 t:=jsonb_set(t,'{entrada,auditoria_id}',to_jsonb(gen_random_uuid()));
 resultado:=operacao.criar_paciente_privado(t);
 if resultado->>'ok' <> 'true' or resultado#>>'{dados,paciente_id}' <> paciente::text or (select count(*) from cadastro.paciente where id=paciente)<>1 then raise exception 'RETRY_FALHOU'; end if;
 t:=jsonb_set(t,'{entrada,auditoria_id}',to_jsonb(gen_random_uuid()));
 resultado:=operacao.criar_paciente_privado(jsonb_set(t,'{entrada,digest_idempotencia}',to_jsonb(repeat('b',43))));
 if resultado#>>'{erro,codigo}' <> 'conflito_idempotencia' or not exists(select 1 from auditoria.evento ae where ae.id=(t#>>'{entrada,auditoria_id}')::uuid and ae.resultado='negado') then raise exception 'CONFLITO_NAO_AUDITADO'; end if;
 t:=jsonb_set(t,'{entrada,auditoria_id}',to_jsonb(gen_random_uuid()));
 update identidade.sessao set revogada_em=clock_timestamp();
 resultado:=operacao.criar_paciente_privado(t);
 if resultado#>>'{erro,codigo}' <> 'sem_permissao' then raise exception 'REVOGACAO_IGNORADA'; end if;
end $$;
