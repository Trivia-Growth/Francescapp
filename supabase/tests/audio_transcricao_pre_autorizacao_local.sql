\set ON_ERROR_STOP on
-- FR-010, cenário "Autorização antes do envio ao provedor". Reaproveita a fixture da DF-023
-- (contas gerenciadas internas e Google, administrador legado, paciente 44…01) porque a
-- operação de áudio autentica por `identidade.contexto_acesso_vigente` desde 20261125170000.
-- Executar com scripts/testar-audio-pre-autorizacao-local.sh.
\ir acessos_gerenciados_local.sql
reset role;
create temp table pre_membros_antes as select roleid,member,grantor from pg_auth_members;
create temp table pre_create_antes as select has_schema_privilege('ffcmapp_audio_transcricao_owner','api','create') tinha;
\ir ../migrations/20261128250000_audio_transcricao_pre_autorizacao.sql

do $$ begin
 if not has_function_privilege('authenticated','api.autorizar_transcricao_audio(uuid,uuid)','execute') then
  raise exception 'PRE_SEM_GRANT';
 end if;
 if has_function_privilege('anon','api.autorizar_transcricao_audio(uuid,uuid)','execute')
  or has_function_privilege('service_role','api.autorizar_transcricao_audio(uuid,uuid)','execute')
  or has_function_privilege('public','api.autorizar_transcricao_audio(uuid,uuid)','execute') then
  raise exception 'PRE_GRANT_AMPLO';
 end if;
 if not exists(select 1 from pg_proc p join pg_roles r on r.oid=p.proowner
   where p.oid='api.autorizar_transcricao_audio(uuid,uuid)'::regprocedure
    and r.rolname='ffcmapp_audio_transcricao_owner' and p.prosecdef
    and 'row_security=on'=any(p.proconfig) and 'search_path=""'=any(p.proconfig)) then
  raise exception 'PRE_DONO_INESPERADO';
 end if;
 -- A migração devolve CREATE e participação temporários ao estado anterior.
 if has_schema_privilege('ffcmapp_audio_transcricao_owner','api','create') is distinct from (select tinha from pre_create_antes)
  or exists(select roleid,member,grantor from pg_auth_members except select * from pre_membros_antes)
  or exists(select * from pre_membros_antes except select roleid,member,grantor from pg_auth_members) then
  raise exception 'PRE_PRIVILEGIO_TEMPORARIO_PERSISTIU';
 end if;
end $$;

-- Chama como `authenticated` (o caminho do PostgREST) e confere a auditoria do negado.
create function public.pre_autorizar_fixture(ator uuid, sid uuid, metodo text, paciente uuid) returns jsonb language plpgsql as $$
declare req uuid:=gen_random_uuid(); r jsonb;
begin
 perform public.acessos_claims_fixture(ator,sid,metodo);
 set local role authenticated; r:=api.autorizar_transcricao_audio(req,paciente); reset role;
 if r->>'ok'='false' and not exists(select 1 from auditoria.evento where request_id=req and resultado='negado'
   and acao='api.registrar_audio_transcricao' and objeto_id=paciente) then
  raise exception 'NEGADO_SEM_AUDITORIA: %',r;
 end if;
 return r;
end $$;
revoke all on function public.pre_autorizar_fixture(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;

-- Sessões novas para as contas da matriz (a fixture encerra as anteriores no fim).
create temp table pre_contas(usuario_id uuid, sid uuid, funcao text, metodo text);
do $$ declare c record; s jsonb; nova uuid; begin
 for c in select * from acessos_contas_fixture loop
  nova:=gen_random_uuid();
  insert into auth.sessions values(nova,c.usuario_id,null);
  perform public.acessos_claims_fixture(c.usuario_id,nova,case when c.metodo='interno' then 'password' else 'oauth' end);
  set local role authenticated;
  if c.metodo='interno' then s:=api.admitir_sessao_interna_nativa(gen_random_uuid());
  else s:=api.admitir_sessao_nativa(gen_random_uuid()); end if;
  reset role;
  if s is null and c.funcao<>'familia' then raise exception 'FIXTURE_SESSAO_NAO_ADMITIDA: % %',c.funcao,c.metodo; end if;
  insert into pre_contas values(c.usuario_id,nova,c.funcao,c.metodo);
 end loop;
end $$;

do $$
#variable_conflict use_variable
declare c record; r jsonb; paciente uuid:='44000000-0000-4000-8000-000000000001';
 adm uuid:='11000000-0000-4000-8000-000000000001'; sadm uuid:='22000000-0000-4000-8000-000000000001';
 audios bigint; requisicoes bigint;
begin
 select count(*) into audios from cadastro.audio_transcricao;
 select count(*) into requisicoes from operacao.requisicao;
 -- Matriz: equipe (admin, case manager, profissional) nos dois métodos passa; família não.
 for c in select * from pre_contas loop
  r:=public.pre_autorizar_fixture(c.usuario_id,c.sid,case when c.metodo='interno' then 'password' else 'oauth' end,paciente);
  if c.funcao='familia' and r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'PRE_FAMILIA_ACEITA: % %',c.metodo,r; end if;
  if c.funcao<>'familia' and r->>'ok' is distinct from 'true' then raise exception 'PRE_EQUIPE_NEGADA: % % %',c.funcao,c.metodo,r; end if;
 end loop;
 -- Administrador legado Google passa; com método de login trocado no JWT, não.
 r:=public.pre_autorizar_fixture(adm,sadm,'oauth',paciente);
 if r->>'ok' is distinct from 'true' then raise exception 'PRE_ADMIN_LEGADO_NEGADO: %',r; end if;
 r:=public.pre_autorizar_fixture(adm,sadm,'password',paciente);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'PRE_METODO_TROCADO: %',r; end if;
 -- Paciente inexistente.
 r:=public.pre_autorizar_fixture(adm,sadm,'oauth','44000000-0000-4000-8000-0000000000ff');
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'PRE_PACIENTE_INEXISTENTE: %',r; end if;
 -- Profissional interno: usuário inativo, concessão revogada e sessão encerrada.
 select * into c from pre_contas where funcao='profissional' and metodo='interno';
 update public.usuario set ativo=false where id=c.usuario_id;
 r:=public.pre_autorizar_fixture(c.usuario_id,c.sid,'password',paciente);
 update public.usuario set ativo=true where id=c.usuario_id;
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'PRE_USUARIO_INATIVO: %',r; end if;
 update identidade.concessao_equipe set estado='revogada',revogada_em=clock_timestamp(),revogada_por_usuario_id=adm,motivo_revogacao_cifrado=motivo_cifrado where usuario_id=c.usuario_id and estado='vinculada';
 r:=public.pre_autorizar_fixture(c.usuario_id,c.sid,'password',paciente);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'PRE_CONCESSAO_REVOGADA: %',r; end if;
 select * into c from pre_contas where funcao='profissional' and metodo='google_workspace';
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=c.sid;
 r:=public.pre_autorizar_fixture(c.usuario_id,c.sid,'oauth',paciente);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'PRE_SESSAO_ENCERRADA: %',r; end if;
 -- Identidade Auth sem perfil: negada e auditada pelo id Auth, sem criar usuário.
 insert into auth.users(id) values('11000000-0000-4000-8000-0000000000aa');
 insert into auth.sessions values('22000000-0000-4000-8000-0000000000aa','11000000-0000-4000-8000-0000000000aa',null);
 r:=public.pre_autorizar_fixture('11000000-0000-4000-8000-0000000000aa','22000000-0000-4000-8000-0000000000aa','oauth',paciente);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao'
  or exists(select 1 from public.usuario where id='11000000-0000-4000-8000-0000000000aa') then
  raise exception 'PRE_AUTH_SEM_PERFIL: %',r;
 end if;
 -- A pré-autorização não grava nada além da auditoria.
 if (select count(*) from cadastro.audio_transcricao)<>audios or (select count(*) from operacao.requisicao)<>requisicoes then
  raise exception 'PRE_ESCREVEU';
 end if;
 -- Sem JWT: recusa por exceção.
 perform set_config('request.jwt.claims','',true);
 begin
  set local role authenticated; perform api.autorizar_transcricao_audio(gen_random_uuid(),paciente);
  raise exception 'PRE_SEM_JWT_ACEITO';
 exception when insufficient_privilege then reset role;
 end;
end $$;
-- Limite: provedor, PostgREST e Auth reais não são exercitados aqui.
