\set ON_ERROR_STOP on
\ir anamnese_operacoes_local.sql
\ir ../migrations/20261111160000_admissao_familiar_privada.sql
\ir ../migrations/20261112030000_listar_pacientes_familiar_privado.sql
\ir ../migrations/20261112040000_consultar_paciente_familiar_privado.sql
\ir ../drafts/corrigir_auditoria_consulta_paciente_familiar.sql
update public.usuario set perfil='familia',ativo=true where id='10000000-0000-4000-8000-000000000002';
update identidade.sessao set metodo='familia',concessao_id=null,concessao_versao_admissao=null,revogada_em=null,encerrada_em=null where session_id='20000000-0000-4000-8000-000000000002';
insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado) values
('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
create function auditoria.suprimir_consulta_familiar_fixture() returns trigger language plpgsql as $$ begin return null; end $$;
grant execute on function api.consultar_paciente_familiar_privado(uuid,uuid) to authenticated;
do $$
declare r jsonb; req uuid:=gen_random_uuid(); paciente uuid:='40000000-0000-4000-8000-000000000001';
begin
 perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","amr":[{"method":"password"}]}',true);
 execute 'set local role authenticated';
 r:=api.consultar_paciente_familiar_privado(req,paciente);
 execute 'reset role';
 if r->>'ok' is distinct from 'true' then raise exception 'CONSULTA_NEGADA %',r; end if;
 if not exists(select 1 from auditoria.evento where request_id=req and resultado='permitido') then raise exception 'AUDITORIA_AUSENTE'; end if;
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id='10000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado='{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}' where id='50000000-0000-4000-8000-000000000001';
 execute 'set local role authenticated';
 r:=api.consultar_paciente_familiar_privado(gen_random_uuid(),paciente);
 execute 'reset role';
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'VINCULO_REVOGADO_ACEITO'; end if;
 update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null where id='50000000-0000-4000-8000-000000000001';
 create trigger suprimir_consulta_familiar before insert on auditoria.evento for each row execute function auditoria.suprimir_consulta_familiar_fixture();
 begin
  execute 'set local role authenticated';
  perform api.consultar_paciente_familiar_privado(gen_random_uuid(),paciente);
  raise exception 'CONSULTA_SEM_AUDITORIA';
 exception when no_data_found then if sqlerrm <> 'AUDITORIA_NAO_INSERIDA' then raise; end if; end;
 execute 'reset role';
 drop trigger suprimir_consulta_familiar on auditoria.evento;
end $$;
