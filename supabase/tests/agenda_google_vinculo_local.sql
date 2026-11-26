-- Continua no banco descartável preparado por agenda_google_autorizacao_local.sql.
update identidade.sessao set encerrada_em=null where session_id='20000000-0000-4000-8000-000000000002';
update identidade.concessao_equipe set estado='vinculada',revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id='10000000-0000-4000-8000-000000000004';
insert into identidade.agenda_google_credencial(usuario_id,subject_google,geracao)
values ('10000000-0000-4000-8000-000000000002','google-10000000-0000-4000-8000-000000000002',0),
('10000000-0000-4000-8000-000000000004','google-10000000-0000-4000-8000-000000000004',0);
create function public.vincular_agenda_concorrente_fixture(paciente uuid, evento text) returns jsonb language plpgsql as $$
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002'; e jsonb;
begin
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'evento_id',evento,'subject','google-'||ator,'geracao','0');
 return identidade.agenda_google_operacao_privada(public.assinar_agenda_fixture(e,'agenda.vincular',ator,sessao),null);
exception when insufficient_privilege then return jsonb_build_object('estado','negado');
end $$;
-- Mesmo preflight operacional, com login fictício existente e sem credencial.
create role agenda_runtime_fixture login nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_vault_executor to agenda_runtime_fixture with inherit false, set true;
\set runtime_login agenda_runtime_fixture
\ir ../../scripts/autorizar-agenda-executor.sql
do $$ begin
 if not pg_has_role('agenda_runtime_fixture','ffcmapp_agenda_google_executor','SET')
   or pg_has_role('agenda_runtime_fixture','ffcmapp_agenda_google_owner','MEMBER')
   or has_table_privilege('agenda_runtime_fixture','vault.decrypted_secrets','SELECT') then
  raise exception 'GRANT_RUNTIME_INDEVIDO';
 end if;
end $$;
insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id)
select ('40000000-0000-4000-8000-00000000000'||n)::uuid,'{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}', '10000000-0000-4000-8000-000000000001' from generate_series(1,2)n;
insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado)
values(gen_random_uuid(),'40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}');
do $$
declare r jsonb; e jsonb; ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
begin
 r:=public.vincular_agenda_concorrente_fixture('40000000-0000-4000-8000-000000000001','evento-vinculado');
 if r->>'estado' is distinct from 'vinculado' then raise exception 'VINCULO_ATIVO_NEGADO'; end if;
 r:=public.vincular_agenda_concorrente_fixture('40000000-0000-4000-8000-000000000002','evento-outro');
 if r->>'estado' is distinct from 'negado' then raise exception 'OUTRO_PACIENTE_ACEITO'; end if;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'subject','google-'||ator,'geracao','0','eventos',jsonb_build_array('evento-vinculado'));
 r:=identidade.agenda_google_operacao_privada(public.assinar_agenda_fixture(e,'agenda.consultar_vinculos',ator,sessao),null);
 if jsonb_array_length(r) <> 1 then raise exception 'LEITURA_VINCULO_ATIVO_FALHOU'; end if;
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id=ator,motivo_revogacao_cifrado=motivo_concessao_cifrado where paciente_id='40000000-0000-4000-8000-000000000001';
 r:=public.vincular_agenda_concorrente_fixture('40000000-0000-4000-8000-000000000001','evento-revogado');
 if r->>'estado' is distinct from 'negado' then raise exception 'VINCULO_REVOGADO_ACEITO'; end if;
 e:=jsonb_set(e,'{request_id}',to_jsonb(gen_random_uuid()));
 r:=identidade.agenda_google_operacao_privada(public.assinar_agenda_fixture(e,'agenda.consultar_vinculos',ator,sessao),null);
 if jsonb_array_length(r) <> 0 then raise exception 'REVOGACAO_VAZOU_NOME'; end if;
 -- Mesmo evento de outro profissional não é revelado na agenda individual.
 ator:='10000000-0000-4000-8000-000000000004'; sessao:='20000000-0000-4000-8000-000000000004';
 e:=e||jsonb_build_object('request_id',gen_random_uuid(),'subject','google-'||ator);
 r:=identidade.agenda_google_operacao_privada(public.assinar_agenda_fixture(e,'agenda.consultar_vinculos',ator,sessao),null);
 if jsonb_array_length(r) <> 0 then raise exception 'OUTRO_PROFISSIONAL_LEU'; end if;
end $$;
