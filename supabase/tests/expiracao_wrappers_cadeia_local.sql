-- Cadeia real local; Auth e Vault continuam fictícios.
\set ON_ERROR_STOP on
\ir operacoes_cadeia_local.sql
grant insert (id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) on auditoria.evento to ffcmapp_carteira_owner;
create function auditoria.atrasar_fixture() returns trigger language plpgsql as $$ begin perform pg_sleep(1.2); return new; end $$;
do $$
declare ator uuid:='10000000-0000-4000-8000-000000000001'; sessao uuid:='20000000-0000-4000-8000-000000000001';
 reserva uuid:=gen_random_uuid(); reserva_anterior uuid; paciente uuid:=gen_random_uuid(); recibo uuid:=gen_random_uuid(); req uuid; epoca bigint; e jsonb; t jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 select b.epoca,b.reserva_atual into epoca,reserva_anterior from operacao.barreira_cadastro b where b.ator_usuario_id=ator;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.encerrar_cadastro','epoca',epoca,'reserva_id',reserva_anterior,'comando_id',recibo);
 t:=pg_temp.assinar(e,'api.encerrar_cadastro',ator,sessao);
 execute 'set local role ffcm_operacoes_fixture'; r:=api.cadastro_composicao(t); execute 'reset role';
 if r#>>'{dados,estado}' is distinct from 'confirmada' then raise exception 'ENCERRAMENTO: %',r; end if;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.reconhecer_barreira_cadastro','comando_id',recibo);
 t:=pg_temp.assinar(e,'api.reconhecer_barreira_cadastro',ator,sessao);
 execute 'set local role ffcm_operacoes_fixture'; r:=api.cadastro_composicao(t); execute 'reset role';
 if r#>>'{dados,estado}' is distinct from 'reconhecido' then raise exception 'RECONHECIMENTO: %',r; end if;
 epoca:=epoca+1;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.reservar_cadastro','epoca',epoca,'reserva_id',reserva);
 t:=pg_temp.assinar(e,'api.reservar_cadastro',ator,sessao);
 execute 'set local role ffcm_operacoes_fixture'; r:=api.cadastro_composicao(t); execute 'reset role';
 if r#>>'{dados,estado}' is distinct from 'aberta' then raise exception 'RESERVA: %',r; end if;
 req:=gen_random_uuid();
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'reserva_id',reserva,'geracao_reserva',epoca,'auditoria_id',gen_random_uuid(),'chave_idempotencia','fixture-expiracao','digest_idempotencia',repeat('a',43),'nome',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),'aad',jsonb_build_object('nome',jsonb_build_object('tabela','cadastro.paciente','registro_id',paciente::text,'campo','nome','formato',1)));
 t:=pg_temp.assinar(e,'api.criar_paciente',ator,sessao);
 update auth.sessions set not_after=clock_timestamp()+interval '1 second' where id=sessao;
 create trigger atrasar before insert on auditoria.evento for each row execute function auditoria.atrasar_fixture();
 execute 'set local role ffcm_operacoes_fixture'; r:=api.criar_paciente(t); execute 'reset role';
 drop trigger atrasar on auditoria.evento;
 if r is distinct from jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req)
  or exists(select 1 from cadastro.paciente p where p.id=paciente)
  or exists(select 1 from operacao.requisicao q where q.chave_idempotencia='fixture-expiracao')
  or not exists(select 1 from operacao.reserva_cadastro x where x.id=reserva and x.estado='aberta')
  or (select count(*) from auditoria.evento a where a.request_id=req) <> 1
  or (select count(*) from auditoria.evento a where a.request_id=req and a.resultado='negado' and a.acao='api.criar_paciente' and a.objeto_id is null) <> 1 then raise exception 'CRIACAO_EXPIRADA: %',r; end if;
 update auth.sessions set not_after=null where id=sessao;
 req:=gen_random_uuid(); e:=jsonb_build_object('request_id',req,'limite',10); t:=pg_temp.assinar(e,'api.listar_pacientes',ator,sessao);
 update auth.sessions set not_after=clock_timestamp()+interval '1 second' where id=sessao;
 create trigger atrasar before insert on auditoria.evento for each row execute function auditoria.atrasar_fixture();
 execute 'set local role ffcm_operacoes_fixture'; r:=api.listar_pacientes(t); execute 'reset role';
 drop trigger atrasar on auditoria.evento;
 if r is distinct from jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req)
  or (select count(*) from auditoria.evento a where a.request_id=req) <> 1
  or (select count(*) from auditoria.evento a where a.request_id=req and a.resultado='negado' and a.acao='api.listar_pacientes' and a.objeto_id is null) <> 1 then raise exception 'CARTEIRA_EXPIRADA: %',r; end if;
end $$;
