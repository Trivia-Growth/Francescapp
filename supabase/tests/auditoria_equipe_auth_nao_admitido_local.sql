\set ON_ERROR_STOP on
\ir grant_listar_concessoes_equipe_local.sql
\ir ../migrations/20261112100000_auditoria_carteira_auth_nao_admitido.sql
create temp table equipe_funcoes_antes as select oid,proacl,proowner from pg_proc where oid in ('api.listar_concessoes_equipe_privado(jsonb)'::regprocedure,'operacao.listar_concessoes_equipe_privado(jsonb)'::regprocedure);
\ir ../migrations/20261112230000_auditoria_equipe_auth_nao_admitido.sql
do $$ begin if exists(select 1 from equipe_funcoes_antes a join pg_proc p on p.oid=a.oid where p.proacl is distinct from a.proacl or p.proowner is distinct from a.proowner) then raise exception 'ACL_ALTERADA'; end if; end $$;
insert into auth.users values ('10000000-0000-4000-8000-000000000099');
insert into auth.sessions values ('20000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000099',null);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000099","session_id":"20000000-0000-4000-8000-000000000099","amr":[{"method":"password"}]}',false);
create function auditoria.falhar_equipe_fixture() returns trigger language plpgsql as $$ begin raise exception 'AUDITORIA_FIXTURE'; end $$;
do $$ declare req uuid:=gen_random_uuid(); t jsonb; r jsonb; begin
 t:=public.assinar_anamnese_fixture(jsonb_build_object('request_id',req,'limite',10),'api.listar_concessoes_equipe',auth.uid(),(auth.jwt()->>'session_id')::uuid);
 execute 'set local role authenticated'; select api.listar_concessoes_equipe_privado(t) into r; execute 'reset role';
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' or not exists(select 1 from auditoria.evento where request_id=req and ator_auth_id=auth.uid() and ator_usuario_id is null and resultado='negado' and acao='api.listar_concessoes_equipe') then raise exception 'AUDITORIA_INVALIDA'; end if;
 begin
  execute 'set local role ffcmapp_listar_equipe_owner';
  insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,resultado,request_id) values(gen_random_uuid(),'10000000-0000-4000-8000-000000000098','api.listar_concessoes_equipe','concessao_equipe','negado',gen_random_uuid());
  raise exception 'IDENTIDADE_FORJADA_ACEITA';
 exception when insufficient_privilege then null; end;
 execute 'reset role';
 create trigger falha_equipe before insert on auditoria.evento for each row execute function auditoria.falhar_equipe_fixture();
 begin
  execute 'set local role authenticated'; perform api.listar_concessoes_equipe_privado(t); raise exception 'FALHA_AUDITORIA_IGNORADA';
 exception when raise_exception then if sqlerrm<>'AUDITORIA_FIXTURE' then raise; end if; end;
 execute 'reset role'; drop trigger falha_equipe on auditoria.evento;
end $$;
