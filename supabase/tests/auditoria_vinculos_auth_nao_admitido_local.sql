\set ON_ERROR_STOP on
\ir grants_vinculos_profissionais_local.sql
\ir ../migrations/20261112100000_auditoria_carteira_auth_nao_admitido.sql
create temp table acl_antes_auditoria as select oid,proacl,proowner from pg_proc where oid in (select oid from acl_vinculos);
\ir ../migrations/20261112220000_auditoria_vinculos_auth_nao_admitido.sql
do $$ begin if exists(select 1 from acl_antes_auditoria a join pg_proc p on p.oid=a.oid where p.proacl is distinct from a.proacl or p.proowner is distinct from a.proowner) then raise exception 'ACL_ALTERADA'; end if; end $$;
insert into auth.users values ('10000000-0000-4000-8000-000000000099');
insert into auth.sessions values ('20000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000099',null);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000099","session_id":"20000000-0000-4000-8000-000000000099","amr":[{"method":"password"}]}',false);
do $$ declare p record; t jsonb; r jsonb; req uuid; begin
 for p in select * from (values
 ('conceder_acesso_paciente_privado','api.conceder_acesso_paciente',jsonb_build_object('paciente_id',gen_random_uuid(),'acesso_id',gen_random_uuid(),'usuario_id',gen_random_uuid(),'reserva_id',gen_random_uuid(),'geracao_reserva',1,'auditoria_id',gen_random_uuid())),
 ('revogar_acesso_paciente_privado','api.revogar_acesso_paciente',jsonb_build_object('paciente_id',gen_random_uuid(),'acesso_id',gen_random_uuid(),'reserva_id',gen_random_uuid(),'geracao_reserva',1,'auditoria_id',gen_random_uuid())),
 ('acesso_barreira_composicao','api.consultar_barreira_concessao_acesso_profissional',jsonb_build_object('operacao','api.consultar_barreira_concessao_acesso_profissional'))
 ) v(nome,acao,entrada) loop
 req:=gen_random_uuid(); t:=public.assinar_anamnese_fixture(p.entrada||jsonb_build_object('request_id',req),p.acao,auth.uid(),(auth.jwt()->>'session_id')::uuid);
 execute 'set local role authenticated'; execute format('select api.%I($1)',p.nome) into r using t; execute 'reset role';
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'NEGATIVA_INVALIDA: %',p.nome; end if;
 if not exists(select 1 from auditoria.evento where request_id=req and ator_auth_id=auth.uid() and ator_usuario_id is null and resultado='negado' and acao=p.acao) then raise exception 'AUDITORIA_AUSENTE: %',p.nome; end if;
 end loop;
 req:=gen_random_uuid(); execute 'set local role authenticated'; select api.listar_vinculos_profissionais_privado(req,gen_random_uuid(),null) into r; execute 'reset role';
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' or not exists(select 1 from auditoria.evento where request_id=req and ator_auth_id=auth.uid() and ator_usuario_id is null and resultado='negado' and acao='api.listar_vinculos_profissionais') then raise exception 'LISTAGEM_INVALIDA'; end if;
end $$;

-- Policies impedem atribuir negação a outro Auth, mesmo com privilégio de coluna do owner.
do $$ declare papel text; begin
 foreach papel in array array['ffcmapp_conceder_acesso_owner','ffcmapp_revogar_acesso_owner','ffcmapp_acesso_barreira_owner','ffcmapp_listar_vinculos_owner'] loop
  begin
   execute format('set local role %I',papel);
   insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,resultado,request_id) values(gen_random_uuid(),'10000000-0000-4000-8000-000000000098',case papel when 'ffcmapp_conceder_acesso_owner' then 'api.conceder_acesso_paciente' when 'ffcmapp_revogar_acesso_owner' then 'api.revogar_acesso_paciente' when 'ffcmapp_acesso_barreira_owner' then 'api.consultar_barreira_concessao_acesso_profissional' else 'api.listar_vinculos_profissionais' end,case papel when 'ffcmapp_acesso_barreira_owner' then 'requisicao' when 'ffcmapp_listar_vinculos_owner' then 'paciente' else 'acesso_paciente' end,'negado',gen_random_uuid());
   raise exception 'IDENTIDADE_FORJADA_ACEITA';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
 end loop;
end $$;
