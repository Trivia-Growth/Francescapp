\set ON_ERROR_STOP on
-- PREPARADO, NÃO EXECUTADO. Apenas fixtures fictícias em banco descartável.
-- Base reutilizada sem alterar/remover sua matriz negativa.
\ir turno_execucao_local.sql

-- CREATE OR REPLACE como NOSUPERUSER dono da função, sem manipular membership
-- de owners da aplicação. Transferência abaixo é exclusivamente setup da fixture.
create role ffcm_turno_atual_migrador_fixture nologin nosuperuser nocreaterole noinherit;
grant ffcm_turno_atual_migrador_fixture to current_user with inherit false,set true;
grant usage,create on schema operacao to ffcm_turno_atual_migrador_fixture;
grant usage on schema cadastro,identidade,public,auditoria,auth_privado,bloqueios_auth to ffcm_turno_atual_migrador_fixture;
alter function operacao.turno_operacao_privada(jsonb) owner to ffcm_turno_atual_migrador_fixture;
create temp table turno_atual_acl_antes as select oid,proowner,proacl,prosecdef,proconfig from pg_proc where oid in ('operacao.turno_operacao_privada(jsonb)'::regprocedure,'api.turno_privado(jsonb)'::regprocedure,'api.registrar_negacao_turno(uuid,text,uuid,uuid)'::regprocedure);
create temp table turno_atual_members_antes as select * from pg_auth_members;
create temp table turno_atual_schemas_antes as select oid,nspacl,nspowner from pg_namespace where nspname in ('api','operacao');
set role ffcm_turno_atual_migrador_fixture;
do $$ begin if (select rolsuper from pg_roles where rolname=current_user) then raise exception 'MIGRADOR_SUPERUSER'; end if; end $$;
\ir ../migrations/20261125130000_turno_consulta_atual.sql
reset role;
do $$ begin
 if exists((select oid,proowner,proacl,prosecdef,proconfig from pg_proc where oid in (select oid from turno_atual_acl_antes) except select * from turno_atual_acl_antes)
 union all (select * from turno_atual_acl_antes except select oid,proowner,proacl,prosecdef,proconfig from pg_proc where oid in (select oid from turno_atual_acl_antes)))
 or exists((select * from pg_auth_members except select * from turno_atual_members_antes) union all (select * from turno_atual_members_antes except select * from pg_auth_members))
 or exists((select oid,nspacl,nspowner from pg_namespace where nspname in ('api','operacao') except select * from turno_atual_schemas_antes) union all (select * from turno_atual_schemas_antes except select oid,nspacl,nspowner from pg_namespace where nspname in ('api','operacao'))) then raise exception 'MIGRATION_ALTEROU_PRIVILEGIOS'; end if;
end $$;

update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null where paciente_id='40000000-0000-4000-8000-000000000001' and usuario_id='10000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","amr":[{"method":"oauth"}]}',false);
-- Assinador sintético permanece no setup privilegiado. Consulta executada como authenticated.
create function public.consultar_turno_atual_fixture(e jsonb) returns jsonb language plpgsql as $$
declare transporte jsonb; r jsonb;
begin
 transporte:=public.assinar_anamnese_fixture(e,'api.consultar_turno',auth_privado.uid(),(auth_privado.jwt()->>'session_id')::uuid);
 set local role authenticated;
 r:=api.turno_privado(transporte);
 reset role;
 return r;
end $$;
revoke all on function public.consultar_turno_atual_fixture(jsonb) from public,anon,authenticated,service_role;

do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; e jsonb; r jsonb; aberto uuid; perfil text; req uuid;
begin
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente);
 -- Flag fechada não é vazio; existe turno aberto criado na base.
 r:=public.consultar_turno_atual_fixture(e);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'FLAG_FECHADA_VIROU_VAZIO'; end if;
 update identidade.configuracao_sistema set valor='true' where chave='ffcm.turno.ativo';
 select id into strict aberto from cadastro.turno where paciente_id=paciente and profissional_usuario_id=ator and situacao='aberto';
 req:=gen_random_uuid();e:=jsonb_build_object('request_id',req,'paciente_id',paciente);
 r:=public.consultar_turno_atual_fixture(e);
 if r#>>'{dados,turno_id}' is distinct from aberto::text or r#>>'{dados,situacao}' is distinct from 'aberto'
 or not exists(select 1 from auditoria.evento where request_id=req and ator_usuario_id=ator and acao='api.consultar_turno' and resultado='permitido') then raise exception 'ATUAL_PROPRIO_NAO_AUDITADO'; end if;
 -- UUID anterior continua consultável sem alterar semântica.
 r:=public.consultar_turno_atual_fixture(e||jsonb_build_object('turno_id',aberto));
 if r#>>'{dados,turno_id}' is distinct from aberto::text then raise exception 'CONSULTA_UUID_REGREDIU'; end if;
 -- Auditoria silenciosamente suprimida aborta leitura, nunca retorna dados.
 perform set_config('fixture.turno_suprimir','sim',true);
 begin
  perform public.consultar_turno_atual_fixture(e);raise exception 'AUDITORIA_AUSENTE_ACEITA';
 exception when no_data_found then if sqlerrm<>'AUDITORIA_NAO_INSERIDA' then raise; end if; end;
 perform set_config('fixture.turno_suprimir','nao',true);
 -- Fechado próprio não pode reaparecer na consulta atual, mas UUID preserva histórico próprio.
 update cadastro.turno set situacao='encerrado',encerrado_em=clock_timestamp(),versao=versao+1 where id=aberto;
 r:=public.consultar_turno_atual_fixture(e);
 if r->>'ok' is distinct from 'true' or r->'dados' is distinct from 'null'::jsonb then raise exception 'ENCERRADO_EXPOSTO_COMO_ATUAL'; end if;
 r:=public.consultar_turno_atual_fixture(e||jsonb_build_object('turno_id',aberto));
 if r#>>'{dados,turno_id}' is distinct from aberto::text then raise exception 'HISTORICO_UUID_REGREDIU'; end if;
 -- Outro profissional com turno no mesmo caso não preenche o vazio do ator.
 insert into cadastro.turno(id,paciente_id,profissional_usuario_id,parametros) select gen_random_uuid(),paciente,'10000000-0000-4000-8000-000000000001',parametros from cadastro.turno where id=aberto;
 r:=public.consultar_turno_atual_fixture(e);
 if r->'dados' is distinct from 'null'::jsonb then raise exception 'TURNO_ALHEIO_EXPOSTO'; end if;
 -- Reabre outro agregado APENAS como setup privilegiado, preservando o encerrado.
 insert into cadastro.turno(id,paciente_id,profissional_usuario_id,parametros) select gen_random_uuid(),paciente,ator,parametros from cadastro.turno where id=aberto;
 -- Outro caso autorizado não pode receber turno do caso anterior.
 insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado)
 select gen_random_uuid(),'40000000-0000-4000-8000-000000000002',ator,'10000000-0000-4000-8000-000000000001',motivo_concessao_cifrado from cadastro.acesso_paciente where paciente_id=paciente and usuario_id=ator;
 r:=public.consultar_turno_atual_fixture(e||jsonb_build_object('paciente_id','40000000-0000-4000-8000-000000000002'));
 if r->>'ok' is distinct from 'true' or r->'dados' is distinct from 'null'::jsonb then raise exception 'FILTRO_CASO_AUSENTE'; end if;
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id='10000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado=motivo_concessao_cifrado where paciente_id='40000000-0000-4000-8000-000000000002' and usuario_id=ator;
 r:=public.consultar_turno_atual_fixture(e||jsonb_build_object('paciente_id','40000000-0000-4000-8000-000000000002'));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'OUTRO_CASO_SEM_VINCULO_ACEITO'; end if;
 -- Negativas independentes, com restauração da fixture após cada uma.
 foreach perfil in array array['familia','administrador'] loop
  update public.usuario set perfil=perfil where id=ator;
  r:=public.consultar_turno_atual_fixture(e);
  if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'PERFIL_NAO_PROFISSIONAL_ACEITO'; end if;
 end loop;
 update public.usuario set perfil='profissional' where id=ator;
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id='10000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado=motivo_concessao_cifrado where paciente_id=paciente and usuario_id=ator;
 r:=public.consultar_turno_atual_fixture(e);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'VINCULO_REVOGADO_VIROU_VAZIO'; end if;
 update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null where paciente_id=paciente and usuario_id=ator;
 update identidade.concessao_equipe set estado='revogada',revogada_em=clock_timestamp(),revogada_por_usuario_id=ator,motivo_revogacao_cifrado=motivo_cifrado where usuario_id=ator;
 r:=public.consultar_turno_atual_fixture(e);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'CONCESSAO_REVOGADA_VIROU_VAZIO'; end if;
 update identidade.concessao_equipe set estado='vinculada',revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id=ator;
 update identidade.sessao set encerrada_em=clock_timestamp() where usuario_id=ator;
 r:=public.consultar_turno_atual_fixture(e);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'SESSAO_ENCERRADA_VIROU_VAZIO'; end if;
 update identidade.sessao set encerrada_em=null where usuario_id=ator;
 -- Entrada assinada com identidade arbitrária ou campos de mutação não amplia lookup.
 begin perform public.consultar_turno_atual_fixture(e||jsonb_build_object('profissional_usuario_id',ator));raise exception 'ATOR_CLIENTE_ACEITO';exception when insufficient_privilege then null;end;
 begin perform public.consultar_turno_atual_fixture(e||jsonb_build_object('reserva_id',gen_random_uuid()));raise exception 'TRANSPORTE_ATUAL_NAO_ESTRITO';exception when invalid_parameter_value then null;end;
end $$;
set role authenticated;
do $$ begin
 begin perform 1 from cadastro.turno;raise exception 'TABELA_DIRETA_EXPOSTA';exception when insufficient_privilege then null;end;
 begin perform api.turno_privado('{}'::jsonb);raise exception 'RPC_SEM_ATESTADO_ACEITA';exception when insufficient_privilege then null;end;
end $$;
reset role;
update identidade.configuracao_sistema set valor='false' where chave='ffcm.turno.ativo';
