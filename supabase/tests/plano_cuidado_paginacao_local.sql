\ir plano_cuidado_historico_local.sql
\ir ../migrations/20261107160000_plano_cuidado_reserva_privada.sql
\ir ../migrations/20261108130000_plano_cuidado_paginacao_privada.sql
update identidade.sessao set encerrada_em=null where session_id='20000000-0000-4000-8000-000000000002';
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002'; paciente uuid:='40000000-0000-4000-8000-000000000001'; objetivo uuid; e jsonb; r jsonb; t jsonb; req uuid:=gen_random_uuid();
begin
 select id into objetivo from cadastro.objetivo_cuidado where paciente_id=paciente limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'objetivo_id',objetivo,'cursor',null,'limite',1);
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_historico_objetivo_cuidado',ator,sessao));
 if r#>>'{dados,itens,0,versao}'<>'1' or r#>>'{dados,proximo_cursor}'<>'1' then raise exception 'PRIMEIRA: %',r; end if;
 e:=jsonb_set(e,'{cursor}','1');
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_historico_objetivo_cuidado',ator,sessao));
 if r#>>'{dados,itens,0,versao}'<>'2' or r#>'{dados,proximo_cursor}'<>'null'::jsonb then raise exception 'SEGUNDA: %',r; end if;
 if (select count(*) from auditoria.evento where request_id=req and resultado='permitido')<>2 then raise exception 'AUDITORIA'; end if;
 t:=public.assinar_anamnese_fixture(e,'api.ler_historico_objetivo_cuidado',ator,sessao);
 t:=jsonb_set(t,'{entrada,cursor}','2');
 begin perform api.plano_cuidado_privado(t); raise exception 'ATESTADO_ACEITO'; exception when insufficient_privilege then null; end;
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'cursor',null,'limite',1);
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_plano_cuidado',ator,sessao));
 if jsonb_array_length(r#>'{dados,itens}')<>1 then raise exception 'PLANO: %',r; end if;
 e:=jsonb_set(e,'{cursor}',to_jsonb('ffffffff-ffff-ffff-ffff-ffffffffffff'::text));
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_plano_cuidado',ator,sessao));
 if jsonb_array_length(r#>'{dados,itens}')<>0 or r#>'{dados,proximo_cursor}'<>'null'::jsonb then raise exception 'VAZIO: %',r; end if;
 e:=jsonb_set(e,'{limite}','21');
 begin perform api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_plano_cuidado',ator,sessao)); raise exception 'LIMITE_ACEITO'; exception when invalid_parameter_value then null; end;
 e:=jsonb_set(e,'{limite}','1');
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sessao;
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_plano_cuidado',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'REVOGACAO'; end if;
end $$;
