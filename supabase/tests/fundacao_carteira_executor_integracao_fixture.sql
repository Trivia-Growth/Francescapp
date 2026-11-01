-- Exclusivo para cluster local descartável; auth é simulação, não gateway real.
\set ON_ERROR_STOP on
do $$ begin
 if current_database() <> 'ffcm_carteira_fixture' or inet_server_addr() is not null
   or current_setting('unix_socket_directories') not like '/tmp/ffcm-admissao.%'
   or current_setting('unix_socket_directories') is distinct from current_setting('ffcm_fixture.socket_esperado',true)
   or current_setting('data_directory') is distinct from current_setting('ffcm_fixture.data_esperado',true)
   or current_setting('ffcm_fixture.token_servidor',true) is distinct from current_setting('ffcm_fixture.token_esperado',true)
   then raise exception 'cluster descartável obrigatório'; end if;
end $$;
create or replace function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
 select nullif(current_setting('request.jwt.claims',true),'')::jsonb
$$;
create role ffcm_carteira_login_fixture login noinherit nosuperuser nobypassrls;
grant ffcm_carteira_executor_fixture to ffcm_carteira_login_fixture;
update identidade.prova_saida_fixture set verificador=extensions.digest(decode(repeat('00',32),'hex'),'sha256')
where session_id in ('63000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000002');
insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id) values
('66000000-0000-4000-8000-000000000002','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','61000000-0000-4000-8000-000000000001');
insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado) values
('67000000-0000-4000-8000-000000000003','66000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
