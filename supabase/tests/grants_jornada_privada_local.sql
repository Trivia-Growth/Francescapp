\set ON_ERROR_STOP on
\ir contato_autorizacao_local.sql
\ir ../migrations/20261109110000_barreira_edicao_paciente_privada.sql
\ir ../migrations/20261109130000_edicao_paciente_composicao.sql
\ir ../migrations/20261110200000_edicao_paciente_wrappers_privados.sql
\ir ../migrations/20261110210000_consultar_paciente_edicao_privado.sql
\ir ../migrations/20261112050000_conceder_acesso_paciente_privado.sql
\ir ../migrations/20261112060000_revogar_acesso_paciente_privado.sql
\ir ../migrations/20261112070000_owners_acesso_paciente_privado.sql
create temp table grants_antes as
 select p.oid,p.proowner,p.proacl,has_function_privilege('anon',p.oid,'execute') anon,
  has_function_privilege('service_role',p.oid,'execute') servico,
  has_function_privilege('authenticated',p.oid,'execute') autenticado
 from pg_proc p where p.oid in (
 'api.consultar_paciente_edicao_privado(jsonb)'::regprocedure,
 'api.edicao_paciente_composicao_privada(jsonb)'::regprocedure,
 'api.editar_paciente_privado(jsonb)'::regprocedure,
 'api.contato_barreira_composicao(jsonb)'::regprocedure,
 'api.criar_contato_paciente(jsonb)'::regprocedure,
 'api.conceder_acesso_paciente_privado(jsonb)'::regprocedure,
 'api.revogar_acesso_paciente_privado(jsonb)'::regprocedure);
do $$ begin
 if (select count(*) from grants_antes) <> 7 or exists(select 1 from grants_antes where autenticado or anon or servico) then raise exception 'PRECONDICAO_GRANTS'; end if;
end $$;
create role ffcm_grants_migrador_fixture nologin nosuperuser nocreaterole;
grant usage on schema api to ffcm_grants_migrador_fixture;
grant ffcmapp_edicao_paciente_owner, ffcmapp_contato_barreira_owner, ffcmapp_contato_owner,
 ffcmapp_conceder_acesso_owner, ffcmapp_revogar_acesso_owner to ffcm_grants_migrador_fixture with inherit false, set true;
grant ffcm_grants_migrador_fixture to current_user with inherit false, set true;
set role ffcm_grants_migrador_fixture;
\ir ../drafts/20261112123000_grants_edicao_contato.sql
\ir ../drafts/20261112130000_grants_jornada_privada.sql
reset role;
-- As entradas são assinadas com chave exclusivamente fictícia e adulteradas após a assinatura.
create temp table pedidos_grants as
select nome, public.assinar_anamnese_fixture(entrada,operacao,
 '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001') transporte
from (values
 ('consultar_paciente_edicao_privado','api.consultar_paciente_edicao',jsonb_build_object('request_id',gen_random_uuid(),'paciente_id','40000000-0000-4000-8000-000000000001')),
 ('edicao_paciente_composicao_privada','api.consultar_barreira_edicao_paciente',jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.consultar_barreira_edicao_paciente')),
 ('editar_paciente_privado','api.editar_paciente',jsonb_build_object('request_id',gen_random_uuid(),'paciente_id','40000000-0000-4000-8000-000000000001','versao_esperada',1,'reserva_id',gen_random_uuid(),'geracao_reserva',1,'auditoria_id',gen_random_uuid())),
 ('contato_barreira_composicao','api.consultar_barreira_criacao_contato',jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.consultar_barreira_criacao_contato')),
 ('criar_contato_paciente','api.criar_contato_paciente',jsonb_build_object('request_id',gen_random_uuid(),'paciente_id','40000000-0000-4000-8000-000000000001','contato_id',gen_random_uuid(),'reserva_id',gen_random_uuid(),'geracao_reserva',1,'auditoria_id',gen_random_uuid())),
 ('conceder_acesso_paciente_privado','api.conceder_acesso_paciente',jsonb_build_object('request_id',gen_random_uuid(),'paciente_id','40000000-0000-4000-8000-000000000001','acesso_id',gen_random_uuid(),'usuario_id','10000000-0000-4000-8000-000000000002','auditoria_id',gen_random_uuid())),
 ('revogar_acesso_paciente_privado','api.revogar_acesso_paciente',jsonb_build_object('request_id',gen_random_uuid(),'paciente_id','40000000-0000-4000-8000-000000000001','acesso_id',gen_random_uuid(),'versao_esperada',1,'auditoria_id',gen_random_uuid()))
) p(nome,operacao,entrada);
grant select on pedidos_grants to authenticated;
set role authenticated;
do $$
declare pedido record; transporte jsonb; tentativa integer;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-4000-8000-000000000001','session_id','20000000-0000-4000-8000-000000000001','amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 for pedido in select * from pedidos_grants loop
  for tentativa in 1..2 loop
   transporte := case when tentativa=1 then pedido.transporte #- '{entrada,atestado}'
    else jsonb_set(pedido.transporte,'{entrada,atestado,mac}',to_jsonb(repeat('A',43))) end;
   begin
    execute format('select api.%I($1)',pedido.nome) using transporte;
    raise exception 'ATESTADO_INVALIDO_ACEITO: %',pedido.nome;
   exception when insufficient_privilege then
    if sqlerrm <> 'SEM_PERMISSAO' then raise; end if;
   end;
  end loop;
 end loop;
 begin
  perform 1 from cadastro.acesso_paciente limit 1;
  raise exception 'TABELA_DIRETA_ACEITA';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
-- Concessão real sob authenticated, com Auth e chave de atestado fictícios.
create temp table prova_vinculo as
select entrada,
 public.assinar_anamnese_fixture(entrada,'api.conceder_acesso_paciente','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001') admin,
 public.assinar_anamnese_fixture(entrada,'api.conceder_acesso_paciente','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002') profissional
from (select jsonb_build_object('request_id',gen_random_uuid(),'paciente_id','40000000-0000-4000-8000-000000000001',
 'acesso_id',gen_random_uuid(),'usuario_id','10000000-0000-4000-8000-000000000002','auditoria_id',gen_random_uuid(),
 'chave_idempotencia','vinculo-pos-grant','digest_idempotencia',repeat('a',43),
 'motivo',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22))) entrada) e;
grant select on prova_vinculo to authenticated;
set role authenticated;
do $$ declare r jsonb; begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-4000-8000-000000000001','session_id','20000000-0000-4000-8000-000000000001','amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 select api.conceder_acesso_paciente_privado(admin) into r from prova_vinculo;
 if r->>'ok' is distinct from 'true' then raise exception 'ADMIN_NEGADO: %',r; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-4000-8000-000000000002','session_id','20000000-0000-4000-8000-000000000002','amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 select api.conceder_acesso_paciente_privado(profissional) into r from prova_vinculo;
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'PROFISSIONAL_ACEITO'; end if;
end $$;
reset role;
update identidade.sessao set encerrada_em=clock_timestamp() where session_id='20000000-0000-4000-8000-000000000001';
-- Atestados válidos em cada identidade: profissional e administrador com sessão encerrada.
create temp table negativas_jornada as
select nome, identidade, entrada->>'request_id' request_id,
 public.assinar_anamnese_fixture(entrada,operacao,ator,sessao) transporte
from (
 select p.nome, (p.transporte->'entrada')-'atestado'::text entrada,
  p.transporte#>>'{entrada,atestado,operacao}' operacao,
  i.identidade,i.ator,i.sessao
 from pedidos_grants p cross join (values
  ('profissional','10000000-0000-4000-8000-000000000002'::uuid,'20000000-0000-4000-8000-000000000002'::uuid),
  ('encerrada','10000000-0000-4000-8000-000000000001'::uuid,'20000000-0000-4000-8000-000000000001'::uuid)
 ) i(identidade,ator,sessao)
 where p.nome in ('consultar_paciente_edicao_privado','edicao_paciente_composicao_privada','editar_paciente_privado','contato_barreira_composicao','criar_contato_paciente')
) q;
grant select on negativas_jornada to authenticated;
set role authenticated;
do $$
declare pedido record; resposta jsonb; ator uuid; sessao uuid;
begin
 for pedido in select * from negativas_jornada loop
  if pedido.identidade='profissional' then ator:='10000000-0000-4000-8000-000000000002'; sessao:='20000000-0000-4000-8000-000000000002';
  else ator:='10000000-0000-4000-8000-000000000001'; sessao:='20000000-0000-4000-8000-000000000001'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
  execute format('select api.%I($1)',pedido.nome) into resposta using pedido.transporte;
  if resposta#>>'{erro,codigo}' is distinct from 'sem_permissao' or resposta ? 'dados' then raise exception 'NEGATIVA_FALHOU: % %',pedido.nome,pedido.identidade; end if;
 end loop;
end $$;
reset role;
do $$ begin
 if exists(select 1 from negativas_jornada n where not exists(select 1 from auditoria.evento a
  where a.request_id=n.request_id::uuid and a.resultado='negado'
   and a.ator_usuario_id=(case when n.identidade='profissional' then '10000000-0000-4000-8000-000000000002' else '10000000-0000-4000-8000-000000000001' end)::uuid
   and a.acao=n.transporte#>>'{entrada,atestado,operacao}')) then raise exception 'AUDITORIA_NEGATIVA_AUSENTE'; end if;
end $$;
update identidade.sessao set encerrada_em=null where session_id='20000000-0000-4000-8000-000000000001';
update identidade.concessao_equipe set estado='revogada',revogada_em=clock_timestamp(),
 revogada_por_usuario_id='10000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado=motivo_cifrado
 where usuario_id='10000000-0000-4000-8000-000000000001';
create temp table concessao_revogada as
select nome, entrada->>'request_id' request_id,
 public.assinar_anamnese_fixture(entrada,operacao,'10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001') transporte
from (select nome, jsonb_set((transporte->'entrada')-'atestado'::text,'{request_id}',to_jsonb(gen_random_uuid())) entrada,
 transporte#>>'{entrada,atestado,operacao}' operacao from pedidos_grants
 where nome in ('consultar_paciente_edicao_privado','edicao_paciente_composicao_privada','editar_paciente_privado','contato_barreira_composicao','criar_contato_paciente')) q;
grant select on concessao_revogada to authenticated;
set role authenticated;
do $$ declare pedido record; resposta jsonb; begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-4000-8000-000000000001','session_id','20000000-0000-4000-8000-000000000001','amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 for pedido in select * from concessao_revogada loop
  execute format('select api.%I($1)',pedido.nome) into resposta using pedido.transporte;
  if resposta#>>'{erro,codigo}' is distinct from 'sem_permissao' or resposta ? 'dados' then raise exception 'CONCESSAO_REVOGADA_ACEITA: %',pedido.nome; end if;
 end loop;
end $$;
reset role;
do $$ begin
 if exists(select 1 from concessao_revogada n where not exists(select 1 from auditoria.evento a where a.request_id=n.request_id::uuid and a.resultado='negado' and a.ator_usuario_id='10000000-0000-4000-8000-000000000001' and a.acao=n.transporte#>>'{entrada,atestado,operacao}')) then raise exception 'AUDITORIA_REVOGACAO_AUSENTE'; end if;
end $$;
do $$ begin
 if not exists(select 1 from cadastro.acesso_paciente a, prova_vinculo p where a.id=(p.entrada->>'acesso_id')::uuid and a.revogada_em is null)
  or not exists(select 1 from auditoria.evento a, prova_vinculo p where a.id=(p.entrada->>'auditoria_id')::uuid and a.resultado='permitido') then
  raise exception 'VINCULO_OU_AUDITORIA_AUSENTE';
 end if;
end $$;
update identidade.concessao_equipe set estado='vinculada',revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null
 where usuario_id='10000000-0000-4000-8000-000000000001';
update identidade.sessao set encerrada_em=clock_timestamp() where session_id='20000000-0000-4000-8000-000000000001';
set role authenticated;
do $$ declare r jsonb; begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-4000-8000-000000000001','session_id','20000000-0000-4000-8000-000000000001','amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 select api.conceder_acesso_paciente_privado(admin) into r from prova_vinculo;
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'SESSAO_ENCERRADA_ACEITA'; end if;
end $$;
reset role;
do $$ begin
 if not pg_has_role('ffcm_grants_migrador_fixture','ffcmapp_edicao_paciente_owner','SET')
  or not pg_has_role('ffcm_grants_migrador_fixture','ffcmapp_contato_owner','SET')
  or not pg_has_role('ffcm_grants_migrador_fixture','ffcmapp_contato_barreira_owner','SET')
  or not pg_has_role('ffcm_grants_migrador_fixture','ffcmapp_conceder_acesso_owner','SET')
  or not pg_has_role('ffcm_grants_migrador_fixture','ffcmapp_revogar_acesso_owner','SET') then
  raise exception 'MEMBERSHIP_ANTERIOR_PERDIDO';
 end if;
 if exists(select 1 from grants_antes a join pg_proc p on p.oid=a.oid
  where p.proowner<>a.proowner or not has_function_privilege('authenticated',p.oid,'execute')
   or has_function_privilege('anon',p.oid,'execute') is distinct from a.anon
   or has_function_privilege('service_role',p.oid,'execute') is distinct from a.servico) then
  raise exception 'GRANTS_OU_OWNER_INCORRETOS';
 end if;
 if exists(select 1 from grants_antes a join pg_proc p on p.oid=a.oid where
  (select coalesce(jsonb_agg(to_jsonb(x) order by x.grantee,x.grantor,x.privilege_type,x.is_grantable),'[]'::jsonb)
   from aclexplode(coalesce(a.proacl,acldefault('f',a.proowner))) x where x.grantee <> 'authenticated'::regrole::oid)
  is distinct from
  (select coalesce(jsonb_agg(to_jsonb(x) order by x.grantee,x.grantor,x.privilege_type,x.is_grantable),'[]'::jsonb)
   from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x where x.grantee <> 'authenticated'::regrole::oid)) then
  raise exception 'ACL_DE_OUTROS_PAPEIS_ALTERADA';
 end if;
 if has_table_privilege('authenticated','cadastro.acesso_paciente','select')
  or has_table_privilege('authenticated','cadastro.contato_paciente','select') then
  raise exception 'ACESSO_TABELA_INDEVIDO';
 end if;
end $$;

set role ffcm_grants_migrador_fixture;
\ir ../drafts/rollback_grants_edicao_contato.sql
reset role;
do $$ begin
 if exists(select 1 from grants_antes a join pg_proc p on p.oid=a.oid
  where p.proname in ('consultar_paciente_edicao_privado','edicao_paciente_composicao_privada','editar_paciente_privado','contato_barreira_composicao','criar_contato_paciente')
   and (p.proowner is distinct from a.proowner or p.proacl is distinct from a.proacl or has_function_privilege('authenticated',p.oid,'execute'))) then
  raise exception 'ROLLBACK_NAO_RESTAURA_ACL';
 end if;
 if not has_function_privilege('authenticated','api.conceder_acesso_paciente_privado(jsonb)','execute')
  or not has_function_privilege('authenticated','api.revogar_acesso_paciente_privado(jsonb)','execute') then raise exception 'ROLLBACK_AFETOU_ACESSO'; end if;
end $$;
