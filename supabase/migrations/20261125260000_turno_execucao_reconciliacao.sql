begin;
-- Operational metadata only. No clinical content, direct application grants or cleanup jobs.
create table operacao.turno_execucao_barreira(
 ator_usuario_id uuid primary key references public.usuario(id),
 epoca integer not null default 0 check(epoca>=0), resultado_pendente jsonb,
 check(resultado_pendente is null or (jsonb_typeof(resultado_pendente)='object' and resultado_pendente-array['recibo_id','paciente_id','classe','registro_id','versao','registrado_em']='{}'::jsonb))
);
create table operacao.turno_execucao_reconciliacao(
 ator_usuario_id uuid not null references public.usuario(id),comando_id uuid not null,
 resultado jsonb not null,primary key(ator_usuario_id,comando_id)
);
alter table operacao.turno_execucao_recibo add column recibo_id uuid not null default gen_random_uuid();
create unique index turno_execucao_recibo_id_idx on operacao.turno_execucao_recibo(recibo_id);
alter table operacao.turno_execucao_barreira enable row level security;
alter table operacao.turno_execucao_barreira force row level security;
alter table operacao.turno_execucao_reconciliacao enable row level security;
alter table operacao.turno_execucao_reconciliacao force row level security;
revoke all on operacao.turno_execucao_barreira,operacao.turno_execucao_reconciliacao from public,anon,authenticated,service_role;
grant select,insert,update on operacao.turno_execucao_barreira to ffcmapp_turno_execucao_owner;
grant select,insert on operacao.turno_execucao_reconciliacao to ffcmapp_turno_execucao_owner;
create policy execucao_barreira_owner on operacao.turno_execucao_barreira to ffcmapp_turno_execucao_owner using(ator_usuario_id=auth_privado.uid()) with check(ator_usuario_id=auth_privado.uid());
create policy execucao_reconciliacao_owner on operacao.turno_execucao_reconciliacao to ffcmapp_turno_execucao_owner using(ator_usuario_id=auth_privado.uid()) with check(ator_usuario_id=auth_privado.uid());
create temporary table execucao_predicados_inventario(assinatura text primary key, origem text not null, hash_anterior text not null, hash_novo text not null) on commit drop;
create function pg_temp.atualizar_execucao(p_assinatura text,p_hash text,p_hash_novo text,p_patches jsonb,p_origem text,p_executores text[] default null) returns void language plpgsql as $guard$
declare oid_alvo oid:=to_regprocedure(p_assinatura); antes record; depois record; definicao text; migrador text:=current_user; dono text; esquema text; tinha_set boolean; tinha_create boolean; novo_corpo text; patch jsonb; antigo text; novo text; executor text; executor_owner text; executores text[];
begin
 if oid_alvo is null then raise exception 'CONSUMIDOR_AUSENTE: %',p_assinatura;end if;
 select p.prosrc,p.proowner,p.proacl,p.proconfig,p.prosecdef,p.prorettype,p.proargtypes into antes from pg_proc p where p.oid=oid_alvo;
 if md5(antes.prosrc)<>p_hash then raise exception 'FONTE_AUTENTICADOR_DIVERGENTE: %',p_assinatura;end if;
 select r.rolname,n.nspname into dono,esquema from pg_proc p join pg_roles r on r.oid=p.proowner join pg_namespace n on n.oid=p.pronamespace where p.oid=oid_alvo and (not antes.prosecdef or (not r.rolsuper and not r.rolbypassrls and not r.rolcanlogin));
 if dono is null or not ('search_path=""'=any(antes.proconfig)) then raise exception 'OWNER_CONFIG_INESPERADO: %',p_assinatura;end if;
 novo_corpo:=antes.prosrc;
 for patch in select value from jsonb_array_elements(p_patches) loop
  antigo:=patch->>'antes';novo:=patch->>'depois';
  if antigo is null or antigo='' or novo is null or (length(novo_corpo)-length(replace(novo_corpo,antigo,'')))/length(antigo)<>1 then raise exception 'ANCORA_NAO_UNICA: %',p_assinatura;end if;
  novo_corpo:=replace(novo_corpo,antigo,novo);
 end loop;
 if md5(novo_corpo)<>p_hash_novo then raise exception 'HASH_FINAL_DIVERGENTE: %',p_assinatura;end if;
 if antes.prosecdef then
 tinha_set:=pg_has_role(migrador,dono,'SET');tinha_create:=has_schema_privilege(dono,esquema,'CREATE');
 if not tinha_set then
  if exists(select 1 from pg_auth_members where roleid=dono::regrole and member=migrador::regrole and grantor=migrador::regrole) then raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET';end if;
  execute format('grant %I to %I with inherit false,set true granted by %I',dono,migrador,migrador);
 end if;
 if not tinha_create then execute format('grant create on schema %I to %I',esquema,dono);end if;
 definicao:=pg_get_functiondef(oid_alvo);
 perform set_config('role',dono,true);
 execute replace(definicao,antes.prosrc,novo_corpo);
 perform set_config('role',migrador,true);
 if not tinha_create then execute format('revoke create on schema %I from %I',esquema,dono);end if;
 if not tinha_set then execute format('revoke %I from %I granted by %I',dono,migrador,migrador);end if;
 else
  if not pg_has_role(migrador,dono,'USAGE') then raise exception 'OWNERSHIP_INVOKER_INDISPONIVEL: %',p_assinatura;end if;
  definicao:=pg_get_functiondef(oid_alvo);
  execute replace(definicao,antes.prosrc,novo_corpo);
 end if;
 select p.prosrc,p.proowner,p.proacl,p.proconfig,p.prosecdef,p.prorettype,p.proargtypes into depois from pg_proc p where p.oid=oid_alvo;
 if depois.proowner<>antes.proowner or depois.proacl is distinct from antes.proacl or depois.proconfig is distinct from antes.proconfig or depois.prosecdef<>antes.prosecdef or depois.prorettype<>antes.prorettype or depois.proargtypes<>antes.proargtypes or depois.prosrc<>novo_corpo then raise exception 'CONSUMIDOR_NAO_PRESERVADO: %',p_assinatura;end if;
 insert into execucao_predicados_inventario values(p_assinatura,p_origem,p_hash,md5(depois.prosrc));
end $guard$;
select pg_temp.atualizar_execucao('operacao.execucao_turno_privada(jsonb)','409c07b393d09f314e1e38aff4ea67d2','c30a7bcd121866f8ca279591a7173e08',jsonb_build_array(jsonb_build_object('antes',$f$'digest_idempotencia','atestado']<>'{}'::jsonb or ctx->>'perfil'<>'profissional'$f$,'depois',$f$'digest_idempotencia','epoca','atestado']<>'{}'::jsonb or ctx->>'perfil'<>'profissional'$f$),jsonb_build_object('antes',$f$  -- Authorization, live concession and turn state precede idempotent replay.$f$,'depois',$f$  -- Existing case/turn/concession authorization precedes this actor fence.
  if jsonb_typeof(e->'epoca') is distinct from 'number' or e->>'epoca' !~ '^[1-9][0-9]{0,9}$' then raise invalid_parameter_value;end if;
  perform 1 from operacao.turno_execucao_barreira where ator_usuario_id=ator and epoca=(e->>'epoca')::integer for update;
  if not found then raise exception using errcode='PZ064',message='conflito';end if;
  -- Authorization, live concession and turn state precede idempotent replay.$f$),jsonb_build_object('antes',$f$  else
   execute format('select max(versao) from %s where registro_id=$1',tabela)$f$,'depois',$f$  else
   if exists(select 1 from operacao.turno_execucao_barreira where ator_usuario_id=ator and resultado_pendente is not null) then raise exception using errcode='PZ064',message='conflito';end if;
   execute format('select max(versao) from %s where registro_id=$1',tabela)$f$),jsonb_build_object('antes',$f$   insert into operacao.turno_execucao_recibo(ator_usuario_id,chave,digest,registro_id,versao) values(ator,e->>'chave_idempotencia',e->>'digest_idempotencia',registro,versao);$f$,'depois',$f$   insert into operacao.turno_execucao_recibo(ator_usuario_id,chave,digest,registro_id,versao) values(ator,e->>'chave_idempotencia',e->>'digest_idempotencia',registro,versao) returning * into recibo;
   update operacao.turno_execucao_barreira set resultado_pendente=jsonb_build_object('recibo_id',recibo.recibo_id,'paciente_id',paciente,'classe',classe,'registro_id',registro,'versao',versao,'registrado_em',clock_timestamp()) where ator_usuario_id=ator;$f$),jsonb_build_object('antes',$f$  select to_jsonb(s) into resultado from cadastro.turno_execucao_serie s where s.id=registro and s.versao=versao;$f$,'depois',$f$  select to_jsonb(s)||jsonb_build_object('recibo_id',recibo.recibo_id) into resultado from cadastro.turno_execucao_serie s where s.id=registro and s.versao=versao;$f$)),'20261125200000_turno_execucao_clinica.sql');

-- Preserve pre-existing SET membership and schema CREATE for NOSUPER migrators.
create temporary table execucao_barreira_privilegios as select current_user::text migrador,
 pg_has_role(current_user,'ffcmapp_turno_execucao_owner','SET') tinha_set,
 has_schema_privilege('ffcmapp_turno_execucao_owner','api','CREATE') tinha_create;
do $grant$ declare x record;begin
 select * into x from execucao_barreira_privilegios;
 if not x.tinha_set then
  if exists(select 1 from pg_auth_members where roleid='ffcmapp_turno_execucao_owner'::regrole and member=x.migrador::regrole and grantor=x.migrador::regrole) then raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET';end if;
  execute format('grant ffcmapp_turno_execucao_owner to %I with inherit false,set true granted by %I',x.migrador,x.migrador);
 end if;
 if not x.tinha_create then grant create on schema api to ffcmapp_turno_execucao_owner;end if;
end $grant$;
create function api.turno_execucao_barreira(p_transporte jsonb) returns jsonb language plpgsql security definer set search_path='' set row_security=on as $barreira$
declare e jsonb:=p_transporte->'entrada';a jsonb:=e->'atestado';ator uuid:=auth_privado.uid();sid uuid;req uuid;ctx jsonb;acao text;inicio timestamptz;fim timestamptz;estado operacao.turno_execucao_barreira;resposta jsonb;comando uuid;codigo text;repeticao boolean:=false;
begin
 begin
  if jsonb_typeof(p_transporte) is distinct from 'object' or p_transporte-array['entrada','entrada_canonica','dados_canonicos']<>'{}'::jsonb or jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(a) is distinct from 'object' then raise insufficient_privilege;end if;
  sid:=(auth_privado.jwt()->>'session_id')::uuid;req:=(e->>'request_id')::uuid;acao:=a->>'operacao';inicio:=(a->>'emitido_em')::timestamptz;fim:=(a->>'expira_em')::timestamptz;
  if ator is null or sid is null or req is null or inicio is null or fim is null or acao is null or acao not in ('api.reconciliar_execucao_turno','api.reconhecer_execucao_turno')
   or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sid::text or a->>'request_id' is distinct from req::text
   or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
   or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then raise insufficient_privilege;end if;
  ctx:=operacao.contexto_execucao_turno(req);
  if ctx is null or ctx->>'perfil' not in ('profissional','administrador') then raise insufficient_privilege;end if;
  -- No case lookup: only own operational receipt remains recoverable after case revocation.
  if e-array['request_id','paciente_id','comando_id','epoca','recibo_id','atestado']<>'{}'::jsonb then raise invalid_parameter_value;end if;
  insert into operacao.turno_execucao_barreira(ator_usuario_id) values(ator) on conflict do nothing;
  select * into estado from operacao.turno_execucao_barreira where ator_usuario_id=ator for update;
  if acao='api.reconciliar_execucao_turno' then
   if e ? 'epoca' or e ? 'recibo_id' then raise invalid_parameter_value;end if;
   comando:=(e->>'comando_id')::uuid;if comando is null then raise invalid_parameter_value;end if;
   select resultado into resposta from operacao.turno_execucao_reconciliacao where ator_usuario_id=ator and comando_id=comando;
   if found then repeticao:=true;else
    update operacao.turno_execucao_barreira set epoca=epoca+1 where ator_usuario_id=ator returning * into estado;
    resposta:=jsonb_build_object('epoca',estado.epoca,'resultado_pendente',estado.resultado_pendente);
    insert into operacao.turno_execucao_reconciliacao(ator_usuario_id,comando_id,resultado) values(ator,comando,resposta);
   end if;
  else
   if e ? 'comando_id' or jsonb_typeof(e->'epoca') is distinct from 'number' or e->>'epoca' !~ '^[1-9][0-9]{0,9}$' or e->>'recibo_id' is null then raise invalid_parameter_value;end if;
   if estado.epoca<>(e->>'epoca')::integer then raise exception using errcode='PZ064',message='conflito';end if;
   if estado.resultado_pendente is not null then
    if estado.resultado_pendente->>'recibo_id' is distinct from (e->>'recibo_id')::uuid::text then raise exception using errcode='PZ064',message='conflito';end if;
    update operacao.turno_execucao_barreira set resultado_pendente=null where ator_usuario_id=ator returning * into estado;
   elsif not exists(select 1 from operacao.turno_execucao_recibo where ator_usuario_id=ator and recibo_id=(e->>'recibo_id')::uuid) then raise exception using errcode='PZ064',message='conflito';end if;
   resposta:=jsonb_build_object('epoca',estado.epoca,'resultado_pendente',estado.resultado_pendente);
  end if;
  ctx:=operacao.contexto_execucao_turno(req);
  if fim<=clock_timestamp() or ctx is null or ctx->>'perfil' not in ('profissional','administrador') then raise insufficient_privilege;end if;
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'usuario',ator,'permitido',req);
  if not found then raise exception 'AUDITORIA_NAO_INSERIDA';end if;
  ctx:=operacao.contexto_execucao_turno(req);
  if fim<=clock_timestamp() or ctx is null or ctx->>'perfil' not in ('profissional','administrador') then raise insufficient_privilege;end if;
  return jsonb_build_object('ok',true,'repeticao',repeticao,'dados',resposta,'request_id',req);
 exception when others then
  codigo:=case when sqlstate='PZ064' then 'conflito' when sqlstate='42501' then 'sem_permissao' when sqlstate in ('22023','22P02','22003') then 'entrada_invalida' else 'servico_indisponivel' end;
 end;
 req:=(e->>'request_id')::uuid;
 if ator is null or req is null then raise insufficient_privilege;end if;
 if exists(select 1 from public.usuario where id=ator) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,coalesce(acao,'api.reconciliar_execucao_turno'),'usuario',ator,'negado',req);
 else
  insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,coalesce(acao,'api.reconciliar_execucao_turno'),'usuario',ator,'negado',req);
 end if;
 if not found then raise exception 'AUDITORIA_NAO_INSERIDA';end if;
 return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo',codigo),'request_id',req);
end $barreira$;
alter function api.turno_execucao_barreira(jsonb) owner to ffcmapp_turno_execucao_owner;
do $acl$ declare migrador text:=current_user;begin
 perform set_config('role','ffcmapp_turno_execucao_owner',true);
 revoke all on function api.turno_execucao_barreira(jsonb) from public,anon,authenticated,service_role;
 grant execute on function api.turno_execucao_barreira(jsonb) to authenticated;
 perform set_config('role',migrador,true);
end $acl$;
do $restore$ declare x record;begin
 select * into x from execucao_barreira_privilegios;
 if not x.tinha_create then revoke create on schema api from ffcmapp_turno_execucao_owner;end if;
 if not x.tinha_set then execute format('revoke ffcmapp_turno_execucao_owner from %I granted by %I',x.migrador,x.migrador);end if;
end $restore$;
drop table execucao_barreira_privilegios;
commit;
