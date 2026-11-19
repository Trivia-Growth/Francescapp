begin;
-- Reserva distribuída de ID Drive: uma pasta por paciente e raiz. Sem renomear/mover/adotar
-- conteúdo preexistente. ID pré-gerado suporta retries seguros de files.create com mesmo ID.
create temporary table documento_pasta_migrador on commit drop as
 select current_user::text migrador,pg_has_role(current_user,'ffcmapp_documento_owner','SET') tinha_set,
 has_schema_privilege('ffcmapp_documento_owner','api','CREATE') tinha_api,
 has_schema_privilege('ffcmapp_documento_owner','cadastro','CREATE') tinha_cadastro,
 has_column_privilege('ffcmapp_documento_owner','cadastro.paciente','id','REFERENCES') tinha_referencia;
do $$ declare m record;begin
 select * into m from documento_pasta_migrador;
 if not m.tinha_set then
  if exists(select 1 from pg_auth_members where roleid='ffcmapp_documento_owner'::regrole and member=current_user::regrole and grantor=current_user::regrole) then raise exception 'MEMBERSHIP_EXISTENTE_SEM_SET';end if;
  execute format('grant ffcmapp_documento_owner to %I with inherit false,set true granted by %I',m.migrador,m.migrador);
 end if;
 if not m.tinha_api then grant create on schema api to ffcmapp_documento_owner;end if;
 if not m.tinha_cadastro then grant create on schema cadastro to ffcmapp_documento_owner;end if;
 if not m.tinha_referencia then grant references(id) on cadastro.paciente to ffcmapp_documento_owner;end if;
end $$;
grant select on documento_pasta_migrador to ffcmapp_documento_owner;
set local role ffcmapp_documento_owner;
create table cadastro.documento_pasta (
 paciente_id uuid not null references cadastro.paciente(id),
 raiz text not null check (raiz ~ '^[A-Za-z0-9_-]{1,256}$'),
 pasta_id text not null unique check (pasta_id ~ '^[A-Za-z0-9_-]{1,256}$'),
 marcador text not null check (marcador ~ '^[A-Za-z0-9_-]{43}$'),
 primary key (paciente_id,raiz)
);
alter table cadastro.documento_pasta enable row level security;
alter table cadastro.documento_pasta force row level security;
revoke all on cadastro.documento_pasta from public,anon,authenticated,service_role;
create policy documento_pasta_owner_select on cadastro.documento_pasta for select to ffcmapp_documento_owner
 using (exists(select 1 from cadastro.paciente p where p.id=paciente_id));
create policy documento_pasta_owner_insert on cadastro.documento_pasta for insert to ffcmapp_documento_owner
 with check (exists(select 1 from cadastro.paciente p where p.id=paciente_id));
create function api.documento_pasta_reservar_privada(p_transporte jsonb,p_previa jsonb) returns jsonb
language plpgsql security definer set search_path='' set row_security=on as $$
#variable_conflict use_variable
declare e jsonb:=p_transporte->'entrada';a jsonb:=e->'atestado';r jsonb;req uuid;paciente uuid;ator uuid;sessao uuid;inicio timestamptz;fim timestamptz;pasta cadastro.documento_pasta;
begin
 -- Confere novamente operação/caso, vínculo/revogação e assinatura original. Não é um
 -- recibo de autorização passado pelo browser: ambas provas precisam ser válidas agora.
 r:=api.documento_preautorizar_privada(p_previa);
 if r->>'ok' is distinct from 'true' then raise exception using errcode='42501',message='SEM_PERMISSAO';end if;
 if jsonb_typeof(p_transporte) is distinct from 'object' or p_transporte-array['entrada','entrada_canonica','dados_canonicos']<>'{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object' or e-array['request_id','paciente_id','raiz','candidata','marcador','atestado']<>'{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then raise exception using errcode='42501',message='SEM_PERMISSAO';end if;
 begin
  req:=(e->>'request_id')::uuid;paciente:=(e->>'paciente_id')::uuid;ator:=auth_privado.uid();sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz;fim:=(a->>'expira_em')::timestamptz;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then raise exception using errcode='42501',message='SEM_PERMISSAO';end;
 if req is null or paciente is null or ator is null or sessao is null or inicio is null or fim is null
  or e->>'paciente_id' is distinct from p_previa#>>'{entrada,paciente_id}'
  or req::text is distinct from r->>'request_id'
  or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text or a->>'request_id' is distinct from req::text
  or a->>'operacao' is distinct from 'api.gravar_documento'
  or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
  or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true
  or coalesce(e->>'raiz','') !~ '^[A-Za-z0-9_-]{1,256}$' or coalesce(e->>'candidata','') !~ '^[A-Za-z0-9_-]{1,256}$'
  or coalesce(e->>'marcador','') !~ '^[A-Za-z0-9_-]{43}$' then raise exception using errcode='42501',message='SEM_PERMISSAO';end if;
 -- PK serializa concorrentes; perdedor lê o ID já reservado, nunca cria outra pasta.
 insert into cadastro.documento_pasta(paciente_id,raiz,pasta_id,marcador)
 values(paciente,e->>'raiz',e->>'candidata',e->>'marcador')
 on conflict (paciente_id,raiz) do nothing;
 select * into pasta from cadastro.documento_pasta p where p.paciente_id=paciente and p.raiz=e->>'raiz';
 if not found then raise exception 'PASTA_NAO_RESERVADA';end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
 values(gen_random_uuid(),ator,'api.gravar_documento','paciente',paciente,'permitido',req);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 if (p_previa#>>'{entrada,atestado,expira_em}')::timestamptz<=clock_timestamp() then raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';end if;
 return jsonb_build_object('ok',true,'dados',jsonb_build_object('pasta_id',pasta.pasta_id,'marcador',pasta.marcador),'request_id',req);
end $$;
revoke all on function api.documento_pasta_reservar_privada(jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function api.documento_pasta_reservar_privada(jsonb,jsonb) to authenticated;
do $$ declare m record;begin
 select * into m from documento_pasta_migrador;
 perform set_config('role',m.migrador,true);
 if not m.tinha_api then revoke create on schema api from ffcmapp_documento_owner;end if;
 if not m.tinha_cadastro then revoke create on schema cadastro from ffcmapp_documento_owner;end if;
 if not m.tinha_referencia then revoke references(id) on cadastro.paciente from ffcmapp_documento_owner;end if;
 if not m.tinha_set then execute format('revoke ffcmapp_documento_owner from %I granted by %I',m.migrador,m.migrador);end if;
end $$;
commit;
