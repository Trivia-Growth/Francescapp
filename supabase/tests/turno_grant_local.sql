-- PREPARADO, NÃO EXECUTADO. Grant em banco descartável, jamais habilita produção.
-- Gate permanece desligado na aplicação da migration; fixture habilita apenas para a matriz.
update identidade.configuracao_sistema set valor='false' where chave='ffcm.turno.ativo';
\ir ../migrations/20261125100000_grant_turno_execucao_teste.sql
do $$
declare assinatura text;
begin
 foreach assinatura in array array['api.turno_privado(jsonb)','api.turno_barreira_composicao(jsonb)','api.registrar_negacao_turno(uuid,text,uuid,uuid)'] loop
  if not has_function_privilege('authenticated',to_regprocedure(assinatura),'EXECUTE')
   or has_function_privilege('anon',to_regprocedure(assinatura),'EXECUTE')
   or has_function_privilege('service_role',to_regprocedure(assinatura),'EXECUTE')
   or exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=to_regprocedure(assinatura) and (a.grantee not in (p.proowner,'authenticated'::regrole) or a.privilege_type<>'EXECUTE' or a.is_grantable)) then raise exception 'ACL_GRANT_INEXATA'; end if;
 end loop;
 if has_table_privilege('authenticated','cadastro.turno','SELECT,INSERT,UPDATE,DELETE')
  or has_table_privilege('authenticated','operacao.reserva_turno','SELECT,INSERT,UPDATE,DELETE')
  or pg_has_role('authenticated','ffcmapp_turno_owner','MEMBER')
  or pg_has_role('authenticated','ffcmapp_turno_barreira_owner','MEMBER') then raise exception 'GRANT_AMPLO'; end if;
end $$;
create temp table turno_grant_entrada(nome text primary key,transporte jsonb);
grant select on turno_grant_entrada to authenticated;
-- Ator/horário do atestado são fabricados SOMENTE por assinador sintético da fixture.
insert into turno_grant_entrada values('consulta',public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id','40000000-0000-4000-8000-000000000001','turno_id',gen_random_uuid()),'api.consultar_turno','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002'));
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","amr":[{"method":"oauth"}]}',false);
set role authenticated;
do $$ declare r jsonb; begin
 if api.registrar_negacao_turno(gen_random_uuid(),'api.abrir_turno') is distinct from true then raise exception 'AUDITORIA_PRE_COFRE_AUTHENTICATED_FALHOU'; end if;
 r:=api.turno_privado((select transporte from turno_grant_entrada where nome='consulta'));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'GRANT_IGNOROU_GATE'; end if;
end $$;
reset role;
update identidade.configuracao_sistema set valor='true' where chave='ffcm.turno.ativo';
-- Abertura nova pela wrapper acessível por authenticated, com reserva vinculada.
-- Encerramento direto a seguir é só setup de fixture, jamais lógica de produção.
update cadastro.turno set situacao='encerrado',encerrado_em=clock_timestamp(),versao=2 where situacao='aberto';
update operacao.barreira_turno set epoca=epoca+1,reserva_atual=null,resultado_pendente=null where ator_usuario_id='10000000-0000-4000-8000-000000000002';
create temp table turno_grant_alvo as select gen_random_uuid() turno_id,gen_random_uuid() reserva_id,epoca from operacao.barreira_turno where ator_usuario_id='10000000-0000-4000-8000-000000000002';
insert into turno_grant_entrada select 'reserva',public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.reservar_turno','epoca',epoca,'reserva_id',reserva_id,'paciente_id','40000000-0000-4000-8000-000000000001','turno_id',turno_id,'versao_esperada',0),'api.reservar_turno','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002') from turno_grant_alvo;
insert into turno_grant_entrada select 'abrir',public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid(),'reserva_id',reserva_id,'geracao_reserva',epoca,'paciente_id','40000000-0000-4000-8000-000000000001','turno_id',turno_id,'chave_idempotencia','grant-turno-fixture','digest_idempotencia',repeat('d',43)),'api.abrir_turno','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002') from turno_grant_alvo;
insert into turno_grant_entrada values('outro_caso',public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id','40000000-0000-4000-8000-000000000002','turno_id',gen_random_uuid()),'api.consultar_turno','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002'));
set role authenticated;
do $$ declare r jsonb; begin
 r:=api.turno_barreira_composicao((select transporte from turno_grant_entrada where nome='reserva'));
 if r#>>'{dados,estado}' is distinct from 'aberta' then raise exception 'RESERVA_AUTHENTICATED_FALHOU'; end if;
 r:=api.turno_privado((select transporte from turno_grant_entrada where nome='abrir'));
 if r->>'ok' is distinct from 'true' or r->>'repeticao' is distinct from 'false' or r#>>'{dados,parametros,duracao_padrao_minutos}' is distinct from '720' then raise exception 'ABERTURA_AUTHENTICATED_FALHOU'; end if;
 r:=api.turno_privado((select transporte from turno_grant_entrada where nome='abrir'));
 if r->>'ok' is distinct from 'true' or r->>'repeticao' is distinct from 'true' then raise exception 'REPLAY_AUTHENTICATED_FALHOU'; end if;
 r:=api.turno_privado((select transporte from turno_grant_entrada where nome='outro_caso'));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'OUTRO_CASO_AUTHENTICATED_ACEITO'; end if;
 begin perform 1 from cadastro.turno; raise exception 'TABELA_EXPOSTA_APOS_GRANT'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id='10000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado=motivo_concessao_cifrado where paciente_id='40000000-0000-4000-8000-000000000001' and usuario_id='10000000-0000-4000-8000-000000000002';
set role authenticated;
do $$ declare r jsonb; begin
 r:=api.turno_privado((select transporte from turno_grant_entrada where nome='abrir'));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'REPLAY_REVOGADO_AUTHENTICATED_ACEITO'; end if;
end $$;
reset role;
-- Termina desligado; executar matriz não declara ativação ou prova Auth real.
update identidade.configuracao_sistema set valor='false' where chave='ffcm.turno.ativo';

set role anon;
do $$ begin begin perform api.registrar_negacao_turno(gen_random_uuid(),'api.abrir_turno'); raise exception 'ANON_EXECUTE_NEGACAO_ACEITO'; exception when insufficient_privilege then null; end; end $$;
reset role;
