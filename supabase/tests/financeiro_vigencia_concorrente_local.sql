\set ON_ERROR_STOP on
-- FR-068 / design D4: a não sobreposição de vigências sob DUAS CONEXÕES REAIS.
-- Uma checagem prévia na aplicação passaria nas duas transações; só a restrição do banco
-- recusa a segunda. Este arquivo existe para provar isso, não para repetir o caso sequencial.
\ir financeiro_base_local.sql
create extension if not exists dblink;

-- Marca financeira concedida pela RPC administrativa (nunca por UPDATE direto).
do $$ declare r jsonb; begin
 r:=public.financeiro_chamar_fixture('api.financeiro_concessao_privado','api.gravar_concessao_financeira',
  jsonb_build_object('concessao_id','30000000-0000-4000-8000-000000000003','habilitado',true,'versao_esperada',0,
   'chave_idempotencia','marca-corrida','digest_idempotencia',repeat('c',43),'auditoria_id',gen_random_uuid()),
  '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
 if r->>'ok' is distinct from 'true' then raise exception 'MARCA_FALHOU: %',r; end if;
end $$;

create function public.financeiro_corrida_fixture(p_valor uuid,p_chave text,p_digest text) returns jsonb
 language sql as $$
 select public.financeiro_valor_fixture('api.registrar_valor_acordado',jsonb_build_object(
   'valor_id',p_valor,'profissional_usuario_id','10000000-0000-4000-8000-000000000002',
   'valor_turno_centavos',24000,'vigencia_inicio','2026-11-01','vigencia_fim',null,
   'motivo_cifrado',public.financeiro_envelope_fixture(),
   'chave_idempotencia',p_chave,'digest_idempotencia',p_digest,'auditoria_id',gen_random_uuid()),
  '10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003'); $$;
revoke all on function public.financeiro_corrida_fixture(uuid,text,text) from public,anon,authenticated,service_role;

select dblink_connect('financeiro_race',format('dbname=%L host=%L user=%L application_name=financeiro_race',current_database(),split_part(current_setting('unix_socket_directories'),',',1),current_user));

begin;
-- Conexão 1 grava e NÃO confirma: a vigência ainda não está visível para ninguém.
select public.financeiro_corrida_fixture('60000000-0000-4000-8000-00000000000a','corrida-a',repeat('a',43)) as primeira \gset
select dblink_send_query('financeiro_race',format('select public.financeiro_corrida_fixture(%L::uuid,%L,%L)','60000000-0000-4000-8000-00000000000b','corrida-b',repeat('b',43)));
-- Conexão 2 precisa esperar: a exclusion constraint bloqueia até a primeira decidir.
do $$ declare esperas integer:=0; begin
 while not exists(select 1 from pg_stat_activity where application_name='financeiro_race' and wait_event_type='Lock') loop
  perform pg_sleep(0.01); esperas:=esperas+1;
  if esperas>1000 then raise exception 'CORRIDA_NAO_ESPEROU_LOCK'; end if;
 end loop;
end $$;
commit;
create temp table financeiro_corrida_resultado as select * from dblink_get_result('financeiro_race') as t(resultado jsonb);
select dblink_disconnect('financeiro_race');

do $$ declare r jsonb; begin
 select resultado into r from financeiro_corrida_resultado;
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'CORRIDA_ACEITOU_SOBREPOSICAO: %',r; end if;
 if (select count(*) from financeiro.valor_acordado_turno where profissional_usuario_id='10000000-0000-4000-8000-000000000002')<>1 then raise exception 'DUAS_VIGENCIAS_APLICAVEIS'; end if;
 if not exists(select 1 from financeiro.valor_acordado_turno where id='60000000-0000-4000-8000-00000000000a') then raise exception 'PRIMEIRA_PERDIDA'; end if;
 if exists(select 1 from financeiro.valor_acordado_turno where id='60000000-0000-4000-8000-00000000000b') then raise exception 'SEGUNDA_PERSISTIDA'; end if;
 -- A recusa é auditada, não silenciosa.
 if not exists(select 1 from auditoria.evento where acao='api.registrar_valor_acordado' and resultado='negado') then raise exception 'AUDITORIA_CONFLITO_AUSENTE'; end if;
end $$;
\echo 'FINANCEIRO VIGENCIA CONCORRENTE OK'
