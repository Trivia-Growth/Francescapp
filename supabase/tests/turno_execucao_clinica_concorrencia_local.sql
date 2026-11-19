\set ON_ERROR_STOP on
-- EXECUTADO LOCALMENTE em 19/11/2026: EXIT0; duas conexões reais, Auth/Vault sintéticos.
\ir turno_execucao_clinica_local.sql
create extension if not exists dblink;
create function public.turno_core_concorrente_fixture(ator uuid,sid uuid,e jsonb,acao text) returns jsonb language plpgsql as $$begin perform public.acessos_claims_fixture(ator,sid,'password');return public.turno_core_pedir_fixture(e,acao);end $$;
revoke all on function public.turno_core_concorrente_fixture(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
select dblink_connect('turno_core_race',format('dbname=%L host=%L user=%L application_name=turno_core_race',current_database(),split_part(current_setting('unix_socket_directories'),',',1),current_user));
create temp table turno_core_corrida(registro uuid primary key,entrada jsonb);
insert into turno_core_corrida select id,public.turno_core_gravacao_fixture('afericao',jsonb_build_object('turno_id',x.turno,'tipo','temperatura','valor',36.8,'unidade','°C','instante_afericao',clock_timestamp()-interval '1 minute'),id,1,x.paciente) from turno_core_estado x cross join lateral(select gen_random_uuid() id)novo;
-- Revocation takes the link lock first. In-flight creation must wait, then deny.
begin;
update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id=(select cm from turno_core_estado),motivo_revogacao_cifrado=public.acessos_envelope_fixture(),versao=versao+1 where paciente_id=(select paciente from turno_core_estado) and usuario_id=(select profissional from turno_core_estado);
select dblink_send_query('turno_core_race',format('select public.turno_core_concorrente_fixture(%L::uuid,%L::uuid,%L::jsonb,%L)',x.profissional,x.sid,c.entrada::text,'api.gravar_execucao_turno')) from turno_core_estado x,turno_core_corrida c;
do $$ declare esperas integer:=0;begin
 while not exists(select 1 from pg_stat_activity where application_name='turno_core_race' and wait_event_type='Lock') loop
  perform pg_sleep(0.01);esperas:=esperas+1;if esperas>1000 then raise exception 'CORRIDA_NAO_ESPEROU_LOCK';end if;
 end loop;
end $$;
commit;
create temp table turno_core_corrida_resultado as select * from dblink_get_result('turno_core_race') as t(resultado jsonb);
do $$begin
 if not exists(select 1 from turno_core_corrida_resultado where resultado->>'ok'='false' and resultado#>>'{erro,codigo}'='sem_permissao' and not(resultado ? 'dados')) or exists(select 1 from cadastro.turno_execucao_registro where id=(select registro from turno_core_corrida)) or exists(select 1 from operacao.turno_execucao_recibo where registro_id=(select registro from turno_core_corrida)) then raise exception 'REVOGACAO_CONCORRENTE_PERMITIU_ESCRITA';end if;
end $$;
update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null,versao=versao+1 where paciente_id=(select paciente from turno_core_estado) and usuario_id=(select profissional from turno_core_estado);
-- Opposite serialization: committed write is preserved when revocation follows.
truncate turno_core_corrida_resultado;
insert into turno_core_corrida_resultado select public.turno_core_concorrente_fixture(x.profissional,x.sid,c.entrada,'api.gravar_execucao_turno') from turno_core_estado x,turno_core_corrida c;
update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id=(select cm from turno_core_estado),motivo_revogacao_cifrado=public.acessos_envelope_fixture(),versao=versao+1 where paciente_id=(select paciente from turno_core_estado) and usuario_id=(select profissional from turno_core_estado);
do $$begin
 if not exists(select 1 from turno_core_corrida_resultado where resultado->>'ok'='true') or not exists(select 1 from cadastro.turno_execucao_registro where id=(select registro from turno_core_corrida)) then raise exception 'REVOGACAO_APAGOU_ESCRITA_ANTERIOR';end if;
end $$;
select dblink_disconnect('turno_core_race');

-- Post-audit TTL: all four private dispatchers must roll back their mutation after wait.
update identidade.sessao set revogada_em=null,encerrada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id=(select profissional from turno_core_estado);
update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null,execucao_medicacao_concedida=true where usuario_id=(select profissional from turno_core_estado);
create function public.turno_ttl_remoto_fixture(ator uuid,sid uuid,e jsonb,acao text) returns jsonb language plpgsql as $$begin
 perform public.acessos_claims_fixture(ator,sid,'password');return public.turno_core_pedir_fixture(e,acao);
end $$;
revoke all on function public.turno_ttl_remoto_fixture(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
select dblink_connect('turno_ttl',format('dbname=%L host=%L user=%L application_name=turno_ttl',current_database(),split_part(current_setting('unix_socket_directories'),',',1),current_user));
create temp table turno_ttl_caso(acao text,e jsonb,antes bigint);
create temp table turno_ttl_resultado(r jsonb);

truncate turno_ttl_caso;truncate turno_ttl_resultado;
insert into turno_ttl_caso select 'api.gravar_execucao_turno',public.turno_core_gravacao_fixture('afericao',jsonb_build_object('turno_id',x.turno,'tipo','temperatura','valor',36.6,'unidade','°C','instante_afericao',clock_timestamp()-interval '1 minute'),gen_random_uuid(),1,x.paciente),(select count(*) from cadastro.turno_execucao_registro) from turno_core_estado x;
begin;
lock table auditoria.evento in access exclusive mode;
select dblink_send_query('turno_ttl',format('select public.turno_ttl_remoto_fixture(%L::uuid,%L::uuid,%L::jsonb,%L)',x.profissional,x.sid,c.e::text,c.acao)) from turno_core_estado x,turno_ttl_caso c;
do $$declare tentativas integer:=0;begin
 while not exists(select 1 from pg_stat_activity where application_name='turno_ttl' and wait_event_type='Lock') loop perform pg_sleep(0.01);tentativas:=tentativas+1;if tentativas>1000 then raise exception 'TTL_NAO_ESPEROU_AUDITORIA';end if;end loop;
 perform pg_sleep(21); -- Synthetic signer20s; no client timestamp authority.
end $$;
commit;
insert into turno_ttl_resultado select * from dblink_get_result('turno_ttl') as t(r jsonb);
-- Drain the terminal empty result before reusing this asynchronous connection.
select count(*) from dblink_get_result('turno_ttl') as t(r jsonb);
do $$begin
 if not exists(select 1 from turno_ttl_resultado where r->>'ok'='false' and r#>>'{erro,codigo}'='sem_permissao' and not(r ? 'dados')) or (select count(*) from cadastro.turno_execucao_registro)<>(select antes from turno_ttl_caso) then raise exception 'TTL_POS_AUDITORIA_CONFIRMOU_gravar_execucao_turno';end if;
 if exists(select 1 from auditoria.evento a,turno_ttl_caso c where a.request_id=(c.e->>'request_id')::uuid and a.resultado='permitido') then raise exception 'TTL_AUDITORIA_PERMITIDA_PERSISTIU';end if;
end $$;

truncate turno_ttl_caso;truncate turno_ttl_resultado;
insert into turno_ttl_caso select 'api.consultar_relatorio_turno',jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'tipo','caso','inicio',clock_timestamp()-interval '1 day','fim',clock_timestamp(),'limite',25),(select count(*) from operacao.turno_relatorio_consulta) from turno_core_estado x;
begin;
lock table auditoria.evento in access exclusive mode;
select dblink_send_query('turno_ttl',format('select public.turno_ttl_remoto_fixture(%L::uuid,%L::uuid,%L::jsonb,%L)',x.profissional,x.sid,c.e::text,c.acao)) from turno_core_estado x,turno_ttl_caso c;
do $$declare tentativas integer:=0;begin
 while not exists(select 1 from pg_stat_activity where application_name='turno_ttl' and wait_event_type='Lock') loop perform pg_sleep(0.01);tentativas:=tentativas+1;if tentativas>1000 then raise exception 'TTL_NAO_ESPEROU_AUDITORIA';end if;end loop;
 perform pg_sleep(21); -- Synthetic signer20s; no client timestamp authority.
end $$;
commit;
insert into turno_ttl_resultado select * from dblink_get_result('turno_ttl') as t(r jsonb);
-- Drain the terminal empty result before reusing this asynchronous connection.
select count(*) from dblink_get_result('turno_ttl') as t(r jsonb);
do $$begin
 if not exists(select 1 from turno_ttl_resultado where r->>'ok'='false' and r#>>'{erro,codigo}'='sem_permissao' and not(r ? 'dados')) or (select count(*) from operacao.turno_relatorio_consulta)<>(select antes from turno_ttl_caso) then raise exception 'TTL_POS_AUDITORIA_CONFIRMOU_consultar_relatorio_turno';end if;
 if exists(select 1 from auditoria.evento a,turno_ttl_caso c where a.request_id=(c.e->>'request_id')::uuid and a.resultado='permitido') then raise exception 'TTL_AUDITORIA_PERMITIDA_PERSISTIU';end if;
end $$;

truncate turno_ttl_caso;truncate turno_ttl_resultado;
insert into turno_ttl_caso select 'api.gravar_consentimento_turno',jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'versao_esperada',(select coalesce(max(versao),0) from cadastro.turno_consentimento_localizacao where usuario_id=x.profissional),'concedido',true,'finalidade','Registrar localização declarada pelo aparelho na abertura e encerramento do turno.','audiencia','Administrador e case manager do caso.','retencao_dias',90,'chave_idempotencia',gen_random_uuid()::text,'digest_idempotencia',repeat('t',43)),(select count(*) from cadastro.turno_consentimento_localizacao) from turno_core_estado x;
begin;
lock table auditoria.evento in access exclusive mode;
select dblink_send_query('turno_ttl',format('select public.turno_ttl_remoto_fixture(%L::uuid,%L::uuid,%L::jsonb,%L)',x.profissional,x.sid,c.e::text,c.acao)) from turno_core_estado x,turno_ttl_caso c;
do $$declare tentativas integer:=0;begin
 while not exists(select 1 from pg_stat_activity where application_name='turno_ttl' and wait_event_type='Lock') loop perform pg_sleep(0.01);tentativas:=tentativas+1;if tentativas>1000 then raise exception 'TTL_NAO_ESPEROU_AUDITORIA';end if;end loop;
 perform pg_sleep(21); -- Synthetic signer20s; no client timestamp authority.
end $$;
commit;
insert into turno_ttl_resultado select * from dblink_get_result('turno_ttl') as t(r jsonb);
-- Drain the terminal empty result before reusing this asynchronous connection.
select count(*) from dblink_get_result('turno_ttl') as t(r jsonb);
do $$begin
 if not exists(select 1 from turno_ttl_resultado where r->>'ok'='false' and r#>>'{erro,codigo}'='sem_permissao' and not(r ? 'dados')) or (select count(*) from cadastro.turno_consentimento_localizacao)<>(select antes from turno_ttl_caso) then raise exception 'TTL_POS_AUDITORIA_CONFIRMOU_gravar_consentimento_turno';end if;
 if exists(select 1 from auditoria.evento a,turno_ttl_caso c where a.request_id=(c.e->>'request_id')::uuid and a.resultado='permitido') then raise exception 'TTL_AUDITORIA_PERMITIDA_PERSISTIU';end if;
end $$;

truncate turno_ttl_caso;truncate turno_ttl_resultado;
insert into turno_ttl_caso select 'api.reservar_anexo_turno',jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'anexo_id',gen_random_uuid(),'ocorrencia_id',x.ocorrencia,'ocorrencia_versao',(select max(versao) from cadastro.turno_ocorrencia_versao where registro_id=x.ocorrencia),'classificacao','execucao_turno','audiencia','equipe','mime_type','image/png','tamanho_bytes',24,'chave_idempotencia',gen_random_uuid()::text,'digest_idempotencia',repeat('u',43)),(select count(*) from cadastro.turno_anexo) from turno_core_estado x;
begin;
lock table auditoria.evento in access exclusive mode;
select dblink_send_query('turno_ttl',format('select public.turno_ttl_remoto_fixture(%L::uuid,%L::uuid,%L::jsonb,%L)',x.profissional,x.sid,c.e::text,c.acao)) from turno_core_estado x,turno_ttl_caso c;
do $$declare tentativas integer:=0;begin
 while not exists(select 1 from pg_stat_activity where application_name='turno_ttl' and wait_event_type='Lock') loop perform pg_sleep(0.01);tentativas:=tentativas+1;if tentativas>1000 then raise exception 'TTL_NAO_ESPEROU_AUDITORIA';end if;end loop;
 perform pg_sleep(21); -- Synthetic signer20s; no client timestamp authority.
end $$;
commit;
insert into turno_ttl_resultado select * from dblink_get_result('turno_ttl') as t(r jsonb);
-- Drain the terminal empty result before reusing this asynchronous connection.
select count(*) from dblink_get_result('turno_ttl') as t(r jsonb);
do $$begin
 if not exists(select 1 from turno_ttl_resultado where r->>'ok'='false' and r#>>'{erro,codigo}'='sem_permissao' and not(r ? 'dados')) or (select count(*) from cadastro.turno_anexo)<>(select antes from turno_ttl_caso) then raise exception 'TTL_POS_AUDITORIA_CONFIRMOU_reservar_anexo_turno';end if;
 if exists(select 1 from auditoria.evento a,turno_ttl_caso c where a.request_id=(c.e->>'request_id')::uuid and a.resultado='permitido') then raise exception 'TTL_AUDITORIA_PERMITIDA_PERSISTIU';end if;
end $$;
select dblink_disconnect('turno_ttl');
