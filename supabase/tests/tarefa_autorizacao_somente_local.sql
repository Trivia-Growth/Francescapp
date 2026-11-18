\set ON_ERROR_STOP on
-- PREPARADO, NÃO EXECUTADO: capability prova autorização sem listar conteúdo clínico.
\ir tarefa_rls_local.sql
\ir ../migrations/20261112100000_auditoria_carteira_auth_nao_admitido.sql
\ir ../migrations/20261112270000_auditoria_tarefas_auth_nao_admitido.sql
\ir ../migrations/20261112280000_leitura_tarefas_cuidado_privada.sql
\ir ../migrations/20261112300000_barreira_tarefa_cuidado_privada.sql
\ir tarefa_autorizacao_migrador_local.sql
\ir ../migrations/20261125110000_tarefa_autorizacao_somente.sql
create function public.suprimir_auditoria_tarefa_autorizacao_fixture() returns trigger language plpgsql as $$
begin if current_setting('fixture.tarefa_autorizacao_suprimir',true)='sim' then return null; end if; return new; end $$;
create trigger tarefa_autorizacao_auditoria_suprimida before insert on auditoria.evento for each row execute function public.suprimir_auditoria_tarefa_autorizacao_fixture();
do $$
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002'; paciente uuid:='40000000-0000-4000-8000-000000000001'; req uuid; e jsonb; r jsonb; invalido jsonb; transporte jsonb; perfil_teste text;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 req:=gen_random_uuid(); e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'autorizacao_somente',true);
 r:=api.ler_tarefas_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_tarefas_cuidado',ator,sessao));
 if r->>'ok' is distinct from 'true' or r->'dados' is distinct from '[]'::jsonb or not exists(select 1 from auditoria.evento where request_id=req and resultado='permitido' and ator_usuario_id=ator and acao='api.ler_tarefas_cuidado') then raise exception 'CAPABILITY_PROFISSIONAL_VINCULADO_FALHOU'; end if;
 -- Listagem sem flag mantém dados existentes, não se transforma em capability vazia.
 r:=api.ler_tarefas_cuidado_privado(public.assinar_anamnese_fixture(e-'autorizacao_somente','api.ler_tarefas_cuidado',ator,sessao));
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r->'dados')<1 or not (r#>'{dados,0}'?'conteudo') then raise exception 'LISTAGEM_REGREDIU'; end if;
 for invalido in select value from jsonb_array_elements('[false,null,"true",1,{},[]]'::jsonb) loop
  begin
   perform api.ler_tarefas_cuidado_privado(public.assinar_anamnese_fixture(e||jsonb_build_object('autorizacao_somente',invalido),'api.ler_tarefas_cuidado',ator,sessao));
   raise exception 'FLAG_INVALIDO_ACEITO';
  exception when invalid_parameter_value then if sqlerrm<>'ENTRADA_INVALIDA' then raise; end if; end;
 end loop;
 begin
  perform api.tarefa_cuidado_privado(public.assinar_anamnese_fixture(e,'api.gravar_tarefa_cuidado',ator,sessao));
  raise exception 'FLAG_EM_ESCRITA_ACEITO';
 exception when invalid_parameter_value then if sqlerrm<>'ENTRADA_INVALIDA' then raise; end if; end;
 begin perform api.ler_tarefas_cuidado_privado(public.assinar_anamnese_fixture(e||jsonb_build_object('limite',1),'api.ler_tarefas_cuidado',ator,sessao)); raise exception 'CAMPO_EXTRA_CAPABILITY_ACEITO'; exception when insufficient_privilege then null; end;
 transporte:=public.assinar_anamnese_fixture(e,'api.ler_tarefas_cuidado',ator,sessao);
 transporte:=jsonb_set(transporte,'{entrada,atestado,mac}',to_jsonb(repeat('a',43)));
 begin perform api.ler_tarefas_cuidado_privado(transporte); raise exception 'ATESTADO_FORJADO_ACEITO'; exception when insufficient_privilege then null; end;
 r:=api.ler_tarefas_cuidado_privado(public.assinar_anamnese_fixture(e||jsonb_build_object('paciente_id','40000000-0000-4000-8000-000000000002'),'api.ler_tarefas_cuidado',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'CAPABILITY_OUTRO_CASO_ACEITA'; end if;
 foreach perfil_teste in array array['familia','administrador'] loop
  update public.usuario set perfil=perfil_teste where id=ator;
  if perfil_teste='administrador' then update identidade.concessao_equipe set perfil='administrador' where usuario_id=ator; end if;
  r:=api.ler_tarefas_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_tarefas_cuidado',ator,sessao));
  if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'CAPABILITY_PERFIL_ACEITA: %',perfil_teste; end if;
 end loop;
 update public.usuario set perfil='profissional' where id=ator;
 update identidade.concessao_equipe set perfil='profissional' where usuario_id=ator;
 update identidade.concessao_equipe set estado='revogada',revogada_em=clock_timestamp(),revogada_por_usuario_id=ator,motivo_revogacao_cifrado=motivo_cifrado where usuario_id=ator;
 r:=api.ler_tarefas_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_tarefas_cuidado',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'CAPABILITY_CONCESSAO_REVOGADA_ACEITA'; end if;
 update identidade.concessao_equipe set estado='vinculada',revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id=ator;
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id='10000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado=motivo_concessao_cifrado where paciente_id=paciente and usuario_id=ator;
 r:=api.ler_tarefas_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_tarefas_cuidado',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'CAPABILITY_VINCULO_REVOGADO_ACEITA'; end if;
 update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null where paciente_id=paciente and usuario_id=ator;
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sessao;
 r:=api.ler_tarefas_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_tarefas_cuidado',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'CAPABILITY_SESSAO_REVOGADA_ACEITA'; end if;
 update identidade.sessao set encerrada_em=null where session_id=sessao;
 perform set_config('fixture.tarefa_autorizacao_suprimir','sim',true);
 begin perform api.ler_tarefas_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_tarefas_cuidado',ator,sessao)); raise exception 'CAPABILITY_SEM_AUDITORIA_ACEITA'; exception when no_data_found then if sqlerrm<>'AUDITORIA_NAO_INSERIDA' then raise; end if; end;
 perform set_config('fixture.tarefa_autorizacao_suprimir','nao',true);
end $$;
-- Prova forte de não leitura: retirar temporariamente SELECT clínico do owner.
-- Capability deve passar; listagem antiga continua dependendo legitimamente de SELECT.
begin;
revoke select on cadastro.tarefa_cuidado,cadastro.tarefa_cuidado_versao from ffcmapp_tarefa_owner;
do $$
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002'; e jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id','40000000-0000-4000-8000-000000000001','autorizacao_somente',true);
 r:=api.ler_tarefas_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_tarefas_cuidado',ator,sessao));
 if r->>'ok' is distinct from 'true' or r->'dados' is distinct from '[]'::jsonb then raise exception 'CAPABILITY_LEU_TAREFAS'; end if;
 begin perform api.ler_tarefas_cuidado_privado(public.assinar_anamnese_fixture(e-'autorizacao_somente','api.ler_tarefas_cuidado',ator,sessao)); raise exception 'LISTAGEM_NAO_EXERCE_SELECT'; exception when insufficient_privilege then null; end;
end $$;
rollback;
