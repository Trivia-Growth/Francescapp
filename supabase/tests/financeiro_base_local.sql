\set ON_ERROR_STOP on
-- Base das provas do financeiro do cuidado (FR-068/FR-069/FR-070).
-- PostgreSQL descartável; Auth, Vault, Storage e assinatura são fixtures fictícias e não
-- comprovam serviço real. Todos os dados são fictícios: nenhum dado pessoal, nenhum valor real.
\ir tarefa_rls_local.sql
\ir ../migrations/20261112100000_auditoria_carteira_auth_nao_admitido.sql
\ir ../migrations/20261117400000_configuracao_sistema.sql
\ir ../migrations/20261125080000_turno_execucao_privada.sql
-- Repositório privado sintético, no mesmo formato usado pela fatia de turno.
create schema storage;
create table storage.buckets(id text primary key,name text not null,public boolean not null,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,metadata jsonb,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select,insert,update,delete on storage.objects to authenticated;
-- Política permissiva alheia: as políticas restritivas novas ainda precisam isolar o balde.
create policy fixture_storage_ampla on storage.objects to authenticated using(true) with check(true);

-- A marca de crise entra antes para provar que as duas marcas coexistem na mesma tabela
-- sem que o financeiro altere o CHECK nem a trilha de cuidado já provada.
\ir ../migrations/20261118100000_habilitacao_plano_crise_concessao.sql
\ir ../migrations/20261126200000_financeiro_concessao.sql
\ir ../migrations/20261126200100_financeiro_audiencia.sql
\ir ../migrations/20261126200200_financeiro_valor_acordado.sql
\ir ../migrations/20261126200300_financeiro_valor_acordado_rpc.sql
\ir ../migrations/20261126200400_financeiro_despesa.sql
\ir ../migrations/20261126200500_financeiro_comprovante.sql
\ir ../migrations/20261126200600_financeiro_apuracao.sql

-- Contas fictícias novas: 003 é a pessoa do financeiro (profissional SEM vínculo de caso),
-- 004 é familiar COM fundamento de autorização no caso 4001.
insert into auth.users values ('10000000-0000-4000-8000-000000000003'),('10000000-0000-4000-8000-000000000004');
insert into public.usuario(id,perfil,ativo) values
 ('10000000-0000-4000-8000-000000000003','profissional',true),
 ('10000000-0000-4000-8000-000000000004','familia',true);
insert into auth.identities select id,id,'google','google-'||id,jsonb_build_object('sub','google-'||id,'email_verified',true,'custom_claims',jsonb_build_object('hd','example.test')) from auth.users where id in ('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004');
insert into auth.sessions select replace(id::text,'10000000-','20000000-')::uuid,id,null from auth.users where id in ('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004');
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,criada_em,vinculada_em)
 values('30000000-0000-4000-8000-000000000003','{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}','fixture-003','profissional','google_workspace','vinculada','10000000-0000-4000-8000-000000000003','google-10000000-0000-4000-8000-000000000003','{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}',now()-interval '1 day',now());
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
 values('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003',1,'google_workspace');
-- Fundamento de autorização do familiar no caso: é exatamente o que NÃO pode abrir o financeiro.
insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado)
 values('91000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"v1","nonce":"n","ciphertext":"c","tag":"t"}');

-- Chamada assinada, no molde das demais fixtures. Fabrica atestado SOMENTE com o assinador
-- sintético; nenhuma chave real participa.
create function public.financeiro_chamar_fixture(p_alvo text,p_acao text,p_entrada jsonb,p_ator uuid,p_sessao uuid) returns jsonb
 language plpgsql as $$
declare e jsonb; t jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_ator,'session_id',p_sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid())||p_entrada;
 t:=public.assinar_anamnese_fixture(e,p_acao,p_ator,p_sessao);
 execute format('select %s($1)',p_alvo) into r using t;
 return r;
end $$;

create function public.financeiro_despesa_fixture(p_acao text,p_entrada jsonb,p_ator uuid,p_sessao uuid) returns jsonb
 language sql as $$ select public.financeiro_chamar_fixture('api.financeiro_despesa_privado',p_acao,p_entrada,p_ator,p_sessao); $$;

create function public.financeiro_apuracao_fixture(p_acao text,p_entrada jsonb,p_ator uuid,p_sessao uuid) returns jsonb
 language sql as $$ select public.financeiro_chamar_fixture('api.financeiro_apuracao_privado',p_acao,p_entrada,p_ator,p_sessao); $$;

create function public.financeiro_valor_fixture(p_acao text,p_entrada jsonb,p_ator uuid,p_sessao uuid) returns jsonb
 language sql as $$ select public.financeiro_chamar_fixture('api.financeiro_valor_privado',p_acao,p_entrada,p_ator,p_sessao); $$;

create function public.financeiro_envelope_fixture() returns jsonb language sql immutable as $$
 select jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)); $$;
