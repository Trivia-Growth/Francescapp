-- Composição interna: S-02 e prova da concorrência Auth precedem ativação.
create function operacao.plano_composicao_privada(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid:=auth_privado.uid();
 sessao uuid; req uuid; paciente uuid; reserva uuid; comando uuid; epoca bigint;
 inicio timestamptz; fim timestamptz; dominio text; sujeito text; concessao uuid;
 google record; perfil_ator text; acao text; resposta text; dados jsonb; autorizado boolean:=false;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(a) is distinct from 'object'
  or e - array['request_id','operacao','epoca','reserva_id','comando_id','paciente_id','atestado'] <> '{}'::jsonb then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  sessao:=(auth_privado.jwt()->>'session_id')::uuid; req:=(e->>'request_id')::uuid;
  paciente:=(e->>'paciente_id')::uuid; epoca:=(e->>'epoca')::bigint; reserva:=(e->>'reserva_id')::uuid; comando:=(e->>'comando_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 acao:=e->>'operacao';
 if ator is null or sessao is null or req is null or inicio is null or fim is null
  or acao not in ('api.reservar_plano','api.encerrar_plano','api.consultar_barreira_plano','api.reconhecer_barreira_plano')
  or acao is null or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
  or a->>'request_id' is distinct from req::text or a->>'operacao' is distinct from acao
  or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
  or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if (acao='api.reservar_plano' and (epoca is null or epoca<1 or reserva is null or paciente is null or comando is not null))
  or (acao='api.encerrar_plano' and (epoca is null or epoca<1 or comando is null or paciente is not null))
  or (acao='api.consultar_barreira_plano' and (epoca is not null or reserva is not null or comando is not null or paciente is not null))
  or (acao='api.reconhecer_barreira_plano' and (epoca is not null or reserva is not null or comando is null or paciente is not null)) then
  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
 if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='oauth') then
  select i.provider_id,i.identity_data into google from auth_privado.identidades() i where i.user_id=ator and i.provider='google'
   and bloqueios_auth.travar(ator,sessao)
   and exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp()))
   and (select count(*) from auth_privado.identidades() j where j.user_id=ator and j.provider='google')=1;
  if google.identity_data->>'sub'=google.provider_id and google.identity_data->>'email_verified'='true' and google.identity_data#>>'{custom_claims,hd}'=dominio then
   select c.id,c.subject_google,c.perfil into concessao,sujeito,perfil_ator from identidade.concessao_equipe c
    where c.usuario_id=ator and c.estado='vinculada' and c.metodo='google_workspace' and c.perfil in ('administrador','profissional') for share;
   if found and sujeito=google.provider_id then
    perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil=perfil_ator for share;
    if found then
     perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and s.concessao_id=concessao
      and s.metodo='google_workspace' and s.revogada_em is null and s.encerrada_em is null for share;
     if found then
      perform 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp());
      autorizado:=found;
     end if;
    end if;
   end if;
  end if;
 end if;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'requisicao',null,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 -- A ordem paciente antes de barreira coincide com a gravação do objetivo.
 if acao='api.reservar_plano' then
  perform 1 from cadastro.paciente where id=paciente for key share;
  if not found then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'requisicao',null,'negado',req);
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
  end if;
 end if;
 -- A espera pelo bloqueio não pode estender a validade do atestado.
 insert into operacao.barreira_plano(ator_usuario_id) values(ator) on conflict do nothing;
 perform 1 from operacao.barreira_plano where ator_usuario_id=ator for update;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 -- A autorização ao paciente também deve continuar válida na reconciliação.
 if exists (
  select 1 from operacao.barreira_plano b
   left join operacao.recibo_barreira_plano c on c.id=b.resultado_pendente
   join operacao.reserva_plano r on r.id=coalesce(b.reserva_atual,c.reserva_id)
  where b.ator_usuario_id=ator and not exists(select 1 from cadastro.paciente p where p.id=r.paciente_reservado_id)
 ) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'requisicao',null,'negado',req);
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if acao='api.consultar_barreira_plano' then
  dados:=operacao.consultar_barreira_plano_privado(req);
 elsif acao='api.reconhecer_barreira_plano' then
  resposta:=operacao.reconhecer_barreira_plano_privado(comando,req);
 elsif acao='api.reservar_plano' then
  resposta:=operacao.reservar_plano_privado(ator,epoca,reserva,paciente);
 else
  resposta:=operacao.encerrar_plano_privado(ator,epoca,reserva,comando);
 end if;
 if acao in ('api.reservar_plano','api.encerrar_plano') then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'requisicao',null,case when resposta in ('aberta','confirmada','cancelada','vazia') then 'permitido' else 'negado' end,req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',coalesce(dados,jsonb_build_object('estado',resposta)),'request_id',req);
end $$;
revoke all on function operacao.plano_composicao_privada(jsonb) from public,anon,authenticated,service_role;

-- A composição permanece privada; nenhum papel de aplicação recebe EXECUTE.
select set_config('ffcmapp.migrador_composicao_plano',current_user,false);
select set_config('ffcmapp.composicao_plano_tinha_owner',
 exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member
  where r.rolname='ffcmapp_plano_owner' and u.rolname=current_user)::text,false);
do $$ begin
 if current_setting('ffcmapp.composicao_plano_tinha_owner')='false' then
  execute format('grant ffcmapp_plano_owner to %I with inherit false, set true',current_user);
 elsif not exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member
  where r.rolname='ffcmapp_plano_owner' and u.rolname=current_user and m.set_option) then
  raise exception 'MEMBERSHIP_PLANO_SEM_SET';
 end if;
end $$;
select set_config('ffcmapp.composicao_plano_tinha_create', exists(select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a join pg_roles r on r.oid=a.grantee where n.nspname='api' and r.rolname='ffcmapp_plano_owner' and a.privilege_type='CREATE')::text,false);
grant create on schema api to ffcmapp_plano_owner;
grant insert on operacao.barreira_plano, operacao.reserva_plano to ffcmapp_plano_owner;
grant select, insert on operacao.recibo_barreira_plano to ffcmapp_plano_owner;
create policy plano_recibo_acesso on operacao.recibo_barreira_plano to ffcmapp_plano_owner using (ator_usuario_id=(select auth_privado.uid())) with check (ator_usuario_id=(select auth_privado.uid()));
grant execute on function operacao.plano_composicao_privada(jsonb), operacao.reservar_plano_privado(uuid,bigint,uuid,uuid), operacao.encerrar_plano_privado(uuid,bigint,uuid,uuid), operacao.consultar_barreira_plano_privado(uuid), operacao.reconhecer_barreira_plano_privado(uuid,uuid) to ffcmapp_plano_owner;
set role ffcmapp_plano_owner;
create function api.plano_composicao_privada(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path='' set row_security=on as $$
declare req uuid; acao text;
begin
 begin
  return operacao.plano_composicao_privada(p_transporte);
 exception when sqlstate 'PZ001' then
  req:=(p_transporte#>>'{entrada,request_id}')::uuid;
  acao:=p_transporte#>>'{entrada,operacao}';
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),auth_privado.uid(),acao,'requisicao',null,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end;
end $$;
revoke all on function api.plano_composicao_privada(jsonb) from public,anon,authenticated,service_role;
reset role;
select set_config('role',current_setting('ffcmapp.migrador_composicao_plano'),false);
do $$ begin
 if current_setting('ffcmapp.composicao_plano_tinha_create')='false' then revoke create on schema api from ffcmapp_plano_owner; end if;
 if current_setting('ffcmapp.composicao_plano_tinha_owner')='false' then execute format('revoke ffcmapp_plano_owner from %I',current_user); end if;
end $$;
