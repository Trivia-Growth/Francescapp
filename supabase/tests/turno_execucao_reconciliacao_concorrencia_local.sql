\set ON_ERROR_STOP on
-- ESCRITO, NÃO EXECUTADO. Duas conexões PostgreSQL, sem mock de locks/commit.
\ir turno_execucao_reconciliacao_local.sql
create extension if not exists dblink;
update identidade.sessao set revogada_em=null,encerrada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id=(select profissional from turno_core_estado);
update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null,execucao_medicacao_concedida=true where usuario_id=(select profissional from turno_core_estado);
create function public.execucao_barreira_concorrente_fixture(ator uuid,sid uuid,e jsonb,acao text) returns jsonb language plpgsql as $$begin
 perform public.acessos_claims_fixture(ator,sid,'password');
 if acao='api.gravar_execucao_turno' then return public.turno_core_pedir_fixture(e,acao);end if;
 return public.execucao_barreira_pedir_fixture(e,acao);
end $$;
revoke all on function public.execucao_barreira_concorrente_fixture(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
select dblink_connect('execucao_barreira_race',format('dbname=%L host=%L user=%L application_name=execucao_barreira_race',current_database(),split_part(current_setting('unix_socket_directories'),',',1),current_user));
create temp table barreira_corrida(entrada jsonb,resultado jsonb);
-- Write commits before reload reconciliation: reload must wait and receive its receipt.
begin;
select public.acessos_claims_fixture(profissional,sid,'password') from turno_core_estado;
insert into barreira_corrida(entrada) select public.turno_core_gravacao_fixture('afericao',jsonb_build_object('turno_id',x.turno,'tipo','temperatura','valor',36.8,'unidade','°C','instante_afericao',clock_timestamp()-interval '1 minute'),gen_random_uuid(),1,x.paciente)||jsonb_build_object('epoca',b.epoca) from turno_core_estado x,operacao.turno_execucao_barreira b where b.ator_usuario_id=x.profissional;
update barreira_corrida set resultado=public.turno_core_pedir_fixture(entrada,'api.gravar_execucao_turno');
do $$begin if exists(select 1 from barreira_corrida where resultado->>'ok' is distinct from 'true') then raise exception 'CORRIDA_GRAVACAO_INICIAL';end if;end $$;
select dblink_send_query('execucao_barreira_race',format('select public.execucao_barreira_concorrente_fixture(%L::uuid,%L::uuid,%L::jsonb,%L)',x.profissional,x.sid,jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'comando_id',gen_random_uuid())::text,'api.reconciliar_execucao_turno')) from turno_core_estado x;
do $$declare tentativas integer:=0;begin while not exists(select 1 from pg_stat_activity where application_name='execucao_barreira_race' and wait_event_type='Lock') loop perform pg_sleep(0.01);tentativas:=tentativas+1;if tentativas>1000 then raise exception 'RECONCILIACAO_NAO_ESPEROU_COMMIT';end if;end loop;end $$;
commit;
create temp table barreira_corrida_resposta as select * from dblink_get_result('execucao_barreira_race') as t(resultado jsonb);
do $$begin if not exists(select 1 from barreira_corrida_resposta r,barreira_corrida c where r.resultado->>'ok'='true' and r.resultado#>>'{dados,resultado_pendente,recibo_id}'=c.resultado#>>'{dados,recibo_id}') then raise exception 'RELOAD_PERDEU_COMMIT_ANTERIOR';end if;end $$;
-- Explicitly acknowledge after comparing the persisted receipt, before a new intention.
select public.acessos_claims_fixture(profissional,sid,'password') from turno_core_estado;
select public.execucao_barreira_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'epoca',(r.resultado#>>'{dados,epoca}')::integer,'recibo_id',r.resultado#>>'{dados,resultado_pendente,recibo_id}'),'api.reconhecer_execucao_turno') from turno_core_estado x,barreira_corrida_resposta r;
-- Consult before an uncommitted/late request is insufficient. Bump first, then let old
-- AJAX arrive. It waits for the actor fence and must deny, never creating a second row.
truncate barreira_corrida;truncate barreira_corrida_resposta;
insert into barreira_corrida(entrada) select public.turno_core_gravacao_fixture('afericao',jsonb_build_object('turno_id',x.turno,'tipo','temperatura','valor',36.9,'unidade','°C','instante_afericao',clock_timestamp()-interval '1 minute'),gen_random_uuid(),1,x.paciente)||jsonb_build_object('epoca',b.epoca) from turno_core_estado x,operacao.turno_execucao_barreira b where b.ator_usuario_id=x.profissional;
begin;
select public.execucao_barreira_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'comando_id',gen_random_uuid()),'api.reconciliar_execucao_turno') from turno_core_estado x;
select dblink_send_query('execucao_barreira_race',format('select public.execucao_barreira_concorrente_fixture(%L::uuid,%L::uuid,%L::jsonb,%L)',x.profissional,x.sid,c.entrada::text,'api.gravar_execucao_turno')) from turno_core_estado x,barreira_corrida c;
do $$declare tentativas integer:=0;begin while not exists(select 1 from pg_stat_activity where application_name='execucao_barreira_race' and wait_event_type='Lock') loop perform pg_sleep(0.01);tentativas:=tentativas+1;if tentativas>1000 then raise exception 'AJAX_ANTIGO_NAO_ESPEROU_FENCE';end if;end loop;end $$;
commit;
insert into barreira_corrida_resposta select * from dblink_get_result('execucao_barreira_race') as t(resultado jsonb);
do $$begin
 if not exists(select 1 from barreira_corrida_resposta where resultado#>>'{erro,codigo}'='conflito' and not(resultado ? 'dados')) then raise exception 'AJAX_ANTIGO_ACEITO_APOS_RELOAD';end if;
 if exists(select 1 from cadastro.turno_execucao_registro r,barreira_corrida c where r.id=(c.entrada->>'registro_id')::uuid) or exists(select 1 from operacao.turno_execucao_recibo r,barreira_corrida c where r.registro_id=(c.entrada->>'registro_id')::uuid) then raise exception 'RELOAD_DUPLICOU_REGISTRO';end if;
end $$;
-- Authentication TTL must also be rechecked AFTER a blocked audit INSERT.
truncate barreira_corrida_resposta;
create temp table barreira_ttl_antes as select epoca,resultado_pendente from operacao.turno_execucao_barreira where ator_usuario_id=(select profissional from turno_core_estado);
create temp table barreira_comandos_antes as select count(*) quantidade from operacao.turno_execucao_reconciliacao;
begin;
lock table auditoria.evento in access exclusive mode;
select dblink_send_query('execucao_barreira_race',format('select public.execucao_barreira_concorrente_fixture(%L::uuid,%L::uuid,%L::jsonb,%L)',x.profissional,x.sid,jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'comando_id',gen_random_uuid())::text,'api.reconciliar_execucao_turno')) from turno_core_estado x;
do $$declare tentativas integer:=0;begin while not exists(select 1 from pg_stat_activity where application_name='execucao_barreira_race' and wait_event_type='Lock') loop perform pg_sleep(0.01);tentativas:=tentativas+1;if tentativas>1000 then raise exception 'AUDITORIA_NAO_BLOQUEOU';end if;end loop;end $$;
-- The fixture signer TTL is20s. This delay is written only; this proof was not run.
select pg_sleep(21);
commit;
insert into barreira_corrida_resposta select * from dblink_get_result('execucao_barreira_race') as t(resultado jsonb);
do $$begin
 if not exists(select 1 from barreira_corrida_resposta where resultado#>>'{erro,codigo}'='sem_permissao' and not(resultado ? 'dados')) then raise exception 'AUDITORIA_BLOQUEADA_RETORNOU_SUCESSO_EXPIRADO';end if;
 if exists(select epoca,resultado_pendente from operacao.turno_execucao_barreira where ator_usuario_id=(select profissional from turno_core_estado) except select * from barreira_ttl_antes) or (select count(*) from operacao.turno_execucao_reconciliacao)<>(select quantidade from barreira_comandos_antes) then raise exception 'TTL_EXPIRADO_DEIXOU_FENCE_OU_COMANDO';end if;
end $$;
select dblink_disconnect('execucao_barreira_race');
