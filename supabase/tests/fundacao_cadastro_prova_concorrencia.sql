-- APENAS cluster temporário dedicado: o setup e os efeitos são COMMITados.
-- São duas conexões reais; gateway JWT, Vault e canal seguro continuam fictícios.
\set ON_ERROR_STOP on
\set ffcm_fixture_concorrente 1
\ir fundacao_cadastro_prova_renovacao_integracao.sql
\ir ../drafts/20261102120000_saida_prova_experimento.sql
create extension dblink;
select dblink_connect('outra',format('dbname=%L host=%L port=%s',current_database(),current_setting('unix_socket_directories'),current_setting('port')));
select dblink_exec('outra', 'set statement_timeout=30000');
select dblink_exec('outra', 'set lock_timeout=10000');
select pid as ffcm_backend from dblink('outra','select pg_backend_pid()') as x(pid integer) \gset
create function pg_temp.espera_bloqueio(p_pid integer) returns void language plpgsql as $$
declare prazo timestamptz := clock_timestamp() + interval '3 seconds';
begin
 loop
   perform pg_stat_clear_snapshot();
   if exists (select 1 from pg_stat_activity a where a.pid=p_pid and a.wait_event_type='Lock'
       and pg_backend_pid()=any(pg_blocking_pids(a.pid))) then return; end if;
   if clock_timestamp() >= prazo then raise exception 'segunda conexão não esperou pelo lock desta transação'; end if;
   perform pg_sleep(0.02);
 end loop;
end $$;
select dblink_exec('outra', $$set ffcm_fixture.usuario='61000000-0000-4000-8000-000000000001'$$);
select dblink_exec('outra', $$set ffcm_fixture.sessao='63000000-0000-4000-8000-000000000001'$$);
select dblink_exec('outra', $$set request.jwt.claim.sub='61000000-0000-4000-8000-000000000001'$$);
select dblink_exec('outra', $$set request.jwt.claims='{"session_id":"63000000-0000-4000-8000-000000000001"}'$$);
select set_config('ffcm_fixture.usuario','61000000-0000-4000-8000-000000000001',false);
select set_config('ffcm_fixture.sessao','63000000-0000-4000-8000-000000000001',false);
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',false);
select set_config('request.jwt.claims','{"session_id":"63000000-0000-4000-8000-000000000001"}',false);

-- Renovação vence: cadastro espera lock, revalida e nega após commit.
begin;
do $$ begin
 if identidade.iniciar_prova_experimento('63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'),'67000000-0000-4000-8000-000000000001') is null then raise exception 'início de renovação negado'; end if;
end $$;
select dblink_send_query('outra', $$select experimento_atestado.criar_paciente_com_prova_fixture(
 experimento_atestado.assinar_fixture('{"request_id":"64000000-0000-4000-8000-000000000011","auditoria_id":"65000000-0000-4000-8000-000000000011","paciente_id":"66000000-0000-4000-8000-000000000011","chave_idempotencia":"concorrente-um","digest_idempotencia":"digest-um","nome":{"formato":1,"key_id":"v1","nonce":"fake","ciphertext":"fake","tag":"fake"},"aad":{"nome":{"tabela":"cadastro.paciente","registro_id":"66000000-0000-4000-8000-000000000011","campo":"nome","formato":1}}}'::jsonb),1,decode(repeat('01',32),'hex'))$$);
select pg_temp.espera_bloqueio(:ffcm_backend);
commit;
do $$ declare r jsonb; begin
 select resultado into r from dblink_get_result('outra') as x(resultado jsonb);
 if r->>'ok' is distinct from 'false' or exists(select 1 from cadastro.paciente where id='66000000-0000-4000-8000-000000000011') then raise exception 'cadastro admitido após início da troca'; end if;
end $$;
-- Consumir marcador final de resultado assíncrono antes de nova consulta.
select * from dblink_get_result('outra') as x(resultado jsonb);
-- Restauração de fixture para o teste inverso, não é recuperação de produção.
update identidade.credencial_sessao set estado='disponivel',tentativa_prova_fixture=null,verificador_anterior_fixture=null,xid_inicio_fixture=null where session_id='63000000-0000-4000-8000-000000000001';

-- Cadastro vence: a renovação espera o efeito protegido e só inicia após commit.
begin;
do $$ declare r jsonb; begin
 r := experimento_atestado.criar_paciente_com_prova_fixture(experimento_atestado.assinar_fixture('{"request_id":"64000000-0000-4000-8000-000000000012","auditoria_id":"65000000-0000-4000-8000-000000000012","paciente_id":"66000000-0000-4000-8000-000000000012","chave_idempotencia":"concorrente-dois","digest_idempotencia":"digest-dois","nome":{"formato":1,"key_id":"v1","nonce":"fake","ciphertext":"fake","tag":"fake"},"aad":{"nome":{"tabela":"cadastro.paciente","registro_id":"66000000-0000-4000-8000-000000000012","campo":"nome","formato":1}}}'::jsonb),1,decode(repeat('01',32),'hex'));
 if r->>'ok' is distinct from 'true' then raise exception 'cadastro válido negado'; end if;
end $$;
select dblink_send_query('outra', $$select identidade.iniciar_prova_experimento('63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'),'67000000-0000-4000-8000-000000000002')$$);
select pg_temp.espera_bloqueio(:ffcm_backend);
commit;
do $$ declare resultado jsonb; begin
 select x.resultado into resultado from dblink_get_result('outra') as x(resultado jsonb);
 if resultado is null or not exists(select 1 from identidade.credencial_sessao where session_id='63000000-0000-4000-8000-000000000001' and estado='em_troca') or not exists(select 1 from cadastro.paciente where id='66000000-0000-4000-8000-000000000012') then raise exception 'sequência cadastro-renovação incorreta'; end if;
end $$;
select * from dblink_get_result('outra') as x(resultado jsonb);
-- Sessões distintas evitam reabrir tombstones ao testar a ordem inversa.
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
select id,'61000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001',1,'tecnica'
from (values ('63000000-0000-4000-8000-000000000002'::uuid),('63000000-0000-4000-8000-000000000003'::uuid)) x(id);
insert into identidade.credencial_sessao(session_id,estado,geracao,envelope)
select id,'disponivel',1,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'::jsonb
from (values ('63000000-0000-4000-8000-000000000002'::uuid),('63000000-0000-4000-8000-000000000003'::uuid)) x(id);
insert into identidade.prova_saida_fixture(session_id,usuario_id,geracao,verificador)
select id,'61000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex')
from (values ('63000000-0000-4000-8000-000000000002'::uuid),('63000000-0000-4000-8000-000000000003'::uuid)) x(id);

-- Revogação vence: cadastro deve aguardar e negar após o commit.
select dblink_exec('outra', $$set ffcm_fixture.sessao='63000000-0000-4000-8000-000000000002'$$);
select dblink_exec('outra', $$set request.jwt.claims='{"session_id":"63000000-0000-4000-8000-000000000002"}'$$);
begin;
do $$ begin
 if saida_fixture.revogar('63000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'),'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}', '68000000-0000-4000-8000-000000000001') is distinct from true then raise exception 'revogação negada'; end if;
end $$;
select dblink_send_query('outra', $$select experimento_atestado.criar_paciente_com_prova_fixture(
 experimento_atestado.assinar_fixture('{"request_id":"64000000-0000-4000-8000-000000000013","auditoria_id":"65000000-0000-4000-8000-000000000013","paciente_id":"66000000-0000-4000-8000-000000000013","chave_idempotencia":"concorrente-tres","digest_idempotencia":"digest-tres","nome":{"formato":1,"key_id":"v1","nonce":"fake","ciphertext":"fake","tag":"fake"},"aad":{"nome":{"tabela":"cadastro.paciente","registro_id":"66000000-0000-4000-8000-000000000013","campo":"nome","formato":1}}}'::jsonb),1,decode(repeat('01',32),'hex'))$$);
select pg_temp.espera_bloqueio(:ffcm_backend);
commit;
do $$ declare r jsonb; begin
 select resultado into r from dblink_get_result('outra') as x(resultado jsonb);
 if r->>'ok' is distinct from 'false'
   or exists(select 1 from cadastro.paciente where id='66000000-0000-4000-8000-000000000013')
   or exists(select 1 from operacao.requisicao where chave_idempotencia='concorrente-tres')
   or not exists(select 1 from auditoria.evento where request_id='68000000-0000-4000-8000-000000000001' and acao='sessao.sair' and resultado='permitido')
   or not exists(select 1 from auditoria.evento where request_id='64000000-0000-4000-8000-000000000013' and acao='api.criar_paciente' and resultado='negado')
 then raise exception 'cadastro ou auditoria incorretos após revogação'; end if;
end $$;
select * from dblink_get_result('outra') as x(resultado jsonb);

-- Cadastro vence: revogação só grava depois do efeito autorizado.
select set_config('ffcm_fixture.sessao','63000000-0000-4000-8000-000000000003',false);
select set_config('request.jwt.claims','{"session_id":"63000000-0000-4000-8000-000000000003"}',false);
begin;
do $$ declare r jsonb; begin
 r := experimento_atestado.criar_paciente_com_prova_fixture(experimento_atestado.assinar_fixture('{"request_id":"64000000-0000-4000-8000-000000000014","auditoria_id":"65000000-0000-4000-8000-000000000014","paciente_id":"66000000-0000-4000-8000-000000000014","chave_idempotencia":"concorrente-quatro","digest_idempotencia":"digest-quatro","nome":{"formato":1,"key_id":"v1","nonce":"fake","ciphertext":"fake","tag":"fake"},"aad":{"nome":{"tabela":"cadastro.paciente","registro_id":"66000000-0000-4000-8000-000000000014","campo":"nome","formato":1}}}'::jsonb),1,decode(repeat('01',32),'hex'));
 if r->>'ok' is distinct from 'true' then raise exception 'cadastro anterior à revogação negado'; end if;
end $$;
select dblink_send_query('outra', $$select saida_fixture.revogar('63000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'),'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}', '68000000-0000-4000-8000-000000000002')$$);
select pg_temp.espera_bloqueio(:ffcm_backend);
commit;
do $$ declare r boolean; begin
 select resultado into r from dblink_get_result('outra') as x(resultado boolean);
 if r is distinct from true
   or not exists(select 1 from cadastro.paciente where id='66000000-0000-4000-8000-000000000014')
   or not exists(select 1 from operacao.requisicao where chave_idempotencia='concorrente-quatro' and estado='concluida' and resultado_id='66000000-0000-4000-8000-000000000014')
   or not exists(select 1 from identidade.sessao where session_id='63000000-0000-4000-8000-000000000003' and revogada_em is not null)
   or not exists(select 1 from auditoria.evento where request_id='64000000-0000-4000-8000-000000000014' and acao='api.criar_paciente' and resultado='permitido')
   or not exists(select 1 from auditoria.evento where request_id='68000000-0000-4000-8000-000000000002' and acao='sessao.sair' and resultado='permitido')
 then raise exception 'sequência cadastro-revogação ou auditoria incorreta'; end if;
end $$;
select * from dblink_get_result('outra') as x(resultado boolean);
select dblink_disconnect('outra');
