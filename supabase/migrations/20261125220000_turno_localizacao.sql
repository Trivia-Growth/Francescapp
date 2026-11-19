-- FR-067: location is separate, declared, consented and retained for 90 days.
begin;
create temporary table turno_execucao_privilegios on commit drop as select current_user::text migrador,pg_has_role(current_user,'ffcmapp_turno_execucao_owner','SET') tinha_set,has_schema_privilege('ffcmapp_turno_execucao_owner','api','CREATE') tinha_api,has_schema_privilege('ffcmapp_turno_execucao_owner','operacao','CREATE') tinha_operacao;
do $$ declare p record;begin select * into p from turno_execucao_privilegios;
 if not p.tinha_set then
  if exists(select 1 from pg_auth_members where roleid='ffcmapp_turno_execucao_owner'::regrole and member=current_user::regrole and grantor=current_user::regrole) then raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET';end if;
  execute format('grant ffcmapp_turno_execucao_owner to %I with inherit false,set true granted by %I',p.migrador,p.migrador);
 end if;
end $$;
create table cadastro.turno_consentimento_localizacao(
 usuario_id uuid not null references public.usuario(id),versao integer not null check(versao>0),anterior integer,
 concedido boolean not null,finalidade text not null,audiencia text not null,retencao_dias integer not null check(retencao_dias=90),
 registrado_em timestamptz not null default clock_timestamp(),chave text not null,digest text not null,
 primary key(usuario_id,versao),unique(usuario_id,chave),foreign key(usuario_id,anterior) references cadastro.turno_consentimento_localizacao(usuario_id,versao),
 check((versao=1 and anterior is null) or (versao>1 and anterior=versao-1)),check(length(chave) between 16 and 200),check(digest~'^[A-Za-z0-9_-]{43}$'),
 check(finalidade='Registrar localização declarada pelo aparelho na abertura e encerramento do turno.'),check(audiencia='Administrador e case manager do caso.')
);
create table cadastro.turno_localizacao(
 turno_id uuid not null references cadastro.turno(id),momento text not null check(momento in ('abertura','encerramento')),versao smallint not null check(versao in (0,1)),
 usuario_id uuid not null references public.usuario(id),consentimento_versao integer,
 latitude numeric,longitude numeric,precisao_metros numeric,motivo_ausencia text,
 registrado_em timestamptz not null default clock_timestamp(),declarada_pelo_aparelho boolean not null default true check(declarada_pelo_aparelho),
 primary key(turno_id,momento,versao),foreign key(usuario_id,consentimento_versao) references cadastro.turno_consentimento_localizacao(usuario_id,versao),
 check(coalesce((latitude is not null and longitude is not null and precisao_metros is not null and consentimento_versao is not null and motivo_ausencia is null and latitude between -90 and 90 and longitude between -180 and 180 and precisao_metros>=0 and precisao_metros::text not in ('NaN','Infinity','-Infinity'))
 or (latitude is null and longitude is null and precisao_metros is null and motivo_ausencia in ('permissao_negada','indisponivel','falha','consentimento_ausente','consentimento_revogado')),false)),
 check(versao<>0 or (latitude is null and longitude is null and precisao_metros is null and motivo_ausencia is not null))
);
create index turno_localizacao_retencao_idx on cadastro.turno_localizacao(turno_id);
alter table cadastro.turno_consentimento_localizacao enable row level security;
alter table cadastro.turno_consentimento_localizacao force row level security;
revoke all on cadastro.turno_consentimento_localizacao from public,anon,authenticated,service_role;
grant select,insert on cadastro.turno_consentimento_localizacao to ffcmapp_turno_execucao_owner;
create policy execucao_turno_consentimento_localizacao on cadastro.turno_consentimento_localizacao to ffcmapp_turno_execucao_owner using(true) with check(true);
alter table cadastro.turno_localizacao enable row level security;
alter table cadastro.turno_localizacao force row level security;
revoke all on cadastro.turno_localizacao from public,anon,authenticated,service_role;
grant select,insert on cadastro.turno_localizacao to ffcmapp_turno_execucao_owner;
create policy execucao_turno_localizacao on cadastro.turno_localizacao to ffcmapp_turno_execucao_owner using(true) with check(true);
create trigger turno_consentimento_localizacao_imutavel before update or delete on cadastro.turno_consentimento_localizacao for each row execute function cadastro.turno_grupo3_imutavel();
-- Consent absent/revoked defaults are recorded atomically with opening/closing.
-- The endpoint may append exactly one detailed declaration (version 1), never mutate it.
grant create on schema operacao to ffcmapp_turno_execucao_owner;
create function operacao.inicializar_localizacao_turno() returns trigger language plpgsql security definer set search_path='' set row_security=on as $$
declare momento text;consentimento cadastro.turno_consentimento_localizacao;
begin
 if tg_op='INSERT' then momento:='abertura';
 elsif old.situacao='aberto' and new.situacao='encerrado' then momento:='encerramento';else return new;end if;
 select * into consentimento from cadastro.turno_consentimento_localizacao where usuario_id=new.profissional_usuario_id order by versao desc limit 1;
 insert into cadastro.turno_localizacao(turno_id,momento,versao,usuario_id,consentimento_versao,motivo_ausencia)
 values(new.id,momento,0,new.profissional_usuario_id,consentimento.versao,case when consentimento.usuario_id is null then 'consentimento_ausente' when not consentimento.concedido then 'consentimento_revogado' else 'indisponivel' end);
 return new;
end $$;
create trigger inicializar_localizacao_turno after insert or update of situacao on cadastro.turno for each row execute function operacao.inicializar_localizacao_turno();
alter function operacao.inicializar_localizacao_turno() owner to ffcmapp_turno_execucao_owner;
do $acl$ declare migrador text:=current_user;begin
 perform set_config('role','ffcmapp_turno_execucao_owner',true);
 revoke all on function operacao.inicializar_localizacao_turno() from public,anon,authenticated,service_role;
 perform set_config('role',migrador,true);
end $acl$;
create table cadastro.turno_localizacao_exportacao(
 id uuid primary key,turno_id uuid not null references cadastro.turno(id),solicitante_usuario_id uuid not null references public.usuario(id),
 destinatario jsonb not null,proposito jsonb not null,digest_pdf text not null check(digest_pdf~'^[A-Za-z0-9_-]{43}$'),registrado_em timestamptz not null default clock_timestamp(),
 chave text not null,digest text not null,unique(solicitante_usuario_id,chave)
);
alter table cadastro.turno_localizacao_exportacao enable row level security;
alter table cadastro.turno_localizacao_exportacao force row level security;
revoke all on cadastro.turno_localizacao_exportacao from public,anon,authenticated,service_role;
grant select,insert on cadastro.turno_localizacao_exportacao to ffcmapp_turno_execucao_owner;
create policy execucao_localizacao_exportacao on cadastro.turno_localizacao_exportacao to ffcmapp_turno_execucao_owner using(true) with check(true);
create trigger turno_localizacao_exportacao_imutavel before update or delete on cadastro.turno_localizacao_exportacao for each row execute function cadastro.turno_grupo3_imutavel();
create function operacao.localizacao_turno_privada(p_transporte jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
#variable_conflict use_variable
declare e jsonb:=p_transporte->'entrada';a jsonb:=e->'atestado';ctx jsonb;ator uuid:=auth_privado.uid();paciente uuid;req uuid;acao text;gestor boolean;alvo uuid;turno uuid;momento text;
 c cadastro.turno_consentimento_localizacao;t cadastro.turno;esperada integer;atual integer;resultado jsonb;l cadastro.turno_localizacao;repeticao boolean:=false;motivo text;x cadastro.turno_localizacao_exportacao;
begin
 ctx:=operacao.autorizar_execucao_turno(p_transporte,array['api.gravar_consentimento_turno','api.consultar_consentimento_turno','api.registrar_localizacao_turno','api.consultar_localizacao_turno','api.consultar_exportacao_localizacao_turno','api.exportar_localizacao_turno']);
 paciente:=(e->>'paciente_id')::uuid;req:=(e->>'request_id')::uuid;acao:=a->>'operacao';
 if ctx->>'perfil' not in ('profissional','administrador') then raise insufficient_privilege;end if;
 gestor:=ctx->>'perfil'='administrador' or (ctx->>'perfil'='profissional' and exists(select 1 from cadastro.acompanhamento_caso x where x.paciente_id=paciente and x.responsavel_usuario_id=ator and x.versao=(select max(z.versao) from cadastro.acompanhamento_caso z where z.paciente_id=paciente)));
 if acao in ('api.gravar_consentimento_turno','api.consultar_consentimento_turno') then
  alvo:=coalesce((e->>'usuario_id')::uuid,ator);
  if alvo<>ator and (not gestor or not exists(select 1 from cadastro.turno where paciente_id=paciente and profissional_usuario_id=alvo)) then raise insufficient_privilege;end if;
  -- Identity lock serializes consent across cases before checking latest version.
  perform 1 from public.usuario where id=alvo for share;
  if acao='api.gravar_consentimento_turno' then
   if alvo<>ator or ctx->>'perfil'<>'profissional' or e-array['request_id','paciente_id','versao_esperada','concedido','finalidade','audiencia','retencao_dias','chave_idempotencia','digest_idempotencia','atestado']<>'{}'::jsonb then raise insufficient_privilege;end if;
   esperada:=(e->>'versao_esperada')::integer;
   if esperada is null or esperada<0 or esperada>=2147483647 or jsonb_typeof(e->'concedido') is distinct from 'boolean' or length(coalesce(e->>'chave_idempotencia','')) not between 16 and 200 or coalesce(e->>'digest_idempotencia','')!~'^[A-Za-z0-9_-]{43}$' then raise invalid_parameter_value;end if;
   -- Advisory lock is per authenticated professional, not per case. No caller chosen key.
   perform pg_catalog.pg_advisory_xact_lock(hashtextextended('ffcm.turno.consentimento:'||ator::text,0));
   select * into c from cadastro.turno_consentimento_localizacao where usuario_id=ator and chave=e->>'chave_idempotencia';
   if found then
    if c.digest is distinct from e->>'digest_idempotencia' or c.versao<>esperada+1 then raise exception using errcode='PZ064',message='conflito_idempotencia';end if;repeticao:=true;
   else
    select max(versao) into atual from cadastro.turno_consentimento_localizacao where usuario_id=ator;
    if coalesce(atual,0)<>esperada then raise exception using errcode='PZ064',message='conflito';end if;
    insert into cadastro.turno_consentimento_localizacao(usuario_id,versao,anterior,concedido,finalidade,audiencia,retencao_dias,chave,digest) values(ator,esperada+1,case when esperada=0 then null else esperada end,(e->>'concedido')::boolean,e->>'finalidade',e->>'audiencia',(e->>'retencao_dias')::integer,e->>'chave_idempotencia',e->>'digest_idempotencia') returning * into c;
   end if;
  else
   if e-array['request_id','paciente_id','usuario_id','atestado']<>'{}'::jsonb then raise invalid_parameter_value;end if;
   select * into c from cadastro.turno_consentimento_localizacao where usuario_id=alvo order by versao desc limit 1;
  end if;
  resultado:=case when c.usuario_id is null then null else to_jsonb(c)-array['chave','digest'] end;
 else
  turno:=(e->>'turno_id')::uuid;
  select * into t from cadastro.turno where id=turno and paciente_id=paciente;
  if not found then raise insufficient_privilege;end if;
  if acao='api.consultar_exportacao_localizacao_turno' then
   if not gestor or e-array['request_id','paciente_id','turno_id','exportacao_id','atestado']<>'{}'::jsonb then raise insufficient_privilege;end if;
   select jsonb_build_object('exportacao_id',z.id,'registrado_em',z.registrado_em) into resultado from cadastro.turno_localizacao_exportacao z where z.id=(e->>'exportacao_id')::uuid and z.turno_id=turno and z.solicitante_usuario_id=ator;
  elsif acao='api.exportar_localizacao_turno' then
   if not gestor or t.aberto_em+interval '90 days'<=clock_timestamp() or e-array['request_id','paciente_id','turno_id','exportacao_id','destinatario','proposito','aad_destinatario','aad_proposito','digest_pdf','chave_idempotencia','digest_idempotencia','atestado']<>'{}'::jsonb then raise insufficient_privilege;end if;
   if not operacao.validar_cifra_execucao(e->'destinatario',e->'aad_destinatario',paciente,turno,(e->>'exportacao_id')::uuid,1,'cadastro.turno_localizacao_exportacao','destinatario') or not operacao.validar_cifra_execucao(e->'proposito',e->'aad_proposito',paciente,turno,(e->>'exportacao_id')::uuid,1,'cadastro.turno_localizacao_exportacao','proposito')
    or length(coalesce(e->>'chave_idempotencia','')) not between 16 and 200 or coalesce(e->>'digest_idempotencia','')!~'^[A-Za-z0-9_-]{43}$' then raise invalid_parameter_value;end if;
   select * into x from cadastro.turno_localizacao_exportacao where solicitante_usuario_id=ator and chave=e->>'chave_idempotencia';
   if found then
    if x.turno_id<>turno or x.id is distinct from (e->>'exportacao_id')::uuid or x.digest_pdf is distinct from e->>'digest_pdf' or x.digest is distinct from e->>'digest_idempotencia' then raise exception using errcode='PZ064',message='conflito_idempotencia';end if;repeticao:=true;
   else
    insert into cadastro.turno_localizacao_exportacao(id,turno_id,solicitante_usuario_id,destinatario,proposito,digest_pdf,chave,digest) values((e->>'exportacao_id')::uuid,turno,ator,e->'destinatario',e->'proposito',e->>'digest_pdf',e->>'chave_idempotencia',e->>'digest_idempotencia') returning * into x;
   end if;
   resultado:=jsonb_build_object('exportacao_id',x.id,'registrado_em',x.registrado_em);
  elsif acao='api.consultar_localizacao_turno' then
   if not gestor or e-array['request_id','paciente_id','turno_id','atestado']<>'{}'::jsonb then raise insufficient_privilege;end if;
   if t.aberto_em+interval '90 days'<=clock_timestamp() then resultado:=jsonb_build_object('itens','[]'::jsonb,'ausencia','retencao_expirada');
   else
    select jsonb_build_object('itens',coalesce(jsonb_agg(to_jsonb(x) order by x.momento),'[]'::jsonb)) into resultado from cadastro.turno_localizacao x where x.turno_id=turno and x.versao=(select max(z.versao) from cadastro.turno_localizacao z where z.turno_id=turno and z.momento=x.momento);
   end if;
  else
   if t.profissional_usuario_id<>ator or ctx->>'perfil'<>'profissional' or t.aberto_em+interval '90 days'<=clock_timestamp() or e-array['request_id','paciente_id','turno_id','momento','latitude','longitude','precisao_metros','motivo_ausencia','atestado']<>'{}'::jsonb then raise insufficient_privilege;end if;
   momento:=e->>'momento';motivo:=e->>'motivo_ausencia';
   if momento is null or momento not in ('abertura','encerramento') or (momento='encerramento' and t.situacao<>'encerrado') then raise invalid_parameter_value;end if;
   -- Serializes revocation with collection, including cross-case consent changes.
   perform pg_catalog.pg_advisory_xact_lock(hashtextextended('ffcm.turno.consentimento:'||ator::text,0));
   select * into c from cadastro.turno_consentimento_localizacao where usuario_id=ator order by versao desc limit 1;
   if e ?| array['latitude','longitude','precisao_metros'] then
    if c.usuario_id is null or not c.concedido or motivo is not null or jsonb_typeof(e->'latitude') is distinct from 'number' or jsonb_typeof(e->'longitude') is distinct from 'number' or jsonb_typeof(e->'precisao_metros') is distinct from 'number' then raise insufficient_privilege;end if;
   elsif motivo is null then motivo:=case when c.usuario_id is null then 'consentimento_ausente' when not c.concedido then 'consentimento_revogado' else 'indisponivel' end;end if;
   select * into l from cadastro.turno_localizacao where turno_id=turno and cadastro.turno_localizacao.momento=momento and versao=1;
   if found then
    if l.latitude is distinct from (e->>'latitude')::numeric or l.longitude is distinct from (e->>'longitude')::numeric or l.precisao_metros is distinct from (e->>'precisao_metros')::numeric or l.motivo_ausencia is distinct from motivo then raise exception using errcode='PZ064',message='conflito';end if;repeticao:=true;
   else
    insert into cadastro.turno_localizacao(turno_id,momento,versao,usuario_id,consentimento_versao,latitude,longitude,precisao_metros,motivo_ausencia) values(turno,momento,1,ator,c.versao,(e->>'latitude')::numeric,(e->>'longitude')::numeric,(e->>'precisao_metros')::numeric,motivo) returning * into l;
   end if;
   -- Registrar recebe confirmação sem coordenadas; audiência continua própria.
   resultado:=jsonb_build_object('turno_id',turno,'momento',momento,'registrado',true);
  end if;
 end if;
 if (a->>'expira_em')::timestamptz<=clock_timestamp() or operacao.contexto_execucao_turno(req) is null then raise insufficient_privilege;end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'permitido',req);
 if not found then raise exception 'AUDITORIA_NAO_INSERIDA';end if;
 if (a->>'expira_em')::timestamptz<=clock_timestamp() or operacao.contexto_execucao_turno(req) is null then raise insufficient_privilege;end if;
 return jsonb_build_object('ok',true,'repeticao',repeticao,'dados',resultado,'request_id',req);
end $$;
revoke all on function operacao.localizacao_turno_privada(jsonb) from public,anon,authenticated,service_role;
grant execute on function operacao.localizacao_turno_privada(jsonb) to ffcmapp_turno_execucao_owner;
insert into identidade.configuracao_sistema(id,chave,valor,tipo,rotulo,descricao,exposicao) values(gen_random_uuid(),'ffcm.turno.expurgo_localizacao_ativo','false','booleano','Expurgo da localização de turno','Desligado até validação. Retenção de 90 dias; não remove turno ou conteúdo clínico.','servidor');
grant delete on cadastro.turno_localizacao to ffcmapp_turno_execucao_owner;
create policy execucao_localizacao_expurgo on cadastro.turno_localizacao for delete to ffcmapp_turno_execucao_owner using(true);
grant insert(operador_restrito) on auditoria.evento to ffcmapp_turno_execucao_owner;
create policy execucao_localizacao_auditoria_expurgo on auditoria.evento for insert to ffcmapp_turno_execucao_owner with check(operador_restrito='pg_cron.turno_localizacao_expurgo' and ator_usuario_id is null and ator_auth_id is null and acao='localizacao_expirada' and tipo_objeto='retencao_turno' and objeto_id is null and resultado='permitido');
create function operacao.expurgar_localizacao_turno() returns integer language plpgsql security definer set search_path='' set row_security=on as $$
declare quantidade integer;
begin
 perform 1 from identidade.configuracao_sistema where chave='ffcm.turno.expurgo_localizacao_ativo' and tipo='booleano' and valor='true'::jsonb for share;
 if not found then return 0;end if;
 delete from cadastro.turno_localizacao l using cadastro.turno t where t.id=l.turno_id and t.aberto_em+interval '90 days'<=clock_timestamp();
 get diagnostics quantidade=row_count;
 insert into auditoria.evento(id,operador_restrito,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),'pg_cron.turno_localizacao_expurgo','localizacao_expirada','retencao_turno',null,'permitido',gen_random_uuid());
 if not found then raise exception 'AUDITORIA_NAO_INSERIDA';end if;
 return quantidade;
end $$;
alter function operacao.expurgar_localizacao_turno() owner to ffcmapp_turno_execucao_owner;
do $acl$ declare migrador text:=current_user;begin
 perform set_config('role','ffcmapp_turno_execucao_owner',true);
 revoke all on function operacao.expurgar_localizacao_turno() from public,anon,authenticated,service_role;
 perform set_config('role',migrador,true);
end $acl$;
do $$ declare migrador text:=current_user;begin
 perform set_config('role','ffcmapp_turno_execucao_owner',true);
 execute format('grant execute on function operacao.expurgar_localizacao_turno() to %I',migrador);
 perform set_config('role',migrador,true);
 if not has_function_privilege(migrador,'operacao.expurgar_localizacao_turno()','EXECUTE') or has_function_privilege('authenticated','operacao.expurgar_localizacao_turno()','EXECUTE') or has_function_privilege('service_role','operacao.expurgar_localizacao_turno()','EXECUTE') then raise exception 'ACL_EXPURGO_INESPERADA';end if;
end $$;
-- Use existing pg_cron if available; no extension install, no membership or app grant.
-- Creating a disabled, guarded schedule never invokes deletion in this migration.
do $$ declare job bigint;begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  if to_regprocedure('cron.alter_job(bigint,text,text,text,text,boolean)') is null then raise exception 'PG_CRON_SEM_SUPORTE_JOB_INATIVO';end if;
  job:=cron.schedule('ffcm-turno-localizacao-90-dias','17 3 * * *','select operacao.expurgar_localizacao_turno()');
  perform cron.alter_job(job,active:=false);
 end if;
end $$;
grant create on schema api to ffcmapp_turno_execucao_owner;
create function api.turno_localizacao(p_transporte jsonb) returns jsonb language plpgsql security definer set search_path='' set row_security=on as $$
declare ator uuid:=auth_privado.uid();req uuid;paciente uuid;codigo text;acao text;
begin
 begin return operacao.localizacao_turno_privada(p_transporte);
 exception when others then codigo:=case when sqlstate='PZ064' and sqlerrm in ('conflito','conflito_idempotencia') then sqlerrm when sqlstate='42501' then 'sem_permissao' when sqlstate in ('22023','22P02','22007','22008','22003','23514','23502') then 'entrada_invalida' when sqlstate in ('23505','23503') then 'conflito' else 'servico_indisponivel' end;end;
 req:=(p_transporte#>>'{entrada,request_id}')::uuid;paciente:=(p_transporte#>>'{entrada,paciente_id}')::uuid;
 if ator is null or req is null then raise insufficient_privilege;end if;
 acao:=p_transporte#>>'{entrada,atestado,operacao}';
 if acao is null or acao not in ('api.gravar_consentimento_turno','api.consultar_consentimento_turno','api.registrar_localizacao_turno','api.consultar_localizacao_turno','api.consultar_exportacao_localizacao_turno','api.exportar_localizacao_turno') then acao:='api.registrar_localizacao_turno';end if;
 if exists(select 1 from public.usuario where id=ator) then insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
 else insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);end if;
 if not found then raise exception 'AUDITORIA_NAO_INSERIDA';end if;
 return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo',codigo),'request_id',req);
end $$;
alter function api.turno_localizacao(jsonb) owner to ffcmapp_turno_execucao_owner;
do $acl$ declare migrador text:=current_user;begin
 perform set_config('role','ffcmapp_turno_execucao_owner',true);
 revoke all on function api.turno_localizacao(jsonb) from public,anon,authenticated,service_role;
 grant execute on function api.turno_localizacao(jsonb) to authenticated;
 perform set_config('role',migrador,true);
end $acl$;

do $$ declare p record;begin select * into p from turno_execucao_privilegios;
 if not p.tinha_api then revoke create on schema api from ffcmapp_turno_execucao_owner;end if;
 if not p.tinha_operacao then revoke create on schema operacao from ffcmapp_turno_execucao_owner;end if;
 if not p.tinha_set then execute format('revoke ffcmapp_turno_execucao_owner from %I granted by %I',p.migrador,p.migrador);end if;
end $$;
commit;
