\set ON_ERROR_STOP on
\ir fundacao_carteira_nativa_autorizacao_fixture.sql
alter table identidade.configuracao_auth_nativo enable row level security;
\ir ../migrations/20261105120000_auth_privado.sql
\ir ../migrations/20261106180000_bloqueios_auth.sql
\ir ../migrations/20261106130000_carteira_nativa.sql
grant usage on schema bloqueios_auth to ffcmapp_carteira_owner;
grant execute on function bloqueios_auth.travar(uuid,uuid) to ffcmapp_carteira_owner;
\ir ../migrations/20261107100000_restringir_rls_carteira.sql
alter table identidade.concessao_equipe drop constraint concessao_equipe_metodo_check;
alter table identidade.concessao_equipe add constraint concessao_equipe_metodo_check check (metodo in ('google_workspace','tecnica'));
alter table identidade.concessao_equipe drop constraint concessao_estado_datas_chk;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('session_id',current_setting('ffcm_fixture.sessao',true),'amr',case when current_setting('ffcm_fixture.oauth',true)='senha' then '[{"method":"password"}]'::jsonb else '[{"method":"oauth"}]'::jsonb end) $$;
\ir ../migrations/20261110130000_carteira_tecnica_nativa.sql
begin;
insert into auth.users(id) values ('bb000000-0000-4000-8000-000000000001');
insert into public.usuario(id,perfil) values ('bb000000-0000-4000-8000-000000000001','administrador');
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,vinculada_em)
values ('bb000000-0000-4000-8000-000000000002','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','carteira-privada','administrador','tecnica','vinculada','bb000000-0000-4000-8000-000000000001',null,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',clock_timestamp());
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
values ('bb000000-0000-4000-8000-000000000003','bb000000-0000-4000-8000-000000000001','bb000000-0000-4000-8000-000000000002',1,'tecnica');
insert into auth.sessions(id,user_id) values ('bb000000-0000-4000-8000-000000000003','bb000000-0000-4000-8000-000000000001');
insert into auth.identities values ('bb000000-0000-4000-8000-000000000001','google','carteira-privada','{"sub":"carteira-privada","email_verified":true,"custom_claims":{"hd":"fixture.example"}}');
insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id) values
 ('bb000000-0000-4000-8000-000000000004','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','bb000000-0000-4000-8000-000000000001');
select set_config('ffcm_fixture.usuario','bb000000-0000-4000-8000-000000000001',true);
select set_config('ffcm_fixture.sessao','bb000000-0000-4000-8000-000000000003',true);
select set_config('ffcm_fixture.oauth','senha',true);
insert into identidade.excecao_tecnica(usuario_id,concessao_id,motivo_cifrado) values ('bb000000-0000-4000-8000-000000000001','bb000000-0000-4000-8000-000000000002','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
create function pg_temp.assinar(e jsonb) returns jsonb language plpgsql as $$
declare entrada text:=e::text; d jsonb; texto text; mac text;
begin
 d:=jsonb_build_object('key_id','teste','usuario_id',auth.uid(),'session_id',auth.jwt()->>'session_id',
 'request_id',e->>'request_id','operacao','api.listar_pacientes','emitido_em',clock_timestamp()-interval '1 second',
 'expira_em',clock_timestamp()+interval '20 seconds','digest_entrada',translate(rtrim(encode(extensions.digest(convert_to(entrada,'UTF8'),'sha256'),'base64'),'='),'+/','-_'));
 texto:=d::text; mac:=translate(rtrim(encode(extensions.hmac(convert_to('ffcmapp:atestado:v1:'||texto,'UTF8'),decode(repeat('42',32),'hex'),'sha256'),'base64'),'='),'+/','-_');
 return jsonb_build_object('entrada',e||jsonb_build_object('atestado',d||jsonb_build_object('mac',mac)),'entrada_canonica',entrada,'dados_canonicos',texto);
end $$;
do $$ declare t jsonb:=pg_temp.assinar('{"request_id":"bb000000-0000-4000-8000-000000000005","limite":10}'); r jsonb; n integer; begin
 r:=identidade.listar_carteira_privada(t);
 if r->>'ok'<>'true' or not (r#>'{dados,itens}' @> '[{"paciente_id":"bb000000-0000-4000-8000-000000000004"}]'::jsonb) then raise exception 'técnica negada: %',r; end if;
 execute 'set local role ffcmapp_carteira_owner'; select count(*) into n from cadastro.paciente; execute 'reset role';
 if n<1 then raise exception 'RLS negou técnica'; end if;
 delete from identidade.excecao_tecnica where usuario_id=auth.uid();
 r:=identidade.listar_carteira_privada(t);
 if r->>'ok'<>'false' then raise exception 'exceção removida aceita'; end if;
 execute 'set local role ffcmapp_carteira_owner'; select count(*) into n from cadastro.paciente; execute 'reset role';
 if n<>0 then raise exception 'RLS aceitou exceção removida'; end if;
end $$;
rollback;
