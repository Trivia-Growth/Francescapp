\set ON_ERROR_STOP on
\ir grants_jornada_privada_local.sql
\ir ../migrations/20261112100000_auditoria_carteira_auth_nao_admitido.sql
\ir ../migrations/20261112120000_corrigir_reserva_barreira_contato.sql
\ir ../migrations/20261112140000_auditoria_edicao_contato_auth_nao_admitido.sql
\ir ../drafts/20261112123000_grants_edicao_contato.sql
insert into auth.users values ('10000000-0000-4000-8000-000000000099');
insert into auth.sessions values ('20000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000099',null);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000099","session_id":"20000000-0000-4000-8000-000000000099","amr":[{"method":"password"}]}',false);
do $$
declare p record; t jsonb; r jsonb; req uuid;
begin
 for p in select * from (values
 ('consultar_paciente_edicao_privado','api.consultar_paciente_edicao',jsonb_build_object('paciente_id',gen_random_uuid())),
 ('edicao_paciente_composicao_privada','api.consultar_barreira_edicao_paciente',jsonb_build_object('operacao','api.consultar_barreira_edicao_paciente')),
 ('editar_paciente_privado','api.editar_paciente',jsonb_build_object('paciente_id',gen_random_uuid(),'versao_esperada',1,'reserva_id',gen_random_uuid(),'geracao_reserva',1,'auditoria_id',gen_random_uuid())),
 ('contato_barreira_composicao','api.consultar_barreira_criacao_contato',jsonb_build_object('operacao','api.consultar_barreira_criacao_contato')),
 ('criar_contato_paciente','api.criar_contato_paciente',jsonb_build_object('paciente_id',gen_random_uuid(),'contato_id',gen_random_uuid(),'reserva_id',gen_random_uuid(),'geracao_reserva',1,'auditoria_id',gen_random_uuid()))
 ) v(nome,acao,entrada) loop
  req:=gen_random_uuid();
  t:=public.assinar_anamnese_fixture(p.entrada||jsonb_build_object('request_id',req),p.acao,auth.uid(),(auth.jwt()->>'session_id')::uuid);
  execute 'set local role authenticated';
  execute format('select api.%I($1)',p.nome) into r using t;
  if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'NEGATIVA_INVALIDA: %',p.nome; end if;
  execute 'reset role';
  if not exists(select 1 from auditoria.evento where request_id=req and ator_auth_id=auth.uid() and ator_usuario_id is null and resultado='negado' and acao=p.acao) then raise exception 'AUDITORIA_AUSENTE: %',p.nome; end if;
  create trigger falha_auditoria_auth before insert on auditoria.evento for each row execute function auditoria.falhar_fixture();
  begin
   execute 'set local role authenticated';
   execute format('select api.%I($1)',p.nome) into r using t;
   raise exception 'AUDITORIA_FALHOU_SEM_ERRO: %',p.nome;
  exception when raise_exception then
   if sqlerrm <> 'AUDITORIA_FIXTURE' then raise; end if;
  end;
  execute 'reset role';
  drop trigger falha_auditoria_auth on auditoria.evento;
 end loop;
 if exists(select 1 from public.usuario where id=auth.uid()) then raise exception 'PERFIL_INVENTADO'; end if;
 for p in select * from (values
  ('ffcmapp_edicao_paciente_owner','api.editar_paciente','paciente'),
  ('ffcmapp_contato_barreira_owner','api.consultar_barreira_criacao_contato','requisicao'),
  ('ffcmapp_contato_owner','api.criar_contato_paciente','contato'),
  ('authenticated','api.editar_paciente','paciente')
 ) v(papel,acao,tipo) loop
  begin
   execute format('set local role %I',p.papel);
   insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,resultado,request_id) values(gen_random_uuid(),gen_random_uuid(),p.acao,p.tipo,'negado',gen_random_uuid());
   raise exception 'ATOR_FALSIFICADO: %',p.papel;
  exception when insufficient_privilege then null; end;
  execute 'reset role';
 end loop;
end $$;

-- Policies antigas concedem INSERT para ator admitido; não podem aceitar Auth alheio.
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001","amr":[{"method":"oauth"}]}',false);
do $$
declare p record;
begin
 for p in select * from (values
  ('ffcmapp_edicao_paciente_owner','api.editar_paciente','paciente'),
  ('ffcmapp_contato_barreira_owner','api.consultar_barreira_criacao_contato','requisicao'),
  ('ffcmapp_contato_owner','api.criar_contato_paciente','contato')
 ) v(papel,acao,tipo) loop
  if exists(select 1 from pg_roles where rolname=p.papel and (rolsuper or rolbypassrls or rolcanlogin)) then raise exception 'OWNER_PRIVILEGIADO: %',p.papel; end if;
  begin
   execute format('set local role %I',p.papel);
   insert into auditoria.evento(id,ator_usuario_id,ator_auth_id,acao,tipo_objeto,resultado,request_id)
    values(gen_random_uuid(),auth.uid(),'10000000-0000-4000-8000-000000000099',p.acao,p.tipo,'negado',gen_random_uuid());
   raise exception 'ATOR_DUPLO_ACEITO: %',p.papel;
  exception when insufficient_privilege then null; end;
  execute 'reset role';
 end loop;
 if has_function_privilege('authenticated','operacao.consultar_paciente_edicao_privado(jsonb)','execute')
  or has_function_privilege('authenticated','operacao.edicao_paciente_composicao_privada(jsonb)','execute')
  or has_function_privilege('authenticated','operacao.editar_paciente_privado(jsonb)','execute')
  or has_function_privilege('authenticated','operacao.contato_barreira_composicao_privada(jsonb)','execute')
  or has_function_privilege('authenticated','operacao.criar_contato_paciente_privado(jsonb)','execute') then raise exception 'EXECUCAO_DIRETA_PERMITIDA'; end if;
end $$;
