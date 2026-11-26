\set ON_ERROR_STOP on
-- PREPARADO, NÃO ATIVADO. Grant em banco descartável; jamais habilita produção.
-- Prova de ACL exata das superfícies financeiras, no molde de turno_grant_local.sql.
\ir financeiro_base_local.sql

-- ACL antes do grant: nenhum papel da aplicação alcança nada.
do $$ declare papel text; assinatura text; begin
 foreach papel in array array['anon','authenticated','service_role'] loop
  foreach assinatura in array array['api.financeiro_concessao_privado(jsonb)','api.financeiro_valor_privado(jsonb)','api.financeiro_despesa_privado(jsonb)','api.financeiro_apuracao_privado(jsonb)'] loop
   if has_function_privilege(papel,to_regprocedure(assinatura),'EXECUTE') then raise exception 'EXECUTE_PREEXISTENTE: % %',papel,assinatura; end if;
  end loop;
 end loop;
end $$;

\ir ../migrations/20261126200700_grant_financeiro_teste.sql

do $$ declare assinatura text; papel text; tabela text; begin
 foreach assinatura in array array['api.financeiro_concessao_privado(jsonb)','api.financeiro_valor_privado(jsonb)','api.financeiro_despesa_privado(jsonb)','api.financeiro_apuracao_privado(jsonb)'] loop
  if not has_function_privilege('authenticated',to_regprocedure(assinatura),'EXECUTE')
   or has_function_privilege('anon',to_regprocedure(assinatura),'EXECUTE')
   or has_function_privilege('service_role',to_regprocedure(assinatura),'EXECUTE')
   or exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
     where p.oid=to_regprocedure(assinatura)
       and (a.grantee not in (p.proowner,'authenticated'::regrole) or a.privilege_type<>'EXECUTE' or a.is_grantable)) then
   raise exception 'ACL_GRANT_INEXATA: %',assinatura; end if;
 end loop;
 -- A função de política do balde é a única `operacao.*` executável por authenticated, por
 -- exigência do Storage; nem anon nem service_role a alcançam.
 if not has_function_privilege('authenticated','operacao.objeto_comprovante_autorizado(text,text,boolean)','EXECUTE')
  or has_function_privilege('anon','operacao.objeto_comprovante_autorizado(text,text,boolean)','EXECUTE')
  or has_function_privilege('service_role','operacao.objeto_comprovante_autorizado(text,text,boolean)','EXECUTE') then raise exception 'ACL_POLITICA_BALDE_INEXATA'; end if;
 foreach papel in array array['anon','authenticated','service_role'] loop
  foreach tabela in array array['financeiro.valor_acordado_turno','financeiro.despesa_lancamento'] loop
   if has_table_privilege(papel,tabela,'SELECT,INSERT,UPDATE,DELETE') then raise exception 'TABELA_EXPOSTA: % %',papel,tabela; end if;
  end loop;
  if has_schema_privilege(papel,'financeiro','USAGE,CREATE') then raise exception 'SCHEMA_EXPOSTO: %',papel; end if;
  if has_function_privilege(papel,'operacao.financeiro_audiencia_privada(uuid,uuid)','EXECUTE')
   or has_function_privilege(papel,'operacao.financeiro_atestado_privada(jsonb,text[])','EXECUTE')
   or has_function_privilege(papel,'operacao.financeiro_valor_privada(jsonb)','EXECUTE')
   or has_function_privilege(papel,'operacao.financeiro_despesa_privada(jsonb)','EXECUTE')
   or has_function_privilege(papel,'operacao.financeiro_apuracao_privada(jsonb)','EXECUTE') then raise exception 'OPERACAO_INTERNA_EXPOSTA: %',papel; end if;
  if pg_has_role(papel,'ffcmapp_financeiro_owner','MEMBER')
   or pg_has_role(papel,'ffcmapp_financeiro_audiencia_owner','MEMBER')
   or pg_has_role(papel,'ffcmapp_financeiro_apuracao_owner','MEMBER')
   or pg_has_role(papel,'ffcmapp_financeiro_concessao_owner','MEMBER') then raise exception 'MEMBERSHIP_EXPOSTA: %',papel; end if;
 end loop;
end $$;

-- O grant abre a porta; a autorização continua no banco. Sem a marca financeira, nega.
create temp table financeiro_grant_entrada(nome text primary key,transporte jsonb);
grant select on financeiro_grant_entrada to authenticated;
insert into financeiro_grant_entrada values('consulta',public.assinar_anamnese_fixture(
 jsonb_build_object('request_id',gen_random_uuid(),'profissional_usuario_id','10000000-0000-4000-8000-000000000002'),
 'api.consultar_valor_acordado','10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003'));
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","session_id":"20000000-0000-4000-8000-000000000003","amr":[{"method":"oauth"}]}',false);
set role authenticated;
do $$ declare r jsonb; begin
 r:=api.financeiro_valor_privado((select transporte from financeiro_grant_entrada where nome='consulta'));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'GRANT_IGNOROU_CONCESSAO: %',r; end if;
 begin perform 1 from financeiro.valor_acordado_turno; raise exception 'TABELA_EXPOSTA_APOS_GRANT';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Com a marca concedida pela RPC administrativa, a mesma chamada passa.
do $$ declare r jsonb; begin
 r:=public.financeiro_chamar_fixture('api.financeiro_concessao_privado','api.gravar_concessao_financeira',
  jsonb_build_object('concessao_id','30000000-0000-4000-8000-000000000003','habilitado',true,'versao_esperada',0,
   'chave_idempotencia','marca-grant','digest_idempotencia',repeat('c',43),'auditoria_id',gen_random_uuid()),
  '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
 if r->>'ok' is distinct from 'true' then raise exception 'MARCA_FALHOU: %',r; end if;
end $$;
insert into financeiro_grant_entrada values('consulta2',public.assinar_anamnese_fixture(
 jsonb_build_object('request_id',gen_random_uuid(),'profissional_usuario_id','10000000-0000-4000-8000-000000000002'),
 'api.consultar_valor_acordado','10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003'));
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","session_id":"20000000-0000-4000-8000-000000000003","amr":[{"method":"oauth"}]}',false);
set role authenticated;
do $$ declare r jsonb; begin
 r:=api.financeiro_valor_privado((select transporte from financeiro_grant_entrada where nome='consulta2'));
 if r->>'ok' is distinct from 'true' then raise exception 'CONCESSAO_VIGENTE_NEGADA: %',r; end if;
end $$;
reset role;
set role anon;
do $$ begin
 begin perform api.financeiro_valor_privado('{}'::jsonb); raise exception 'ANON_EXECUTE_ACEITO';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
\echo 'FINANCEIRO GRANT OK'
