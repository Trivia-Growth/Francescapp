\set ON_ERROR_STOP on
\ir anamnese_operacoes_local.sql
\ir ../migrations/20261107120000_plano_cuidado_versoes_privadas.sql
\ir ../migrations/20261116150000_aprovador_plano_catalogo.sql
\ir ../migrations/20261116160000_aprovador_plano_operacoes_privadas.sql
\ir ../migrations/20261116170000_aprovar_objetivo_plano_privado.sql

insert into auth.users values ('10000000-0000-4000-8000-000000000004');
insert into public.usuario(id,perfil) values ('10000000-0000-4000-8000-000000000004','familia');
insert into auth.sessions values ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004',null);

-- Fixture de um objetivo/versão existente, inserido diretamente (fora do fluxo atestado,
-- só pra ter um registro_id real pra aprovar). O paciente '40000000-...0001' já existe,
-- criado por anamnese_operacoes_local.sql.
do $$
declare
 objetivo uuid := gen_random_uuid(); registro uuid := gen_random_uuid();
 envelope jsonb := jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22));
begin
 insert into cadastro.objetivo_cuidado(id,paciente_id) values (objetivo,'40000000-0000-4000-8000-000000000001');
 insert into cadastro.objetivo_cuidado_versao(id,objetivo_id,versao,versao_esperada,conteudo_cifrado,criado_por_usuario_id)
  values (registro,objetivo,1,null,envelope,'10000000-0000-4000-8000-000000000001');
 perform set_config('fixture.registro_objetivo',registro::text,false);
end $$;

do $$
declare
 administrador uuid := '10000000-0000-4000-8000-000000000001';
 sessao_admin uuid := '20000000-0000-4000-8000-000000000001';
 profissional uuid := '10000000-0000-4000-8000-000000000002';
 sessao_prof uuid := '20000000-0000-4000-8000-000000000002';
 familia uuid := '10000000-0000-4000-8000-000000000004';
 sessao_familia uuid := '20000000-0000-4000-8000-000000000004';
 e jsonb; r jsonb;
begin
 if has_function_privilege('authenticated','api.aprovador_plano_privado(jsonb)','execute')
  or has_function_privilege('anon','api.aprovador_plano_privado(jsonb)','execute')
  or has_function_privilege('service_role','api.aprovador_plano_privado(jsonb)','execute')
  or has_function_privilege('authenticated','api.aprovar_objetivo_plano_privado(jsonb)','execute')
  or has_function_privilege('anon','api.aprovar_objetivo_plano_privado(jsonb)','execute')
  or has_function_privilege('service_role','api.aprovar_objetivo_plano_privado(jsonb)','execute') then
  raise exception 'EXECUCAO_DIRETA_PERMITIDA';
 end if;

 perform set_config('request.jwt.claims',jsonb_build_object('sub',administrador,'session_id',sessao_admin,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);

 -- Listagem vazia de aprovadores.
 e:=jsonb_build_object('request_id',gen_random_uuid());
 r:=api.aprovador_plano_privado(public.assinar_anamnese_fixture(e,'api.listar_aprovador_plano',administrador,sessao_admin));
 if r->>'ok' is distinct from 'true' or r->'dados' <> '[]'::jsonb then raise exception 'LISTAGEM_INICIAL: %',r; end if;

 -- Profissional tenta aprovar objetivo sem estar na lista: negado.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',profissional,'session_id',sessao_prof,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'registro_id',current_setting('fixture.registro_objetivo')::uuid);
 r:=api.aprovar_objetivo_plano_privado(public.assinar_anamnese_fixture(e,'api.aprovar_objetivo_plano',profissional,sessao_prof));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'PROFISSIONAL_NAO_LISTADO_APROVOU: %',r; end if;

 -- Administrador aprova diretamente (sempre autorizado, não precisa estar na lista).
 perform set_config('request.jwt.claims',jsonb_build_object('sub',administrador,'session_id',sessao_admin,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'registro_id',current_setting('fixture.registro_objetivo')::uuid);
 r:=api.aprovar_objetivo_plano_privado(public.assinar_anamnese_fixture(e,'api.aprovar_objetivo_plano',administrador,sessao_admin));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,aprovador_usuario_id}' is distinct from administrador::text then raise exception 'ADMIN_APROVACAO: %',r; end if;
 if not exists(select 1 from auditoria.evento where tipo_objeto='objetivo_cuidado_aprovacao' and objeto_id=current_setting('fixture.registro_objetivo')::uuid and resultado='permitido') then raise exception 'AUDITORIA_APROVACAO_AUSENTE'; end if;

 -- Replay: mesmo administrador aprova de novo, idempotente, sem duplicar linha.
 r:=api.aprovar_objetivo_plano_privado(public.assinar_anamnese_fixture(jsonb_set(e,'{request_id}',to_jsonb(gen_random_uuid())),'api.aprovar_objetivo_plano',administrador,sessao_admin));
 if r->>'ok' is distinct from 'true' or (select count(*) from cadastro.objetivo_cuidado_aprovacao where registro_id=current_setting('fixture.registro_objetivo')::uuid and aprovador_usuario_id=administrador)<>1 then
  raise exception 'REPLAY_APROVACAO: %',r;
 end if;

 -- registro_id inexistente: conflito, não entrada_invalida.
 e:=jsonb_build_object('request_id',gen_random_uuid(),'registro_id',gen_random_uuid());
 r:=api.aprovar_objetivo_plano_privado(public.assinar_anamnese_fixture(e,'api.aprovar_objetivo_plano',administrador,sessao_admin));
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'REGISTRO_INEXISTENTE: %',r; end if;

 -- Família nunca é colaborador geral: negada.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',familia,'session_id',sessao_familia,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'registro_id',current_setting('fixture.registro_objetivo')::uuid);
 r:=api.aprovar_objetivo_plano_privado(public.assinar_anamnese_fixture(e,'api.aprovar_objetivo_plano',familia,sessao_familia));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'FAMILIA_APROVOU: %',r; end if;

 -- Administrador indica o profissional como aprovador extra.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',administrador,'session_id',sessao_admin,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'usuario_id_aprovador',profissional,'ativo',true,'versao_esperada',0,'chave_idempotencia','aprovador-profissional','digest_idempotencia',repeat('a',43),'auditoria_id',gen_random_uuid());
 r:=api.aprovador_plano_privado(public.assinar_anamnese_fixture(e,'api.gravar_aprovador_plano',administrador,sessao_admin));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,versao}' is distinct from '1' then raise exception 'GRAVAR_APROVADOR: %',r; end if;

 -- Agora o profissional listado consegue aprovar.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',profissional,'session_id',sessao_prof,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'registro_id',current_setting('fixture.registro_objetivo')::uuid);
 r:=api.aprovar_objetivo_plano_privado(public.assinar_anamnese_fixture(e,'api.aprovar_objetivo_plano',profissional,sessao_prof));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,aprovador_usuario_id}' is distinct from profissional::text then raise exception 'PROFISSIONAL_LISTADO_NAO_APROVOU: %',r; end if;
 if (select count(*) from cadastro.objetivo_cuidado_aprovacao where registro_id=current_setting('fixture.registro_objetivo')::uuid)<>2 then raise exception 'APROVACOES_NAO_ACUMULAM'; end if;

 -- Administrador desativa o profissional como aprovador.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',administrador,'session_id',sessao_admin,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'usuario_id_aprovador',profissional,'ativo',false,'versao_esperada',1,'chave_idempotencia','aprovador-profissional-desativa','digest_idempotencia',repeat('b',43),'auditoria_id',gen_random_uuid());
 r:=api.aprovador_plano_privado(public.assinar_anamnese_fixture(e,'api.gravar_aprovador_plano',administrador,sessao_admin));
 if r#>>'{dados,ativo}' is distinct from 'false' or r#>>'{dados,versao}' is distinct from '2' then raise exception 'DESATIVAR_APROVADOR: %',r; end if;

 -- Profissional desativado perde a autorização de aprovar.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',profissional,'session_id',sessao_prof,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'registro_id',gen_random_uuid());
 r:=api.aprovar_objetivo_plano_privado(public.assinar_anamnese_fixture(e,'api.aprovar_objetivo_plano',profissional,sessao_prof));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'PROFISSIONAL_DESATIVADO_APROVOU: %',r; end if;

 -- Conflito de versão: versão esperada desatualizada não altera registro.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',administrador,'session_id',sessao_admin,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'usuario_id_aprovador',profissional,'ativo',true,'versao_esperada',1,'chave_idempotencia','aprovador-conflito','digest_idempotencia',repeat('c',43),'auditoria_id',gen_random_uuid());
 r:=api.aprovador_plano_privado(public.assinar_anamnese_fixture(e,'api.gravar_aprovador_plano',administrador,sessao_admin));
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'CONFLITO_VERSAO_APROVADOR: %',r; end if;
 if (select versao from identidade.aprovador_plano_cuidado where usuario_id=profissional)<>2 then raise exception 'CONFLITO_ALTEROU_APROVADOR'; end if;
end $$;
