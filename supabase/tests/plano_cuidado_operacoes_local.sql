\set ON_ERROR_STOP on
\ir anamnese_operacoes_local.sql
\ir ../migrations/20261107120000_plano_cuidado_versoes_privadas.sql
grant ffcmapp_carteira_owner to current_user with inherit false, set true;
grant ffcmapp_atestado_verificador_owner to current_user with inherit true, set true;
\ir ../migrations/20261107130000_plano_cuidado_operacoes_privadas.sql
-- Papel não superusuário reproduz membership concedida sem SET.
begin;
create role migrador_plano_fixture nologin nosuperuser createrole;
grant ffcmapp_plano_owner to migrador_plano_fixture with admin true, inherit false, set false;
set role migrador_plano_fixture;
grant ffcmapp_plano_owner to migrador_plano_fixture with inherit true, set false granted by migrador_plano_fixture;
\set ON_ERROR_STOP off
\ir ../migrations/20261107140000_plano_cuidado_idempotencia_privada.sql
\if :ERROR
\else
\set ON_ERROR_STOP on
select 1/0; -- A migration deveria recusar membership sem SET.
\endif
\set ON_ERROR_STOP on
rollback;
do $$ begin
 if exists(select 1 from pg_policies where policyname='plano_requisicao_selecao') then
  raise exception 'FALHA_FECHADA_MEMBERSHIP';
 end if;
end $$;
grant ffcmapp_plano_owner to current_user with inherit true, set true;
\ir ../migrations/20261107140000_plano_cuidado_idempotencia_privada.sql

do $$
begin
 if not exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member
  where r.rolname='ffcmapp_plano_owner' and u.rolname=current_user and m.set_option and m.inherit_option) then
  raise exception 'MEMBERSHIP_PLANO_PREEXISTENTE_ALTERADA';
 end if;
 if not exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member
  where r.rolname='ffcmapp_carteira_owner' and u.rolname=current_user and m.set_option and not m.inherit_option)
  or not exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member
  where r.rolname='ffcmapp_atestado_verificador_owner' and u.rolname=current_user and m.set_option and m.inherit_option) then
  raise exception 'MEMBERSHIP_PREEXISTENTE_ALTERADA';
 end if;
end $$;

do $$
declare papel text;
begin
 foreach papel in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(papel,'api.plano_cuidado_privado(jsonb)','execute')
   or has_table_privilege(papel,'cadastro.objetivo_cuidado','select')
   or has_table_privilege(papel,'cadastro.objetivo_cuidado_versao','insert') then raise exception 'ACESSO_INDEVIDO: %',papel; end if;
 end loop;
end $$;

do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002'; paciente uuid:='40000000-0000-4000-8000-000000000001'; objetivo uuid:=gen_random_uuid(); registro uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); e jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'objetivo_id',objetivo,'registro_id',registro,'versao_esperada',0,'chave_idempotencia','plano-criacao','digest_idempotencia',repeat('a',43),
  'conteudo',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),
  'aad',jsonb_build_object('tabela','cadastro.objetivo_cuidado_versao','paciente_id',paciente::text,'objetivo_id',objetivo::text,'registro_id',registro::text,'versao',1,'campo','conteudo','formato',1));
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.gravar_objetivo_cuidado',ator,sessao));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,versao}' is distinct from '1' then raise exception 'ESCRITA: %',r; end if;
 if not exists(select 1 from auditoria.evento where request_id=req and resultado='permitido') then raise exception 'AUDITORIA_AUSENTE'; end if;
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.gravar_objetivo_cuidado',ator,sessao));
 if r->>'repeticao' is distinct from 'true' or r#>>'{dados,registro_id}' is distinct from registro::text then raise exception 'REPLAY: %',r; end if;
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(jsonb_set(e,'{digest_idempotencia}',to_jsonb(repeat('b',43))),'api.gravar_objetivo_cuidado',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'conflito_idempotencia' then raise exception 'CONFLITO_IDEMPOTENCIA: %',r; end if;
 registro:=gen_random_uuid();
 e:=jsonb_set(e,'{chave_idempotencia}',to_jsonb('plano-revisao'::text));
 e:=jsonb_set(jsonb_set(jsonb_set(e,'{registro_id}',to_jsonb(registro::text)),'{versao_esperada}','1'::jsonb),'{aad}',jsonb_build_object('tabela','cadastro.objetivo_cuidado_versao','paciente_id',paciente::text,'objetivo_id',objetivo::text,'registro_id',registro::text,'versao',2,'campo','conteudo','formato',1));
 begin
  perform api.plano_cuidado_privado(public.assinar_anamnese_fixture(jsonb_set(e,'{aad,objetivo_id}',to_jsonb(gen_random_uuid()::text)),'api.gravar_objetivo_cuidado',ator,sessao));
  raise exception 'AAD_INVALIDO_ACEITO';
 exception when invalid_parameter_value then null; end;
 perform set_config('fixture.falhar_auditoria','sim',true);
 begin
  perform api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.gravar_objetivo_cuidado',ator,sessao));
  raise exception 'FALHA_AUDITORIA_NAO_PROPAGADA';
 exception when raise_exception then
  if sqlerrm <> 'FALHA_AUDITORIA_FIXTURE' then raise; end if;
 end;
 perform set_config('fixture.falhar_auditoria','nao',true);
 if exists(select 1 from operacao.requisicao where chave_idempotencia='plano-revisao') or exists(select 1 from cadastro.objetivo_cuidado_versao where id=registro) then raise exception 'GRAVACAO_PARCIAL'; end if;
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.gravar_objetivo_cuidado',ator,sessao));
 if r#>>'{dados,versao}' is distinct from '2' then raise exception 'REVISAO: %',r; end if;
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sessao;
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.gravar_objetivo_cuidado',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'REPLAY_REVOGADO: %',r; end if;
 update identidade.sessao set encerrada_em=null where session_id=sessao;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente);
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_plano_cuidado',ator,sessao));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,0,objetivo_id}' is distinct from objetivo::text then raise exception 'LEITURA: %',r; end if;
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sessao;
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_plano_cuidado',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'SESSAO: %',r; end if;
 update identidade.sessao set encerrada_em=null where session_id=sessao;
 update public.usuario set perfil='familia' where id=ator;
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_plano_cuidado',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'FAMILIA: %',r; end if;
 update public.usuario set perfil='profissional' where id=ator;
end $$;
