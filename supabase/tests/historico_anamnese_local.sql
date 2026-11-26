\set ON_ERROR_STOP on
\ir anamnese_auth_nao_admitido_local.sql
\ir ../migrations/20261112340000_historico_anamnese_privado.sql
insert into cadastro.anamnese_versao(id,paciente_id,versao,versao_esperada,conteudo_cifrado,criado_por_usuario_id)
select gen_random_uuid(),paciente_id,2,1,conteudo_cifrado,criado_por_usuario_id from cadastro.anamnese_versao where paciente_id='40000000-0000-4000-8000-000000000001' and versao=1;
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000001'; sessao uuid:='20000000-0000-4000-8000-000000000001'; paciente uuid:='40000000-0000-4000-8000-000000000001'; e jsonb; t jsonb; r jsonb; req uuid;
begin
 if has_function_privilege('authenticated','api.historico_anamnese_privada(jsonb)','execute') or has_function_privilege('anon','api.historico_anamnese_privada(jsonb)','execute') or has_function_privilege('service_role','api.historico_anamnese_privada(jsonb)','execute') then raise exception 'GRANT_INDEVIDO'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 req:=gen_random_uuid(); e:=jsonb_build_object('request_id',req,'paciente_id',paciente);
 r:=api.historico_anamnese_privada(public.assinar_anamnese_fixture(e,'api.ler_anamnese',ator,sessao));
 if r#>>'{dados,versao}' is distinct from '2' or r#>>'{dados,criado_por_usuario_id}' is distinct from '10000000-0000-4000-8000-000000000002' or (r#>>'{dados,criado_em}')::timestamptz is distinct from (select criado_em from cadastro.anamnese_versao where paciente_id=paciente and versao=2) or not exists(select 1 from auditoria.evento where request_id=req and resultado='permitido') then raise exception 'PAGINA_INICIAL: %',r; end if;
 e:=e||jsonb_build_object('request_id',gen_random_uuid(),'antes_versao',2);
 t:=public.assinar_anamnese_fixture(e,'api.ler_anamnese',ator,sessao);
 r:=api.historico_anamnese_privada(t);
 if r#>>'{dados,versao}' is distinct from '1' then raise exception 'PAGINA_ANTERIOR: %',r; end if;
 e:=e||jsonb_build_object('request_id',gen_random_uuid(),'antes_versao',1);
 r:=api.historico_anamnese_privada(public.assinar_anamnese_fixture(e,'api.ler_anamnese',ator,sessao));
 if r->'dados' is distinct from 'null'::jsonb then raise exception 'FIM_PAGINACAO: %',r; end if;
 begin
  perform api.historico_anamnese_privada(jsonb_set(t,'{entrada,antes_versao}','1'));
  raise exception 'CURSOR_ADULTERADO_ACEITO';
 exception when insufficient_privilege then null; end;
 perform set_config('fixture.falhar_auditoria','sim',true);
 begin
  perform api.historico_anamnese_privada(t);
  raise exception 'FALHA_AUDITORIA_IGNORADA';
 exception when raise_exception then
  if sqlerrm <> 'FALHA_AUDITORIA_FIXTURE' then raise; end if;
 end;
 perform set_config('fixture.falhar_auditoria','nao',true);
 update public.usuario set perfil='familia' where id=ator;
 r:=api.historico_anamnese_privada(t);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'FAMILIA: %',r; end if;
 update public.usuario set perfil='administrador' where id=ator;
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sessao;
 r:=api.historico_anamnese_privada(t);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'REVOGACAO: %',r; end if;
end $$;
