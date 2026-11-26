-- FR-061/030: private temporary Supabase destination for turn occurrences only.
begin;
create temporary table turno_execucao_privilegios on commit drop as select current_user::text migrador,pg_has_role(current_user,'ffcmapp_turno_execucao_owner','SET') tinha_set,has_schema_privilege('ffcmapp_turno_execucao_owner','api','CREATE') tinha_api,has_schema_privilege('ffcmapp_turno_execucao_owner','operacao','CREATE') tinha_operacao;
do $$ declare p record;begin select * into p from turno_execucao_privilegios;
 if not p.tinha_set then
  if exists(select 1 from pg_auth_members where roleid='ffcmapp_turno_execucao_owner'::regrole and member=current_user::regrole and grantor=current_user::regrole) then raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET';end if;
  execute format('grant ffcmapp_turno_execucao_owner to %I with inherit false,set true granted by %I',p.migrador,p.migrador);
 end if;
end $$;
create table cadastro.turno_anexo(
 id uuid primary key,paciente_id uuid not null references cadastro.paciente(id),ocorrencia_id uuid not null,ocorrencia_versao integer not null,
 autor_usuario_id uuid not null references public.usuario(id),objeto_nome text not null unique,
 classificacao text not null check(classificacao='execucao_turno'),audiencia text not null check(audiencia in ('equipe','equipe_e_familia')),
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),tamanho_bytes integer not null check(tamanho_bytes between 1 and 3145728),
 origem_destino text not null default 'supabase_privado_temporario' check(origem_destino='supabase_privado_temporario'),
 registrado_em timestamptz not null default clock_timestamp(),chave text not null,digest text not null,
 unique(autor_usuario_id,chave),foreign key(ocorrencia_id,ocorrencia_versao) references cadastro.turno_ocorrencia_versao(registro_id,versao)
);
create table cadastro.turno_anexo_confirmacao(
 anexo_id uuid primary key references cadastro.turno_anexo(id),confirmado_em timestamptz not null default clock_timestamp(),
 autor_usuario_id uuid not null references public.usuario(id)
);
alter table cadastro.turno_anexo enable row level security;
alter table cadastro.turno_anexo force row level security;
revoke all on cadastro.turno_anexo from public,anon,authenticated,service_role;
grant select,insert on cadastro.turno_anexo to ffcmapp_turno_execucao_owner;
create policy execucao_turno_anexo on cadastro.turno_anexo to ffcmapp_turno_execucao_owner using(true) with check(true);
create trigger turno_anexo_imutavel before update or delete on cadastro.turno_anexo for each row execute function cadastro.turno_grupo3_imutavel();
alter table cadastro.turno_anexo_confirmacao enable row level security;
alter table cadastro.turno_anexo_confirmacao force row level security;
revoke all on cadastro.turno_anexo_confirmacao from public,anon,authenticated,service_role;
grant select,insert on cadastro.turno_anexo_confirmacao to ffcmapp_turno_execucao_owner;
create policy execucao_turno_anexo_confirmacao on cadastro.turno_anexo_confirmacao to ffcmapp_turno_execucao_owner using(true) with check(true);
create trigger turno_anexo_confirmacao_imutavel before update or delete on cadastro.turno_anexo_confirmacao for each row execute function cadastro.turno_grupo3_imutavel();
create index turno_anexo_caso_idx on cadastro.turno_anexo(paciente_id,ocorrencia_id,id);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('turno-ocorrencias','turno-ocorrencias',false,3145728,array['image/jpeg','image/png','image/webp']);
-- No URL is persisted. A named private object alone conveys no authority.
grant create on schema operacao to ffcmapp_turno_execucao_owner;
create function operacao.objeto_turno_autorizado(p_bucket text,p_nome text,p_escrita boolean) returns boolean language plpgsql security definer set search_path='' set row_security=on as $$
declare ctx jsonb;ator uuid:=auth_privado.uid();anexo cadastro.turno_anexo;permitido boolean:=false;
begin
 if p_bucket is distinct from 'turno-ocorrencias' or p_nome is null then return false;end if;
 ctx:=operacao.contexto_execucao_turno(gen_random_uuid());if ctx is null then return false;end if;
 select * into anexo from cadastro.turno_anexo where objeto_nome=p_nome;
 if not found then return false;end if;
 perform 1 from cadastro.acesso_paciente where paciente_id=anexo.paciente_id and usuario_id=ator and revogada_em is null for share;
 if not found then return false;end if;
 perform 1 from identidade.configuracao_sistema where chave='ffcm.turno.ativo' and tipo='booleano' and valor='true'::jsonb for share;
 if not found then return false;end if;
 perform 1 from cadastro.paciente where id=anexo.paciente_id for update;
 if not found then return false;end if;
 if p_escrita then
  permitido:=ctx->>'perfil'='profissional' and anexo.autor_usuario_id=ator and not exists(select 1 from cadastro.turno_anexo_confirmacao where anexo_id=anexo.id)
   and exists(select 1 from cadastro.turno_execucao_registro r join cadastro.turno t on t.id=r.turno_id where r.id=anexo.ocorrencia_id and r.paciente_id=anexo.paciente_id and t.profissional_usuario_id=ator and t.situacao='aberto');
 else
  permitido:=(anexo.autor_usuario_id=ator and ctx->>'perfil'='profissional' and exists(select 1 from cadastro.turno_execucao_registro r join cadastro.turno t on t.id=r.turno_id where r.id=anexo.ocorrencia_id and r.paciente_id=anexo.paciente_id and t.profissional_usuario_id=ator and t.situacao='aberto')) or exists(select 1 from cadastro.turno_anexo_confirmacao where anexo_id=anexo.id) and (ctx->>'perfil' in ('administrador','profissional') or (ctx->>'perfil'='familia' and anexo.audiencia='equipe_e_familia' and operacao.fundamento_turno_vigente(anexo.paciente_id,ator)
   and exists(select 1 from cadastro.turno_fundamento_familiar_versao f where f.paciente_id=anexo.paciente_id and f.familiar_usuario_id=ator and f.versao=(select max(z.versao) from cadastro.turno_fundamento_familiar_versao z where z.paciente_id=f.paciente_id and z.familiar_usuario_id=ator) and anexo.registrado_em>=f.vigencia_inicio and (f.vigencia_fim is null or anexo.registrado_em<f.vigencia_fim))));
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,case when p_escrita then 'storage.enviar_anexo_turno' else 'storage.consultar_anexo_turno' end,'paciente',anexo.paciente_id,case when permitido then 'permitido' else 'negado' end,gen_random_uuid());
 if not found then raise exception 'AUDITORIA_NAO_INSERIDA';end if;
 return permitido;
end $$;
alter function operacao.objeto_turno_autorizado(text,text,boolean) owner to ffcmapp_turno_execucao_owner;
do $acl$ declare migrador text:=current_user;begin
 perform set_config('role','ffcmapp_turno_execucao_owner',true);
 revoke all on function operacao.objeto_turno_autorizado(text,text,boolean) from public,anon,authenticated,service_role;
 grant execute on function operacao.objeto_turno_autorizado(text,text,boolean) to authenticated;
 perform set_config('role',migrador,true);
end $acl$;
create policy turno_objeto_inserir on storage.objects for insert to authenticated with check(bucket_id='turno-ocorrencias' and operacao.objeto_turno_autorizado(bucket_id,name,true));
create policy turno_objeto_ler on storage.objects for select to authenticated using(bucket_id='turno-ocorrencias' and operacao.objeto_turno_autorizado(bucket_id,name,false));
-- Existing permissive Storage policies must not widen this bucket. Restrictive guard
-- composes with future policies while leaving other buckets' policies untouched.
create policy turno_objeto_guarda on storage.objects as restrictive to authenticated using(bucket_id<>'turno-ocorrencias' or operacao.objeto_turno_autorizado(bucket_id,name,false)) with check(bucket_id<>'turno-ocorrencias' or operacao.objeto_turno_autorizado(bucket_id,name,true));
create policy turno_objeto_negar_update on storage.objects as restrictive for update to authenticated using(bucket_id<>'turno-ocorrencias') with check(bucket_id<>'turno-ocorrencias');
create policy turno_objeto_negar_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'turno-ocorrencias');
-- No update/delete policy: immutable bytes; retry uploads use same path, never upsert.
grant usage on schema storage to ffcmapp_turno_execucao_owner;
grant select(id,bucket_id,name,metadata) on storage.objects to ffcmapp_turno_execucao_owner;
create policy turno_objeto_confirmar on storage.objects for select to ffcmapp_turno_execucao_owner using(bucket_id='turno-ocorrencias');
create function operacao.anexo_turno_privado(p_transporte jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
#variable_conflict use_variable
declare e jsonb:=p_transporte->'entrada';a jsonb:=e->'atestado';ctx jsonb;ator uuid:=auth_privado.uid();paciente uuid;req uuid;acao text;anexo cadastro.turno_anexo;r cadastro.turno_execucao_registro;t cadastro.turno;repeticao boolean:=false;resultado jsonb;id uuid;
begin
 ctx:=operacao.autorizar_execucao_turno(p_transporte,array['api.reservar_anexo_turno','api.confirmar_anexo_turno','api.consultar_anexo_turno','api.listar_anexos_turno']);
 paciente:=(e->>'paciente_id')::uuid;req:=(e->>'request_id')::uuid;acao:=a->>'operacao';id:=(e->>'anexo_id')::uuid;
 if acao='api.listar_anexos_turno' then
  if e-array['request_id','paciente_id','ocorrencia_id','cursor_id','limite','atestado']<>'{}'::jsonb or coalesce((e->>'limite')::integer,25) not between 1 and 100 then raise invalid_parameter_value;end if;
  select * into r from cadastro.turno_execucao_registro where cadastro.turno_execucao_registro.id=(e->>'ocorrencia_id')::uuid and paciente_id=paciente and classe='ocorrencia';
  if not found then raise insufficient_privilege;end if;
  with pagina as(select x.* from cadastro.turno_anexo x where x.ocorrencia_id=r.id and x.paciente_id=paciente and (not(e ? 'cursor_id') or x.id>(e->>'cursor_id')::uuid) and operacao.objeto_turno_autorizado('turno-ocorrencias',x.objeto_nome,false) order by x.id limit coalesce((e->>'limite')::integer,25)+1),n as(select *,row_number() over(order by id) n from pagina)
  select jsonb_build_object('itens',coalesce(jsonb_agg(to_jsonb(linha)-array['n','chave','digest'] order by id) filter(where linha.n<=coalesce((e->>'limite')::integer,25)),'[]'::jsonb),'proximo_cursor',case when count(*)>coalesce((e->>'limite')::integer,25) then (array_agg(id order by id))[coalesce((e->>'limite')::integer,25)] else null end) into resultado from n linha;
 elsif acao='api.reservar_anexo_turno' then
  if ctx->>'perfil'<>'profissional' or e-array['request_id','paciente_id','anexo_id','ocorrencia_id','ocorrencia_versao','classificacao','audiencia','mime_type','tamanho_bytes','chave_idempotencia','digest_idempotencia','atestado']<>'{}'::jsonb or id is null
   or e->>'classificacao' is distinct from 'execucao_turno' or length(coalesce(e->>'chave_idempotencia','')) not between 16 and 200 or coalesce(e->>'digest_idempotencia','')!~'^[A-Za-z0-9_-]{43}$' then raise invalid_parameter_value;end if;
  select * into r from cadastro.turno_execucao_registro where cadastro.turno_execucao_registro.id=(e->>'ocorrencia_id')::uuid and paciente_id=paciente and classe='ocorrencia' and autor_usuario_id=ator;
  if not found then raise insufficient_privilege;end if;
  select * into t from cadastro.turno where cadastro.turno.id=r.turno_id and paciente_id=paciente and profissional_usuario_id=ator and situacao='aberto' for share;
  if not found then raise insufficient_privilege;end if;
  if not exists(select 1 from cadastro.turno_ocorrencia_versao v where v.registro_id=r.id and v.versao=(e->>'ocorrencia_versao')::integer and v.versao=(select max(z.versao) from cadastro.turno_ocorrencia_versao z where z.registro_id=r.id)) then raise exception using errcode='PZ064',message='conflito';end if;
  select * into anexo from cadastro.turno_anexo where autor_usuario_id=ator and chave=e->>'chave_idempotencia';
  if found then
   if anexo.digest is distinct from e->>'digest_idempotencia' or anexo.id<>id or anexo.paciente_id<>paciente then raise exception using errcode='PZ064',message='conflito_idempotencia';end if;repeticao:=true;
  else
   insert into cadastro.turno_anexo(id,paciente_id,ocorrencia_id,ocorrencia_versao,autor_usuario_id,objeto_nome,classificacao,audiencia,mime_type,tamanho_bytes,chave,digest)
    values(id,paciente,r.id,(e->>'ocorrencia_versao')::integer,ator,paciente::text||'/'||r.id::text||'/'||id::text,e->>'classificacao',e->>'audiencia',e->>'mime_type',(e->>'tamanho_bytes')::integer,e->>'chave_idempotencia',e->>'digest_idempotencia') returning * into anexo;
  end if;
  resultado:=to_jsonb(anexo)-array['chave','digest'];
 else
  if e-array['request_id','paciente_id','anexo_id','atestado']<>'{}'::jsonb or id is null then raise invalid_parameter_value;end if;
  select * into anexo from cadastro.turno_anexo where cadastro.turno_anexo.id=id and paciente_id=paciente;
  if not found then raise insufficient_privilege;end if;
  if acao='api.confirmar_anexo_turno' then
   if ctx->>'perfil'<>'profissional' or anexo.autor_usuario_id<>ator then raise insufficient_privilege;end if;
   if not operacao.objeto_turno_autorizado('turno-ocorrencias',anexo.objeto_nome,true) and not exists(select 1 from cadastro.turno_anexo_confirmacao where anexo_id=id and autor_usuario_id=ator) then raise insufficient_privilege;end if;
   if not exists(select 1 from storage.objects o where o.bucket_id='turno-ocorrencias' and o.name=anexo.objeto_nome and o.metadata->>'mimetype'=anexo.mime_type and (o.metadata->>'size')::bigint=anexo.tamanho_bytes) then raise exception using errcode='PZ064',message='conflito';end if;
   insert into cadastro.turno_anexo_confirmacao(anexo_id,autor_usuario_id) values(id,ator) on conflict do nothing;
   repeticao:=not found;resultado:=jsonb_build_object('anexo_id',id,'confirmado',true);
  else
   if not operacao.objeto_turno_autorizado('turno-ocorrencias',anexo.objeto_nome,false) then raise insufficient_privilege;end if;
   resultado:=to_jsonb(anexo)-array['chave','digest'];
  end if;
 end if;
 if (a->>'expira_em')::timestamptz<=clock_timestamp() or operacao.contexto_execucao_turno(req) is null then raise insufficient_privilege;end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'permitido',req);
 if not found then raise exception 'AUDITORIA_NAO_INSERIDA';end if;
 if (a->>'expira_em')::timestamptz<=clock_timestamp() or operacao.contexto_execucao_turno(req) is null then raise insufficient_privilege;end if;
 return jsonb_build_object('ok',true,'repeticao',repeticao,'dados',resultado,'request_id',req);
end $$;
revoke all on function operacao.anexo_turno_privado(jsonb) from public,anon,authenticated,service_role;
grant execute on function operacao.anexo_turno_privado(jsonb) to ffcmapp_turno_execucao_owner;
grant create on schema api to ffcmapp_turno_execucao_owner;
create function api.turno_anexo(p_transporte jsonb) returns jsonb language plpgsql security definer set search_path='' set row_security=on as $$
declare ator uuid:=auth_privado.uid();req uuid;paciente uuid;codigo text;acao text;
begin
 begin return operacao.anexo_turno_privado(p_transporte);
 exception when others then codigo:=case when sqlstate='PZ064' and sqlerrm in ('conflito','conflito_idempotencia') then sqlerrm when sqlstate='42501' then 'sem_permissao' when sqlstate in ('22023','22P02','22007','22008','22003','23514','23502') then 'entrada_invalida' when sqlstate in ('23505','23503') then 'conflito' else 'servico_indisponivel' end;end;
 req:=(p_transporte#>>'{entrada,request_id}')::uuid;paciente:=(p_transporte#>>'{entrada,paciente_id}')::uuid;
 if ator is null or req is null then raise insufficient_privilege;end if;
 acao:=p_transporte#>>'{entrada,atestado,operacao}';
 if acao is null or acao not in ('api.reservar_anexo_turno','api.confirmar_anexo_turno','api.consultar_anexo_turno','api.listar_anexos_turno') then acao:='api.consultar_anexo_turno';end if;
 if exists(select 1 from public.usuario where id=ator) then insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
 else insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);end if;
 if not found then raise exception 'AUDITORIA_NAO_INSERIDA';end if;
 return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo',codigo),'request_id',req);
end $$;
alter function api.turno_anexo(jsonb) owner to ffcmapp_turno_execucao_owner;
do $acl$ declare migrador text:=current_user;begin
 perform set_config('role','ffcmapp_turno_execucao_owner',true);
 revoke all on function api.turno_anexo(jsonb) from public,anon,authenticated,service_role;
 grant execute on function api.turno_anexo(jsonb) to authenticated;
 perform set_config('role',migrador,true);
end $acl$;

do $$ declare p record;begin select * into p from turno_execucao_privilegios;
 if not p.tinha_api then revoke create on schema api from ffcmapp_turno_execucao_owner;end if;
 if not p.tinha_operacao then revoke create on schema operacao from ffcmapp_turno_execucao_owner;end if;
 if not p.tinha_set then execute format('revoke ffcmapp_turno_execucao_owner from %I granted by %I',p.migrador,p.migrador);end if;
end $$;
commit;
