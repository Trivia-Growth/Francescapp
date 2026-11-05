-- RASCUNHO: não executar antes de revisão. Canal SQL privilegiado separado.
-- psql -v projeto=REF -v codigo=CODIGO -v acao=autorizar|encerrar
--      -v request=UUID -v resultado=permitido|falhou|indeterminado
-- Autorização e concessão só se tornam visíveis juntas após COMMIT.
\set ON_ERROR_STOP on
select :'acao' = 'encerrar' as encerrando \gset
\if :encerrando
-- Primeira transação impede novas conexões antes de encerrar sessões existentes.
begin;
select set_config('ffcmapp.op_projeto', :'projeto', true),
       set_config('ffcmapp.op_codigo', :'codigo', true),
       set_config('ffcmapp.op_request', :'request', true),
       set_config('ffcmapp.op_posse', :'posse', true) \gset
do $$
declare v_papel name; v_codigo text := current_setting('ffcmapp.op_codigo');
begin
 if not exists(select 1 from identidade.bootstrap_tecnico_controle where projeto_ref=current_setting('ffcmapp.op_projeto')) then raise exception 'ALVO_NAO_CONFIGURADO'; end if;
 if not exists(select 1 from auditoria.evento where operador_restrito=v_codigo and acao='servico_teste.autorizado' and request_id=current_setting('ffcmapp.op_request')::uuid and resultado='permitido') then raise exception 'OPERACAO_NAO_AUTORIZADA'; end if;
 select o.papel_nome into strict v_papel from auditoria.operador_tecnico o join pg_catalog.pg_roles r on r.oid=o.papel_oid and r.rolname=o.papel_nome where o.codigo=v_codigo and o.tipo='servico_teste' and o.ativo and o.posse_ativa=current_setting('ffcmapp.op_posse');
 execute format('alter role %I nologin',v_papel);
 insert into auditoria.evento(id,operador_restrito,acao,tipo_objeto,resultado,request_id)
 values(gen_random_uuid(),v_codigo,'servico_teste.encerramento_iniciado','operacao','permitido',current_setting('ffcmapp.op_request')::uuid);
end $$;
commit;
\endif
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';
select set_config('ffcmapp.op_projeto', :'projeto', true),
       set_config('ffcmapp.op_codigo', :'codigo', true),
       set_config('ffcmapp.op_acao', :'acao', true),
       set_config('ffcmapp.op_request', :'request', true),
       set_config('ffcmapp.op_posse', :'posse', true),
       set_config('ffcmapp.op_resultado', :'resultado', true) \gset
do $$
declare
  v_projeto text := current_setting('ffcmapp.op_projeto');
  v_codigo text := current_setting('ffcmapp.op_codigo');
  v_acao text := current_setting('ffcmapp.op_acao');
  v_request uuid := current_setting('ffcmapp.op_request')::uuid;
  v_posse text := current_setting('ffcmapp.op_posse');
  v_resultado text := current_setting('ffcmapp.op_resultado');
  v_operador auditoria.operador_tecnico%rowtype;
  v_pid integer;
begin
  if v_projeto !~ '^[a-z0-9]{20}$' or v_codigo !~ '^op_[0-9a-f]{32}$' or v_posse !~ '^[0-9a-f]{64}$'
    or v_acao not in ('autorizar','encerrar')
    or v_resultado not in ('permitido','falhou','indeterminado') then
    raise exception 'ENTRADA_INVALIDA';
  end if;
  if not exists (select 1 from identidade.bootstrap_tecnico_controle where projeto_ref=v_projeto)
    or not exists (select 1 from identidade.cofre_servico_teste_configuracao where projeto_ref=v_projeto) then
    raise exception 'ALVO_NAO_CONFIGURADO';
  end if;
  if v_acao='encerrar' then
    if not exists(select 1 from auditoria.operador_tecnico where codigo=v_codigo and ativo and posse_ativa=v_posse) then raise exception 'POSSE_INVALIDA'; end if;
    -- Após NOLOGIN confirmado, termina sessões que poderiam segurar FOR SHARE.
    for v_pid in select a.pid from pg_catalog.pg_stat_activity a join auditoria.operador_tecnico o on o.papel_nome=a.usename where o.codigo=v_codigo and a.pid<>pg_backend_pid() loop
      if not pg_catalog.pg_terminate_backend(v_pid) then raise exception 'SESSAO_NAO_TERMINADA'; end if;
    end loop;
  end if;
  select * into strict v_operador from auditoria.operador_tecnico where codigo=v_codigo for update;
  if v_operador.tipo <> 'servico_teste' or not exists
    (select 1 from pg_catalog.pg_roles where oid=v_operador.papel_oid and rolname=v_operador.papel_nome and (v_acao='encerrar' or rolcanlogin)) then
    raise exception 'SERVICO_INVALIDO';
  end if;
  if v_acao='autorizar' then
    if exists(select 1 from pg_catalog.pg_auth_members m where m.member=v_operador.papel_oid
      or (m.roleid=v_operador.papel_oid and not coalesce(m.member=(select oid from pg_catalog.pg_roles where rolname='postgres') and m.grantor=(select oid from pg_catalog.pg_roles where rolname='supabase_admin') and m.admin_option and not m.inherit_option and not m.set_option,false)))
      or exists(select 1 from pg_catalog.pg_roles where oid=v_operador.papel_oid and (rolsuper or rolcreatedb or rolcreaterole or rolinherit or rolreplication or rolbypassrls))
      or exists(select 1 from pg_catalog.pg_shdepend where refclassid='pg_authid'::regclass and refobjid=v_operador.papel_oid and deptype in ('a','o'))
      or exists(select 1 from pg_catalog.pg_namespace n where n.nspname in ('identidade','auditoria','operacao','cadastro','vault') and has_schema_privilege(v_operador.papel_oid,n.oid,'USAGE'))
      or has_function_privilege(v_operador.papel_oid,'identidade.bootstrap_tecnico(text,uuid,uuid,jsonb,text,jsonb,uuid)','EXECUTE')
      or has_function_privilege(v_operador.papel_oid,'identidade.bootstrap_lote_servico(text,uuid,uuid,jsonb,text,jsonb,uuid,uuid,text)','EXECUTE')
      or has_function_privilege(v_operador.papel_oid,'identidade.ler_cofre_servico_teste(text,text,uuid,text)','EXECUTE')
      or has_function_privilege(v_operador.papel_oid,'identidade.ler_chave_cifra_vault(text)','EXECUTE')
      or has_function_privilege(v_operador.papel_oid,'identidade.ler_chave_hmac_email_bootstrap()','EXECUTE')
      or exists(select 1 from auditoria.evento where operador_restrito=v_codigo and acao='servico_teste.autorizado' and request_id=v_request)
      or v_operador.ativo or v_operador.posse_ativa is not null or v_operador.expira_em <= clock_timestamp()
      or v_operador.expira_em > clock_timestamp() + interval '1 hour' or v_resultado <> 'permitido' then
      raise exception 'AUTORIZACAO_INVALIDA';
    end if;
    insert into auditoria.evento(id,operador_restrito,acao,tipo_objeto,resultado,request_id)
      values(gen_random_uuid(),v_codigo,'servico_teste.autorizado','operacao','permitido',v_request);
    execute format('grant usage on schema identidade to %I',v_operador.papel_nome);
    execute format('grant execute on function identidade.bootstrap_lote_servico(text,uuid,uuid,jsonb,text,jsonb,uuid,uuid,text) to %I',v_operador.papel_nome);
    execute format('grant execute on function identidade.ler_cofre_servico_teste(text,text,uuid,text) to %I',v_operador.papel_nome);
    update auditoria.operador_tecnico set ativo=true, posse_ativa=v_posse where codigo=v_codigo;
  else
    update auditoria.operador_tecnico set ativo=false, posse_ativa=null where codigo=v_codigo and posse_ativa=v_posse;
    execute format('revoke execute on function identidade.bootstrap_lote_servico(text,uuid,uuid,jsonb,text,jsonb,uuid,uuid,text) from %I',v_operador.papel_nome);
    execute format('revoke execute on function identidade.ler_cofre_servico_teste(text,text,uuid,text) from %I',v_operador.papel_nome);
    execute format('alter role %I nologin',v_operador.papel_nome);
    if v_resultado='permitido' and (
      not exists(select 1 from auditoria.evento where operador_restrito=v_codigo and acao='bootstrap.tecnico' and request_id=v_request and resultado='permitido')
      or not exists(select 1 from auditoria.evento where operador_restrito=v_codigo and acao='servico_teste.lote' and request_id=v_request and resultado='permitido')
    ) then v_resultado := 'indeterminado'; end if;
    insert into auditoria.evento(id,operador_restrito,acao,tipo_objeto,resultado,request_id)
      values(gen_random_uuid(),v_codigo,case when v_resultado='indeterminado' then 'servico_teste.encerrado_indeterminado' else 'servico_teste.encerrado' end,'operacao',case when v_resultado='indeterminado' then 'falhou' else v_resultado end,v_request);
  end if;
end $$;
commit;
