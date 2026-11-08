\set ON_ERROR_STOP on
\ir anamnese_operacoes_local.sql
-- A sessão pertence a outro owner; o migrador não é superusuário.
create role migrador_vinculos_fixture nologin createrole;
grant ffcmapp_auth_nativo_owner to migrador_vinculos_fixture with admin true, inherit false, set false;
grant migrador_vinculos_fixture to current_user with inherit false, set true;
grant usage on schema auth_privado to migrador_vinculos_fixture with grant option;
grant execute on function auth_privado.uid() to migrador_vinculos_fixture with grant option;
alter schema public owner to migrador_vinculos_fixture;
alter schema cadastro owner to migrador_vinculos_fixture;
alter schema auditoria owner to migrador_vinculos_fixture;
alter schema api owner to migrador_vinculos_fixture;
alter table public.usuario owner to migrador_vinculos_fixture;
alter table cadastro.acesso_paciente owner to migrador_vinculos_fixture;
alter table auditoria.evento owner to migrador_vinculos_fixture;
set role migrador_vinculos_fixture;
\ir ../drafts/20261112140000_listar_vinculos_profissionais_privado.sql
reset role;
do $$ begin
 if not has_function_privilege('ffcmapp_listar_vinculos_owner','api.consultar_sessao_nativa(uuid)','execute') then raise exception 'GRANT_SESSAO_AUSENTE'; end if;
 if pg_has_role('migrador_vinculos_fixture','ffcmapp_auth_nativo_owner','SET') then raise exception 'MEMBERSHIP_SESSAO_NAO_RESTAURADA'; end if;
end $$;
insert into auth.users values ('10000000-0000-4000-8000-000000000003');
insert into public.usuario(id,perfil) values ('10000000-0000-4000-8000-000000000003','familia');
insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado) values
 ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'),
 ('50000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
do $$
declare r jsonb; req uuid:=gen_random_uuid();
begin
 if has_function_privilege('authenticated','api.listar_vinculos_profissionais_privado(uuid,uuid,uuid)','execute') then raise exception 'GRANT_INDEVIDO'; end if;
 perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001","amr":[{"method":"oauth"}]}',true);
 r:=api.listar_vinculos_profissionais_privado(req,'40000000-0000-4000-8000-000000000001',null);
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r#>'{dados,itens}')<>1 or r#>>'{dados,itens,0,usuario_id}' <> '10000000-0000-4000-8000-000000000002' then raise exception 'LISTA_INCORRETA %',r; end if;
 if not exists(select 1 from auditoria.evento where request_id=req and resultado='permitido') then raise exception 'AUDITORIA_AUSENTE'; end if;
 perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","amr":[{"method":"oauth"}]}',true);
 r:=api.listar_vinculos_profissionais_privado(gen_random_uuid(),'40000000-0000-4000-8000-000000000001',null);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'PROFISSIONAL_ACEITO'; end if;
end $$;
