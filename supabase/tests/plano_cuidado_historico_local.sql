\ir plano_cuidado_operacoes_local.sql
\ir ../migrations/20261107150000_plano_cuidado_historico_privado.sql

insert into cadastro.objetivo_cuidado(id,paciente_id) values ('50000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002');
insert into cadastro.objetivo_cuidado_versao(id,objetivo_id,versao,conteudo_cifrado,criado_por_usuario_id)
 values ('60000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002',1,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','10000000-0000-4000-8000-000000000002');

do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002'; paciente uuid:='40000000-0000-4000-8000-000000000001'; objetivo uuid; e jsonb; r jsonb; req uuid:=gen_random_uuid();
begin
 select id into objetivo from cadastro.objetivo_cuidado where paciente_id=paciente limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'objetivo_id',objetivo);
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_historico_objetivo_cuidado',ator,sessao));
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r->'dados')<>2 or r#>>'{dados,0,versao}'<>'1' or r#>>'{dados,1,versao}'<>'2' then raise exception 'HISTORICO: %',r; end if;
 if not exists(select 1 from auditoria.evento where request_id=req and resultado='permitido') then raise exception 'AUDITORIA_AUSENTE'; end if;
 perform set_config('fixture.falhar_auditoria','sim',true);
 begin
  perform api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_historico_objetivo_cuidado',ator,sessao));
  raise exception 'FALHA_AUDITORIA_NAO_PROPAGADA';
 exception when raise_exception then
  if sqlerrm <> 'FALHA_AUDITORIA_FIXTURE' then raise; end if;
 end;
 perform set_config('fixture.falhar_auditoria','nao',true);
 e:=jsonb_set(e,'{objetivo_id}',to_jsonb('50000000-0000-4000-8000-000000000002'::text));
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_historico_objetivo_cuidado',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'OBJETIVO_ALHEIO: %',r; end if;
 e:=jsonb_set(e,'{objetivo_id}',to_jsonb(objetivo::text));
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sessao;
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_historico_objetivo_cuidado',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'SESSAO: %',r; end if;
end $$;

do $$
declare papel text;
begin
 foreach papel in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(papel,'api.plano_cuidado_privado(jsonb)','execute')
   or has_function_privilege(papel,'api.plano_cuidado_operacao_privada(jsonb)','execute')
   or has_table_privilege(papel,'cadastro.objetivo_cuidado','select')
   or has_table_privilege(papel,'cadastro.objetivo_cuidado_versao','select') then
   raise exception 'ACESSO_DIRETO: %',papel;
  end if;
 end loop;
end $$;
