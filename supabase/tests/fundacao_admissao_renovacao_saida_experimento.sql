-- Exclusivamente banco/cluster descartáveis: commits de fixtures fictícias.
\set ON_ERROR_STOP on
\ir fundacao_admissao_prova_compartilhada_experimento.sql
create table identidade.prova_saida_fixture (
 session_id uuid primary key references identidade.sessao(session_id),
 usuario_id uuid not null references public.usuario(id),
 geracao bigint not null check(geracao>0), verificador bytea not null check(octet_length(verificador)=32)
);
create schema saida_fixture;
create role ffcm_saida_runtime nologin;
\ir ../drafts/20261102120000_saida_prova_experimento.sql
\ir ../drafts/20261102140000_renovacao_prova_integrada_experimento.sql
\ir ../drafts/20261102150000_autorizacao_renovacao_experimento.sql
\ir ../drafts/20261104140000_admissao_prova_compartilhada_experimento.sql
\ir ../drafts/20261104160000_admissao_geracao_inicial_experimento.sql
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('ffcm_fixture.usuario',true),'')::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('session_id',current_setting('ffcm_fixture.sessao',true)) $$;
insert into auth.users values ('41000000-0000-4000-8000-000000000002');
insert into public.usuario(id,perfil) values ('41000000-0000-4000-8000-000000000002','administrador');
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,vinculada_em)
values ('42000000-0000-4000-8000-000000000002','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','fixture-2','administrador','google_workspace','vinculada','41000000-0000-4000-8000-000000000002','fixture-2','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',clock_timestamp());
insert into identidade.excecao_tecnica(usuario_id,concessao_id,motivo_cifrado) values ('41000000-0000-4000-8000-000000000002','42000000-0000-4000-8000-000000000002','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
select set_config('ffcm_fixture.usuario','41000000-0000-4000-8000-000000000002',false);
select set_config('ffcm_fixture.sessao','43000000-0000-4000-8000-000000000011',false);
do $$ declare e jsonb:='{"identidade":{"usuario_id":"41000000-0000-4000-8000-000000000002","session_id":"43000000-0000-4000-8000-000000000011","metodo":"tecnica"},"request_id":"44000000-0000-4000-8000-000000000011","credencial_refresh":{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}}'; begin
 if identidade.admitir_tecnica_com_prova(e,decode(repeat('ab',32),'hex'))->>'ok' is distinct from 'true' then raise exception 'admissão negada'; end if;
 if saida_fixture.autorizar_prova(1,decode(repeat('ab',32),'hex')) is not true then raise exception 'prova inicial não autorizada'; end if;
end $$;
do $$ begin
 if identidade.iniciar_prova_experimento('43000000-0000-4000-8000-000000000011','41000000-0000-4000-8000-000000000002',1,decode(repeat('ab',32),'hex'),'45000000-0000-4000-8000-000000000011') is null then raise exception 'renovação não iniciada'; end if;
end $$;
do $$ declare antigo jsonb:='{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'; novo jsonb:='{"formato":1,"key_id":"teste","nonce":"n2","ciphertext":"c2","tag":"t2"}'; begin
 if identidade.confirmar_inicio_prova_experimento('43000000-0000-4000-8000-000000000011','41000000-0000-4000-8000-000000000002',1,decode(repeat('ab',32),'hex'),'45000000-0000-4000-8000-000000000011',antigo) is not true then raise exception 'início não confirmado'; end if;
 if identidade.persistir_prova_experimento('43000000-0000-4000-8000-000000000011','41000000-0000-4000-8000-000000000002',1,decode(repeat('ab',32),'hex'),'45000000-0000-4000-8000-000000000011',novo,decode(repeat('cd',32),'hex')) is not true then raise exception 'persistência negada'; end if;
end $$;
do $$ declare novo jsonb:='{"formato":1,"key_id":"teste","nonce":"n2","ciphertext":"c2","tag":"t2"}'; begin
 if identidade.confirmar_persistencia_prova_experimento('43000000-0000-4000-8000-000000000011','41000000-0000-4000-8000-000000000002',1,decode(repeat('ab',32),'hex'),'45000000-0000-4000-8000-000000000011',novo,decode(repeat('cd',32),'hex')) is not true then raise exception 'persistência não confirmada'; end if;
 if identidade.liberar_prova_experimento('43000000-0000-4000-8000-000000000011','41000000-0000-4000-8000-000000000002',1,decode(repeat('ab',32),'hex'),'45000000-0000-4000-8000-000000000011',novo,decode(repeat('cd',32),'hex')) is not true then raise exception 'prova nova não liberada'; end if;
end $$;
do $$ declare novo jsonb:='{"formato":1,"key_id":"teste","nonce":"n2","ciphertext":"c2","tag":"t2"}'; begin
 if identidade.confirmar_prova_experimento('43000000-0000-4000-8000-000000000011','41000000-0000-4000-8000-000000000002',1,decode(repeat('ab',32),'hex'),'45000000-0000-4000-8000-000000000011',novo,decode(repeat('cd',32),'hex')) is not true then raise exception 'liberação não confirmada'; end if;
 if saida_fixture.autorizar_prova(1,decode(repeat('ab',32),'hex')) is not false or saida_fixture.autorizar_prova(2,decode(repeat('cd',32),'hex')) is not true then raise exception 'rotação de prova incorreta'; end if;
 if saida_fixture.revogar('43000000-0000-4000-8000-000000000011','41000000-0000-4000-8000-000000000002',2,decode(repeat('cd',32),'hex'),'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'::jsonb,'44000000-0000-4000-8000-000000000015') is not true then raise exception 'saída negada'; end if;
 if saida_fixture.autorizar_prova(2,decode(repeat('cd',32),'hex')) is not false then raise exception 'autorização após saída'; end if;
end $$;
