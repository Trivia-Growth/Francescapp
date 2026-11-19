-- FR-024: prova local da situação de realização do compromisso. PostgreSQL descartável;
-- Auth, Vault e assinatura são fixtures FICTÍCIAS e não comprovam serviço real.
-- Nenhuma flag da integração Google é ligada aqui: esta fatia não depende dela.
\set ON_ERROR_STOP on
\ir acompanhamento_caso_local.sql
\ir ../migrations/20261117400000_configuracao_sistema.sql
\ir ../migrations/20261126120000_realizacao_compromisso.sql
\ir ../migrations/20261126120100_grant_realizacao_compromisso_teste.sql

-- Segundo profissional, com identidade Google própria: é ele quem prova "agenda alheia".
insert into auth.users values ('10000000-0000-4000-8000-000000000006');
insert into public.usuario(id,perfil,ativo) values ('10000000-0000-4000-8000-000000000006','profissional',true);
insert into auth.identities values ('10000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000006','google',
 'google-10000000-0000-4000-8000-000000000006',
 jsonb_build_object('sub','google-10000000-0000-4000-8000-000000000006','email_verified',true,
  'custom_claims',jsonb_build_object('hd','example.test')));
insert into auth.sessions values ('20000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000006',null);
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,criada_em,vinculada_em)
 values ('30000000-0000-4000-8000-000000000006','{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}',
 'fixture-006','profissional','google_workspace','vinculada','10000000-0000-4000-8000-000000000006',
 'google-10000000-0000-4000-8000-000000000006','{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}',
 now()-interval '1 day',now());
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
 values ('20000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000006','30000000-0000-4000-8000-000000000006',1,'google_workspace');
-- Familiar com sessão Auth válida e SEM concessão de equipe: é assim que ele chega ao wrapper.
insert into auth.sessions values ('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005',null);

-- Toda chamada cruza o wrapper como `authenticated`: não depende de esconder controle.
create function public.realizacao_fixture(p_ator uuid, p_sessao uuid, p_metodo text, p_acao text, p_entrada jsonb)
returns jsonb language plpgsql as $$
declare t jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_ator,'session_id',p_sessao,
  'amr',jsonb_build_array(jsonb_build_object('method',p_metodo)))::text,true);
 t:=public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid())||p_entrada,p_acao,p_ator,p_sessao);
 execute 'set local role authenticated';
 begin
  r:=api.realizacao_compromisso_privado(t);
 exception when others then
  r:=jsonb_build_object('ok',false,'excecao',sqlerrm);
 end;
 execute 'reset role';
 return r;
end $$;
create function public.registrar_fixture(p_ator uuid, p_sessao uuid, p_entrada jsonb) returns jsonb
language sql as $$ select public.realizacao_fixture(p_ator,p_sessao,'oauth','api.registrar_realizacao_compromisso',
 jsonb_build_object('registro_id',gen_random_uuid(),'digest_idempotencia',repeat('r',43))||p_entrada) $$;
create function public.consultar_fixture(p_ator uuid, p_sessao uuid, p_entrada jsonb) returns jsonb
language sql as $$ select public.realizacao_fixture(p_ator,p_sessao,'oauth','api.consultar_realizacao_compromisso',p_entrada) $$;
create function public.item_fixture(r jsonb, evento text) returns jsonb language sql as $$
 select i from jsonb_array_elements(r#>'{dados,compromissos}') i where i->>'evento_id'=evento $$;

-- ACL exata logo após o grant de teste: só EXECUTE do wrapper, para authenticated.
do $$
declare assinatura text:='api.realizacao_compromisso_privado(jsonb)'; papel text;
begin
 if not has_function_privilege('authenticated',to_regprocedure(assinatura),'EXECUTE')
  or has_function_privilege('anon',to_regprocedure(assinatura),'EXECUTE')
  or has_function_privilege('service_role',to_regprocedure(assinatura),'EXECUTE')
  or exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
   where p.oid=to_regprocedure(assinatura)
    and (acl.grantee not in (p.proowner,'authenticated'::regrole) or acl.privilege_type<>'EXECUTE' or acl.is_grantable)) then
  raise exception 'ACL_WRAPPER_INEXATA';
 end if;
 foreach papel in array array['authenticated','anon','service_role'] loop
  if has_table_privilege(papel,'cadastro.realizacao_compromisso','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   or has_function_privilege(papel,'operacao.realizacao_compromisso_privada(jsonb)','EXECUTE')
   or has_function_privilege(papel,'cadastro.realizacao_situacao_derivada(text,timestamptz,timestamptz)','EXECUTE')
   or has_function_privilege(papel,'cadastro.realizacao_ator_administrador()','EXECUTE')
   or pg_has_role(papel,'ffcmapp_realizacao_compromisso_owner','MEMBER') then
   raise exception 'GRANT_AMPLO: %',papel;
  end if;
 end loop;
 -- A fatia não alcança o caso: o owner não tem privilégio em paciente nem em acesso.
 if has_table_privilege('ffcmapp_realizacao_compromisso_owner','cadastro.paciente','SELECT')
  or has_table_privilege('ffcmapp_realizacao_compromisso_owner','cadastro.acesso_paciente','SELECT')
  or has_column_privilege('ffcmapp_realizacao_compromisso_owner','cadastro.paciente','nome_cifrado','SELECT') then
  raise exception 'OWNER_ALCANCA_O_CASO';
 end if;
 if exists(select 1 from pg_roles where rolname='ffcmapp_realizacao_compromisso_owner'
  and (rolcanlogin or rolsuper or rolbypassrls or rolinherit or rolcreaterole or rolcreatedb))
  or exists(select 1 from pg_auth_members m where m.roleid='ffcmapp_realizacao_compromisso_owner'::regrole) then
  raise exception 'OWNER_NAO_ISOLADO';
 end if;
end $$;

-- Derivação: ausência de registro JAMAIS vira falta.
do $$
declare agora timestamptz:=clock_timestamp();
begin
 if cadastro.realizacao_situacao_derivada(null,agora-interval '1 hour',agora)<>'realizacao_nao_confirmada'
  or cadastro.realizacao_situacao_derivada(null,agora+interval '1 hour',agora)<>'agendado'
  or cadastro.realizacao_situacao_derivada(null,null,agora)<>'agendado'
  or cadastro.realizacao_situacao_derivada('faltou',agora-interval '1 hour',agora)<>'faltou'
  or cadastro.realizacao_situacao_derivada('realizado',agora-interval '1 hour',agora)<>'realizado' then
  raise exception 'DERIVACAO_INCORRETA';
 end if;
 if exists(select 1 from (values (null::text),('realizado'),('cancelado'),('remarcado')) v(s)
  where cadastro.realizacao_situacao_derivada(v.s,agora-interval '1 hour',agora)='faltou') then
  raise exception 'DERIVACAO_PRODUZIU_FALTA';
 end if;
end $$;

-- Positivos: realizado, faltou com motivo, cancelado e remarcado com destino.
do $$
#variable_conflict use_variable
declare
 prof uuid:='10000000-0000-4000-8000-000000000002'; sp uuid:='20000000-0000-4000-8000-000000000002';
 r jsonb;
begin
 r:=public.registrar_fixture(prof,sp,jsonb_build_object('evento_id','evt-a','situacao','realizado',
  'versao_esperada',0,'chave_idempotencia','rc-a'));
 if r->>'ok' is distinct from 'true' or (public.item_fixture(r,'evt-a'))->>'situacao'<>'realizado'
  or (public.item_fixture(r,'evt-a'))->>'versao'<>'1' then raise exception 'REGISTRO_REALIZADO: %',r; end if;
 if not exists(select 1 from auditoria.evento ev join cadastro.realizacao_compromisso c on c.auditoria_id=ev.id
  where c.evento_id='evt-a' and ev.resultado='permitido' and ev.ator_usuario_id=prof
   and ev.tipo_objeto='agenda_realizacao' and ev.objeto_id=prof) then raise exception 'AUDITORIA_AUSENTE'; end if;

 r:=public.registrar_fixture(prof,sp,jsonb_build_object('evento_id','evt-b','situacao','faltou',
  'versao_esperada',0,'chave_idempotencia','rc-b-sem-motivo'));
 if r->>'excecao' is distinct from 'ENTRADA_INVALIDA' then raise exception 'FALTA_SEM_MOTIVO_ACEITA: %',r; end if;
 r:=public.registrar_fixture(prof,sp,jsonb_build_object('evento_id','evt-b','situacao','faltou',
  'motivo','transporte','versao_esperada',0,'chave_idempotencia','rc-b'));
 if r->>'ok' is distinct from 'true' or (public.item_fixture(r,'evt-b'))->>'motivo'<>'transporte' then
  raise exception 'REGISTRO_FALTOU: %',r; end if;
 -- Catálogo é fechado: nada fora dele entra, inclusive termo clínico.
 r:=public.registrar_fixture(prof,sp,jsonb_build_object('evento_id','evt-b2','situacao','faltou',
  'motivo','risco_clinico','versao_esperada',0,'chave_idempotencia','rc-b2'));
 if r->>'excecao' is distinct from 'ENTRADA_INVALIDA' then raise exception 'MOTIVO_FORA_DO_CATALOGO_ACEITO: %',r; end if;

 r:=public.registrar_fixture(prof,sp,jsonb_build_object('evento_id','evt-c','situacao','cancelado',
  'motivo','disponibilidade','versao_esperada',0,'chave_idempotencia','rc-c'));
 if r->>'ok' is distinct from 'true' or (public.item_fixture(r,'evt-c'))->>'situacao'<>'cancelado' then
  raise exception 'REGISTRO_CANCELADO: %',r; end if;

 r:=public.registrar_fixture(prof,sp,jsonb_build_object('evento_id','evt-d','situacao','remarcado',
  'versao_esperada',0,'chave_idempotencia','rc-d-sem-destino'));
 if r->>'excecao' is distinct from 'ENTRADA_INVALIDA' then raise exception 'REMARCADO_SEM_DESTINO_ACEITO: %',r; end if;
 r:=public.registrar_fixture(prof,sp,jsonb_build_object('evento_id','evt-d','situacao','remarcado',
  'evento_destino_id','evt-d','versao_esperada',0,'chave_idempotencia','rc-d-self'));
 if r->>'excecao' is distinct from 'ENTRADA_INVALIDA' then raise exception 'DESTINO_PROPRIO_ACEITO: %',r; end if;
 r:=public.registrar_fixture(prof,sp,jsonb_build_object('evento_id','evt-e','situacao','realizado',
  'evento_destino_id','evt-f','versao_esperada',0,'chave_idempotencia','rc-e'));
 if r->>'excecao' is distinct from 'ENTRADA_INVALIDA' then raise exception 'DESTINO_SEM_REMARCACAO_ACEITO: %',r; end if;
 r:=public.registrar_fixture(prof,sp,jsonb_build_object('evento_id','evt-d','situacao','remarcado',
  'evento_destino_id','evt-destino','motivo','custo','versao_esperada',0,'chave_idempotencia','rc-d'));
 if r->>'ok' is distinct from 'true' or (public.item_fixture(r,'evt-d'))->>'evento_destino_id'<>'evt-destino' then
  raise exception 'REGISTRO_REMARCADO: %',r; end if;
end $$;

-- Não confirmada: compromisso passado sem registro NÃO é falta, e as duas direções da remarcação.
do $$
#variable_conflict use_variable
declare
 prof uuid:='10000000-0000-4000-8000-000000000002'; sp uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; r jsonb; i jsonb;
begin
 r:=public.consultar_fixture(prof,sp,jsonb_build_object('eventos',jsonb_build_array(
  jsonb_build_object('evento_id','evt-a','fim',to_char((clock_timestamp()-interval '2 hours') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')),
  jsonb_build_object('evento_id','evt-sem-registro','fim',to_char((clock_timestamp()-interval '2 hours') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')),
  jsonb_build_object('evento_id','evt-futuro','fim',to_char((clock_timestamp()+interval '2 hours') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')),
  jsonb_build_object('evento_id','evt-d'),
  jsonb_build_object('evento_id','evt-destino'))));
 if r->>'ok' is distinct from 'true' then raise exception 'CONSULTA_NEGADA: %',r; end if;
 i:=public.item_fixture(r,'evt-sem-registro');
 if i->>'situacao'<>'realizacao_nao_confirmada' or i->>'situacao'='faltou'
  or i->'situacao_registrada'<>'null'::jsonb or i->>'versao'<>'0' then
  raise exception 'NAO_CONFIRMADA_INCORRETA: %',i;
 end if;
 if exists(select 1 from jsonb_array_elements(r#>'{dados,compromissos}') x
  where x->>'evento_id'='evt-sem-registro' and (x->>'situacao'='faltou' or x->>'situacao_registrada'='faltou')) then
  raise exception 'NAO_CONFIRMADA_CONTADA_COMO_FALTA';
 end if;
 if (public.item_fixture(r,'evt-futuro'))->>'situacao'<>'agendado' then raise exception 'FUTURO_INCORRETO: %',r; end if;
 -- Direção original -> destino e destino -> original.
 if (public.item_fixture(r,'evt-d'))->>'evento_destino_id'<>'evt-destino'
  or (public.item_fixture(r,'evt-destino'))->'remarcado_de' is distinct from jsonb_build_array('evt-d')
  or (public.item_fixture(r,'evt-d'))->'remarcado_de' is distinct from '[]'::jsonb then
  raise exception 'VINCULO_ENTRE_DATAS_INCOMPLETO: %',r;
 end if;
 -- A situação não revela o paciente vinculado ao compromisso.
 if r::text like '%'||paciente::text||'%' or r::text like '%paciente%' then
  raise exception 'SITUACAO_REVELOU_PACIENTE: %',r;
 end if;
end $$;

-- Retificação preserva o registro anterior; versão vencida e repetição não corrompem nada.
do $$
#variable_conflict use_variable
declare
 prof uuid:='10000000-0000-4000-8000-000000000002'; sp uuid:='20000000-0000-4000-8000-000000000002';
 r jsonb; alvo uuid:=gen_random_uuid(); entrada jsonb;
begin
 r:=public.registrar_fixture(prof,sp,jsonb_build_object('evento_id','evt-a','situacao','faltou',
  'motivo','custo','versao_esperada',1,'chave_idempotencia','rc-a-ret'));
 if r->>'ok' is distinct from 'true' or (public.item_fixture(r,'evt-a'))->>'versao'<>'2'
  or (public.item_fixture(r,'evt-a'))->>'situacao'<>'faltou' then raise exception 'RETIFICACAO: %',r; end if;
 if not exists(select 1 from cadastro.realizacao_compromisso where evento_id='evt-a' and versao=1 and situacao='realizado')
  or (select count(*) from cadastro.realizacao_compromisso where evento_id='evt-a')<>2 then
  raise exception 'RETIFICACAO_APAGOU_ANTERIOR';
 end if;
 r:=public.registrar_fixture(prof,sp,jsonb_build_object('evento_id','evt-a','situacao','cancelado',
  'versao_esperada',0,'chave_idempotencia','rc-a-velha'));
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'VERSAO_VENCIDA_ACEITA: %',r; end if;
 -- Repetição exata e repetição com digest diferente.
 entrada:=jsonb_build_object('registro_id',alvo,'digest_idempotencia',repeat('r',43),
  'evento_id','evt-g','situacao','cancelado','versao_esperada',0,'chave_idempotencia','rc-g');
 r:=public.realizacao_fixture(prof,sp,'oauth','api.registrar_realizacao_compromisso',entrada);
 if r->>'ok' is distinct from 'true' or r->>'repeticao'<>'false' then raise exception 'REGISTRO_G: %',r; end if;
 r:=public.realizacao_fixture(prof,sp,'oauth','api.registrar_realizacao_compromisso',entrada);
 if r->>'ok' is distinct from 'true' or r->>'repeticao'<>'true'
  or (select count(*) from cadastro.realizacao_compromisso where evento_id='evt-g')<>1 then
  raise exception 'REPETICAO_DUPLICOU: %',r;
 end if;
 r:=public.realizacao_fixture(prof,sp,'oauth','api.registrar_realizacao_compromisso',
  entrada||jsonb_build_object('digest_idempotencia',repeat('s',43)));
 if r#>>'{erro,codigo}' is distinct from 'conflito_idempotencia' then raise exception 'IDEMPOTENCIA: %',r; end if;
end $$;

-- Append-only: o banco recusa UPDATE e DELETE diretos, inclusive fora do wrapper.
do $$
begin
 begin
  update cadastro.realizacao_compromisso set situacao='realizado' where evento_id='evt-a';
  raise exception 'UPDATE_DIRETO_ACEITO';
 exception when insufficient_privilege then null;
 end;
 begin
  delete from cadastro.realizacao_compromisso where evento_id='evt-a';
  raise exception 'DELETE_DIRETO_ACEITO';
 exception when insufficient_privilege then null;
 end;
end $$;

-- Negativos de audiência: outro profissional e familiar, inclusive por acesso direto.
do $$
#variable_conflict use_variable
declare
 prof uuid:='10000000-0000-4000-8000-000000000002';
 outro uuid:='10000000-0000-4000-8000-000000000006'; so uuid:='20000000-0000-4000-8000-000000000006';
 familia uuid:='10000000-0000-4000-8000-000000000005'; sf uuid:='20000000-0000-4000-8000-000000000005';
 admin uuid:='10000000-0000-4000-8000-000000000001'; sa uuid:='20000000-0000-4000-8000-000000000001';
 r jsonb; antes bigint;
begin
 select count(*) into antes from cadastro.realizacao_compromisso;
 r:=public.consultar_fixture(outro,so,jsonb_build_object('agenda_usuario_id',prof,
  'eventos',jsonb_build_array(jsonb_build_object('evento_id','evt-a'))));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'OUTRO_LEU: %',r; end if;
 r:=public.registrar_fixture(outro,so,jsonb_build_object('agenda_usuario_id',prof,'evento_id','evt-a',
  'situacao','realizado','versao_esperada',2,'chave_idempotencia','rc-outro'));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'OUTRO_ESCREVEU: %',r; end if;
 -- Na própria agenda ele existe, mas não enxerga nada do colega: versão 0, sem situação.
 r:=public.consultar_fixture(outro,so,jsonb_build_object('eventos',jsonb_build_array(jsonb_build_object('evento_id','evt-a'))));
 if r->>'ok' is distinct from 'true' or (public.item_fixture(r,'evt-a'))->>'versao'<>'0'
  or (public.item_fixture(r,'evt-a'))->'situacao_registrada'<>'null'::jsonb then
  raise exception 'OUTRO_ENXERGOU_AGENDA_ALHEIA: %',r;
 end if;
 -- Acesso direto à tabela como `authenticated`, sem passar pelo wrapper.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',outro,'session_id',so,
  'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 set local role authenticated;
 begin
  perform 1 from cadastro.realizacao_compromisso;
  reset role;
  raise exception 'TABELA_EXPOSTA_A_AUTHENTICATED';
 exception when insufficient_privilege then null;
 end;
 reset role;
 -- Familiar: negado em leitura e em escrita.
 r:=public.realizacao_fixture(familia,sf,'password','api.consultar_realizacao_compromisso',
  jsonb_build_object('agenda_usuario_id',prof,'eventos',jsonb_build_array(jsonb_build_object('evento_id','evt-a'))));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'FAMILIA_LEU: %',r; end if;
 r:=public.realizacao_fixture(familia,sf,'password','api.registrar_realizacao_compromisso',
  jsonb_build_object('registro_id',gen_random_uuid(),'digest_idempotencia',repeat('r',43),
   'evento_id','evt-a','situacao','realizado','versao_esperada',2,'chave_idempotencia','rc-familia'));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'FAMILIA_ESCREVEU: %',r; end if;
 if (select count(*) from cadastro.realizacao_compromisso)<>antes then raise exception 'NEGATIVAS_GRAVARAM'; end if;
 if not exists(select 1 from auditoria.evento where tipo_objeto='agenda_realizacao' and resultado='negado' and ator_usuario_id=outro)
  or not exists(select 1 from auditoria.evento where tipo_objeto='agenda_realizacao' and resultado='negado' and ator_usuario_id=familia) then
  raise exception 'AUDITORIA_NEGADA_AUSENTE';
 end if;
 -- Audiência adotada (SUPOSIÇÃO CONSERVADORA): o Administrador alcança a agenda da equipe.
 r:=public.consultar_fixture(admin,sa,jsonb_build_object('agenda_usuario_id',prof,
  'eventos',jsonb_build_array(jsonb_build_object('evento_id','evt-a'))));
 if r->>'ok' is distinct from 'true' or (public.item_fixture(r,'evt-a'))->>'situacao'<>'faltou' then
  raise exception 'ADMIN_NEGADO: %',r;
 end if;
 r:=public.registrar_fixture(admin,sa,jsonb_build_object('agenda_usuario_id',prof,'evento_id','evt-a',
  'situacao','cancelado','versao_esperada',2,'chave_idempotencia','rc-admin'));
 if r->>'ok' is distinct from 'true' or (public.item_fixture(r,'evt-a'))->>'versao'<>'3' then
  raise exception 'ADMIN_NAO_REGISTROU: %',r;
 end if;
 if not exists(select 1 from cadastro.realizacao_compromisso
  where evento_id='evt-a' and versao=3 and autor_usuario_id=admin and usuario_id=prof) then
  raise exception 'AUTOR_INCORRETO';
 end if;
end $$;

-- Sessão encerrada e concessão revogada derrubam a operação, inclusive no replay.
do $$
#variable_conflict use_variable
declare prof uuid:='10000000-0000-4000-8000-000000000002'; sp uuid:='20000000-0000-4000-8000-000000000002'; r jsonb;
begin
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sp;
 r:=public.consultar_fixture(prof,sp,jsonb_build_object('eventos',jsonb_build_array(jsonb_build_object('evento_id','evt-a'))));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'SESSAO_ENCERRADA_ACEITA: %',r; end if;
 update identidade.sessao set encerrada_em=null where session_id=sp;
 update identidade.concessao_equipe set estado='revogada',revogada_em=clock_timestamp(),
  revogada_por_usuario_id='10000000-0000-4000-8000-000000000001',
  motivo_revogacao_cifrado='{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}'
  where usuario_id=prof;
 r:=public.realizacao_fixture(prof,sp,'oauth','api.registrar_realizacao_compromisso',
  jsonb_build_object('registro_id',gen_random_uuid(),'digest_idempotencia',repeat('r',43),
   'evento_id','evt-g','situacao','cancelado','versao_esperada',0,'chave_idempotencia','rc-g'));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'REPLAY_REVOGADO_ACEITO: %',r; end if;
 update identidade.concessao_equipe set estado='vinculada',revogada_em=null,revogada_por_usuario_id=null,
  motivo_revogacao_cifrado=null where usuario_id=prof;
end $$;

-- A flag da fatia termina desligada; nenhuma flag da integração Google foi tocada.
do $$ begin
 if not exists(select 1 from identidade.configuracao_sistema
  where chave='ffcm.realizacao_compromisso.ativo' and valor='false'::jsonb and exposicao='servidor') then
  raise exception 'FLAG_NAO_DESLIGADA';
 end if;
end $$;
