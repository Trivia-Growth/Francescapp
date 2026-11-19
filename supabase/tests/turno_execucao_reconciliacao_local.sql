\set ON_ERROR_STOP on
-- ESCRITO, NÃO EXECUTADO. Integração SQL real; Auth/Vault sintéticos da fixture.
\ir turno_execucao_clinica_local.sql
create temp table barreira_acl_antes as select oid,proowner,proacl,proconfig,prosecdef from pg_proc where oid='operacao.execucao_turno_privada(jsonb)'::regprocedure;
create temp table barreira_members_antes as select * from pg_auth_members;
create temp table barreira_schema_antes as select oid,nspacl from pg_namespace;
-- Same NOSUPER migrator. Optional pre-existing SET must survive the exact grantor.
\if :{?barreira_preexisting_set}
\else
\set barreira_preexisting_set false
\endif
\if :barreira_preexisting_set
grant ffcmapp_turno_execucao_owner to turno_core_migrador_fixture with inherit false,set true;
truncate barreira_members_antes;
insert into barreira_members_antes select * from pg_auth_members;
\endif
set role turno_core_migrador_fixture;
\ir ../migrations/20261125260000_turno_execucao_reconciliacao.sql
reset role;
do $$declare tabela text;begin
 if exists(select * from barreira_acl_antes except select oid,proowner,proacl,proconfig,prosecdef from pg_proc) then raise exception 'PATCH_OWNER_ACL_CONFIG_ALTERADO';end if;
 if exists((select * from barreira_members_antes except select * from pg_auth_members) union all (select * from pg_auth_members except select * from barreira_members_antes)) then raise exception 'MEMBERSHIPS_NAO_RESTAURADAS';end if;
 if exists(select * from barreira_schema_antes except select oid,nspacl from pg_namespace) then raise exception 'CREATE_SCHEMA_NAO_RESTAURADO';end if;
 foreach tabela in array array['operacao.turno_execucao_barreira','operacao.turno_execucao_reconciliacao'] loop
  if has_table_privilege('authenticated',tabela,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('service_role',tabela,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('anon',tabela,'SELECT,INSERT,UPDATE,DELETE') then raise exception 'BARREIRA_GRANT_DIRETO';end if;
  if not exists(select 1 from pg_class where oid=tabela::regclass and relrowsecurity and relforcerowsecurity) then raise exception 'BARREIRA_RLS_AUSENTE';end if;
 end loop;
end $$;
create function public.execucao_barreira_pedir_fixture(e jsonb,acao text) returns jsonb language plpgsql as $$declare t jsonb;r jsonb;begin
 t:=public.acessos_assinar_fixture(e,acao);set local role authenticated;r:=api.turno_execucao_barreira(t);reset role;return r;
end $$;
revoke all on function public.execucao_barreira_pedir_fixture(jsonb,text) from public,anon,authenticated,service_role;
-- Restore synthetic professional session/link only, no real account data.
update identidade.sessao set encerrada_em=null,revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id=(select profissional from turno_core_estado);
update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null,execucao_medicacao_concedida=true where usuario_id=(select profissional from turno_core_estado);
create temp table barreira_estado(epoca integer,recibo uuid,registro uuid,entrada jsonb);
do $$declare x turno_core_estado;r jsonb;novamente jsonb;e jsonb;id uuid:=gen_random_uuid();comando uuid:=gen_random_uuid();epoca integer;begin
 select * into x from turno_core_estado;perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'comando_id',comando);
 r:=public.execucao_barreira_pedir_fixture(e,'api.reconciliar_execucao_turno');epoca:=(r#>>'{dados,epoca}')::integer;
 if r->>'ok' is distinct from 'true' or epoca<>1 or r#>'{dados,resultado_pendente}'<>'null'::jsonb then raise exception 'RECONCILIACAO_INICIAL: %',r;end if;
 novamente:=public.execucao_barreira_pedir_fixture(e,'api.reconciliar_execucao_turno');if novamente->>'repeticao' is distinct from 'true' or novamente->'dados'<>r->'dados' then raise exception 'COMANDO_REPETIDO_INCREMENTOU';end if;
 e:=public.turno_core_gravacao_fixture('afericao',jsonb_build_object('turno_id',x.turno,'tipo','temperatura','valor',36.7,'unidade','°C','instante_afericao',clock_timestamp()-interval '1 minute'),id,1,x.paciente)||jsonb_build_object('epoca',epoca);
 r:=public.turno_core_pedir_fixture(e,'api.gravar_execucao_turno');if r->>'ok' is distinct from 'true' or r#>>'{dados,recibo_id}' is null then raise exception 'GRAVACAO_SEM_RECIBO: %',r;end if;
 insert into barreira_estado values(epoca,(r#>>'{dados,recibo_id}')::uuid,id,e);
 novamente:=public.turno_core_pedir_fixture(e,'api.gravar_execucao_turno');if novamente->>'repeticao' is distinct from 'true' or novamente#>>'{dados,recibo_id}' is distinct from r#>>'{dados,recibo_id}' then raise exception 'REPLAY_RECIBO_DIVERGENTE';end if;
 novamente:=public.turno_core_pedir_fixture(e||jsonb_build_object('registro_id',gen_random_uuid(),'chave_idempotencia',gen_random_uuid()),'api.gravar_execucao_turno');if novamente#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'PENDENTE_PERMITIU_NOVA_INTENCAO';end if;
 -- Case B cannot make an authorized clinical write; own metadata still returns case A receipt.
 r:=public.execucao_barreira_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',gen_random_uuid(),'comando_id',gen_random_uuid()),'api.reconciliar_execucao_turno');
 if r#>>'{dados,resultado_pendente,paciente_id}' is distinct from x.paciente::text or r#>>'{dados,resultado_pendente,registro_id}' is distinct from id::text or r#>'{dados,resultado_pendente}' ? 'conteudo' then raise exception 'RECIBO_OCULTO_OU_CLINICO';end if;
 update barreira_estado set epoca=(r#>>'{dados,epoca}')::integer;
 novamente:=public.turno_core_pedir_fixture(e,'api.gravar_execucao_turno');if novamente#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'EPOCA_ANTIGA_REPLAY_ACEITO';end if;
end $$;
-- Revoked case link cannot prevent own operational recovery, but still denies clinical replay.
update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id=(select cm from turno_core_estado),motivo_revogacao_cifrado=public.acessos_envelope_fixture() where paciente_id=(select paciente from turno_core_estado) and usuario_id=(select profissional from turno_core_estado);
do $$declare x turno_core_estado;b barreira_estado;r jsonb;begin
 select * into x from turno_core_estado;select * into b from barreira_estado;perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 r:=public.execucao_barreira_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'comando_id',gen_random_uuid()),'api.reconciliar_execucao_turno');if r->>'ok' is distinct from 'true' or r#>>'{dados,resultado_pendente,recibo_id}' is distinct from b.recibo::text then raise exception 'REVOGACAO_OCULTOU_RECIBO';end if;
 update barreira_estado set epoca=(r#>>'{dados,epoca}')::integer;
 r:=public.turno_core_pedir_fixture(b.entrada||jsonb_build_object('epoca',(r#>>'{dados,epoca}')::integer),'api.gravar_execucao_turno');if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'REVOGADO_REPLAY_CLINICO';end if;
 r:=public.execucao_barreira_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'epoca',b.epoca,'recibo_id',b.recibo),'api.reconhecer_execucao_turno');if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'CAS_EPOCA_ANTIGA_LIBEROU';end if;
 select * into b from barreira_estado;
 r:=public.execucao_barreira_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'epoca',b.epoca,'recibo_id',gen_random_uuid()),'api.reconhecer_execucao_turno');if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'CAS_OUTRO_RECIBO_LIBEROU';end if;
 r:=public.execucao_barreira_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'epoca',b.epoca,'recibo_id',b.recibo),'api.reconhecer_execucao_turno');if r->>'ok' is distinct from 'true' or r#>'{dados,resultado_pendente}'<>'null'::jsonb then raise exception 'RECONHECIMENTO_FALHOU';end if;
 -- Family is denied even with correctly signed request. No actor authority input.
 perform public.acessos_claims_fixture(x.familiar,x.familiar_sid,'password');
 r:=public.execucao_barreira_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'comando_id',gen_random_uuid()),'api.reconciliar_execucao_turno');if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'FAMILIA_BARREIRA';end if;
end $$;
-- Session revocation denies metadata too; no saved command bypasses live identity.
update identidade.sessao set revogada_em=clock_timestamp(),revogada_por_usuario_id=(select cm from turno_core_estado),motivo_revogacao_cifrado=public.acessos_envelope_fixture() where usuario_id=(select profissional from turno_core_estado) and session_id=(select sid from turno_core_estado);
do $$declare x turno_core_estado;r jsonb;begin select * into x from turno_core_estado;perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 r:=public.execucao_barreira_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'comando_id',gen_random_uuid()),'api.reconciliar_execucao_turno');if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'SESSAO_REVOGADA_BARREIRA';end if;
end $$;
-- New boundary matrix AFTER2600; previous pre-2600 proofs do not approve this seam.
update identidade.sessao set revogada_em=null,encerrada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id in(select usuario_id from acessos_contas_fixture);
do $$declare x turno_core_estado;c record;r jsonb;e jsonb;t jsonb;metodo_anterior text;begin
 select * into x from turno_core_estado;
 for c in select * from acessos_contas_fixture loop
  perform public.acessos_claims_fixture(c.usuario_id,c.sid,case when c.metodo='google_workspace' then 'oauth' else 'password' end);
  e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'comando_id',gen_random_uuid());
  r:=public.execucao_barreira_pedir_fixture(e,'api.reconciliar_execucao_turno');
  if c.funcao='familia' then
   if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'NOVA_MATRIZ_FAMILIA';end if;
  else
   if r->>'ok' is distinct from 'true' then raise exception 'NOVA_MATRIZ_STAFF_%_%: %',c.funcao,c.metodo,r;end if;
   update identidade.concessao_equipe set estado='revogada',revogada_em=clock_timestamp(),revogada_por_usuario_id=x.cm,motivo_revogacao_cifrado=public.acessos_envelope_fixture() where usuario_id=c.usuario_id;
   r:=public.execucao_barreira_pedir_fixture(e,'api.reconciliar_execucao_turno');
   if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'CONCESSAO_REVOGADA_REPLAY_COMANDO';end if;
   update identidade.concessao_equipe set estado='vinculada',revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id=c.usuario_id;
  end if;
 end loop;
 perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'comando_id',gen_random_uuid());
 -- Neither signed extra actor authority nor an omitted signed operation is accepted.
 r:=public.execucao_barreira_pedir_fixture(e||jsonb_build_object('ator_usuario_id',x.cm),'api.reconciliar_execucao_turno');if r#>>'{erro,codigo}' is distinct from 'entrada_invalida' then raise exception 'ATOR_CLIENTE_ACEITO';end if;
 t:=public.acessos_assinar_fixture(e,'api.reconciliar_execucao_turno');t:=t#-'{entrada,atestado,operacao}';
 set local role authenticated;r:=api.turno_execucao_barreira(t);reset role;
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'OPERACAO_NULA_ACEITA';end if;
 -- Password token over a technical session never becomes an admitted staff method.
 select metodo into metodo_anterior from identidade.sessao where session_id=x.sid;
 update identidade.sessao set metodo='tecnica' where session_id=x.sid;
 r:=public.execucao_barreira_pedir_fixture(e,'api.reconciliar_execucao_turno');
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'CANAL_TECNICO_ACEITO';end if;
 update identidade.sessao set metodo=metodo_anterior where session_id=x.sid;
end $$;
-- Medication concession remains a separate live permission after the actor fence.
update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null,execucao_medicacao_concedida=false where usuario_id=(select profissional from turno_core_estado) and paciente_id=(select paciente from turno_core_estado);
do $$declare x turno_core_estado;r jsonb;e jsonb;novo_registro uuid:=gen_random_uuid();epoca integer;begin
 select * into x from turno_core_estado;perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 r:=public.execucao_barreira_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'comando_id',gen_random_uuid()),'api.reconciliar_execucao_turno');epoca:=(r#>>'{dados,epoca}')::integer;
 e:=public.turno_core_gravacao_fixture('prescricao',jsonb_build_object('nome',public.acessos_envelope_fixture(),'dose',public.acessos_envelope_fixture(),'via',public.acessos_envelope_fixture(),'fonte_documental',public.acessos_envelope_fixture(),'horarios',jsonb_build_array('08:00:00'),'vigencia_inicio',clock_timestamp()-interval '1 hour','vigencia_fim',null),novo_registro,1,x.paciente)||jsonb_build_object('epoca',epoca);
 r:=public.turno_core_pedir_fixture(e,'api.gravar_execucao_turno');if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or exists(select 1 from cadastro.turno_execucao_registro where id=novo_registro) then raise exception 'CONCESSAO_MEDICACAO_REVOGADA_ACEITA';end if;
 update cadastro.acesso_paciente set execucao_medicacao_concedida=true where usuario_id=x.profissional and paciente_id=x.paciente;
 r:=public.turno_core_pedir_fixture(e||jsonb_build_object('paciente_id',gen_random_uuid()),'api.gravar_execucao_turno');if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'OUTRO_CASO_CLINICO_ACEITO';end if;
 r:=public.turno_core_pedir_fixture(e-'epoca','api.gravar_execucao_turno');if r#>>'{erro,codigo}' is distinct from 'entrada_invalida' then raise exception 'EPOCA_AUSENTE_ACEITA';end if;
 r:=public.turno_core_pedir_fixture(e,'api.gravar_execucao_turno');if r->>'ok' is distinct from 'true' or r#>>'{dados,recibo_id}' is null then raise exception 'MEDICACAO_POSITIVA_EPOCA: %',r;end if;
 r:=public.execucao_barreira_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'epoca',epoca,'recibo_id',r#>>'{dados,recibo_id}'),'api.reconhecer_execucao_turno');if r->>'ok' is distinct from 'true' then raise exception 'MEDICACAO_RECIBO_NAO_LIBEROU';end if;
end $$;
