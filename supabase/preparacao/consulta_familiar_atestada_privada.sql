-- Draft: não ativa acesso. Preserva privilégios existentes durante substituição.
select set_config('ffcmapp.familiar_auditoria_migrador',current_user,false);
select set_config('ffcmapp.familiar_auditoria_tinha_owner',pg_has_role(current_user,'ffcmapp_carteira_familiar_owner','SET')::text,false);
select set_config('ffcmapp.familiar_auditoria_tinha_create',has_schema_privilege('ffcmapp_carteira_familiar_owner','api','CREATE')::text,false);
do $$ begin
 if current_setting('ffcmapp.familiar_auditoria_tinha_owner')='false' then
  if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor where r.rolname='ffcmapp_carteira_familiar_owner' and u.rolname=current_user and g.rolname=current_user) then raise exception 'MEMBERSHIP_EXISTENTE_SEM_SET'; end if;
  execute format('grant ffcmapp_carteira_familiar_owner to %I with inherit false, set true granted by %I',current_user,current_user);
 end if;
 if current_setting('ffcmapp.familiar_auditoria_tinha_create')='false' then grant create on schema api to ffcmapp_carteira_familiar_owner; end if;
end $$;
set role ffcmapp_carteira_familiar_owner;
create or replace function api.consultar_paciente_familiar_privado(p_request_id uuid, p_paciente_id uuid)
returns jsonb language plpgsql security definer set search_path = '' set row_security = on as $$
declare
  v_ator uuid := auth_privado.uid(); v_sessao uuid; v_texto text := auth_privado.jwt()->>'session_id';
  v_autorizado boolean := false; v_paciente jsonb;
begin
  if p_request_id is null or p_paciente_id is null then
    raise exception using errcode = '22023', message = 'PARAMETRO_INVALIDO';
  end if;
  if v_texto ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then v_sessao := v_texto::uuid; end if;
  if v_ator is not null and v_sessao is not null and bloqueios_auth.travar(v_ator, v_sessao) is true
    and exists (select 1 from auth_privado.sessoes() s where s.id = v_sessao and s.user_id = v_ator and (s.not_after is null or s.not_after > clock_timestamp()))
    and exists (select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'password') then
    perform 1 from public.usuario u where u.id = v_ator and u.ativo and u.perfil = 'familia' for share;
    if found then
      perform 1 from cadastro.acesso_paciente a where a.usuario_id = v_ator and a.paciente_id = p_paciente_id and a.revogada_em is null for share;
      if found then
        perform 1 from identidade.sessao s where s.session_id = v_sessao and s.usuario_id = v_ator and s.metodo = 'familia' and s.concessao_id is null and s.concessao_versao_admissao is null and s.revogada_em is null and s.encerrada_em is null for share;
        v_autorizado := found;
      end if;
    end if;
  end if;
  if v_autorizado then
    select jsonb_build_object('paciente_id', p.id, 'nome', p.nome_cifrado, 'nome_preferencia', p.nome_preferencia_cifrado, 'versao', p.versao)
      into v_paciente from cadastro.paciente p where p.id = p_paciente_id;
    v_autorizado := found and exists (select 1 from auth_privado.sessoes() s where s.id = v_sessao and s.user_id = v_ator and (s.not_after is null or s.not_after > clock_timestamp()));
  end if;
  if v_ator is not null and exists (select 1 from public.usuario u where u.id = v_ator) then
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values (gen_random_uuid(), v_ator, 'api.consultar_paciente_familiar', 'paciente', case when v_autorizado then p_paciente_id else null end, case when v_autorizado then 'permitido' else 'negado' end, p_request_id);
    if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
  end if;
  if not v_autorizado then return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', p_request_id); end if;
  return jsonb_build_object('ok', true, 'dados', v_paciente, 'request_id', p_request_id);
end $$;
reset role;
select set_config('role',current_setting('ffcmapp.familiar_auditoria_migrador'),false);
do $$ begin
 if current_setting('ffcmapp.familiar_auditoria_tinha_create')='false' then revoke create on schema api from ffcmapp_carteira_familiar_owner; end if;
 if current_setting('ffcmapp.familiar_auditoria_tinha_owner')='false' then execute format('revoke ffcmapp_carteira_familiar_owner from %I granted by %I',current_user,current_user); end if;
end $$;

-- Preparação isolada, sem EXECUTE à aplicação. A autoridade de servidor que
-- emite o atestado e comprova a geração da sessão ainda precisa ser integrada.
-- A tabela é criada pelo migrador, não pelo owner da função, para RLS valer.
-- Sem caminho de escrita de aplicação: admissão e renovação familiares precisam
-- de integração isolada e revisada antes de inserir ou alterar gerações.
create table identidade.geracao_sessao_familiar (
  session_id uuid primary key references identidade.sessao(session_id),
  usuario_id uuid not null references public.usuario(id),
  geracao bigint not null check (geracao > 0),
  ativa boolean not null default true
);
alter table identidade.geracao_sessao_familiar enable row level security;
alter table identidade.geracao_sessao_familiar force row level security;
revoke all on identidade.geracao_sessao_familiar from public, anon, authenticated, service_role;
grant select (session_id, usuario_id, geracao, ativa), update (geracao) on identidade.geracao_sessao_familiar to ffcmapp_carteira_familiar_owner;
create policy geracao_familiar_leitura on identidade.geracao_sessao_familiar for select to ffcmapp_carteira_familiar_owner using (usuario_id = (select auth_privado.uid()));
create policy geracao_familiar_lock on identidade.geracao_sessao_familiar for update to ffcmapp_carteira_familiar_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create table identidade.uso_consulta_familiar (
  request_id uuid primary key,
  usuario_id uuid not null,
  expira_em timestamptz not null
);
alter table identidade.uso_consulta_familiar enable row level security;
alter table identidade.uso_consulta_familiar force row level security;
revoke all on identidade.uso_consulta_familiar from public, anon, authenticated, service_role;
grant insert (request_id, usuario_id, expira_em) on identidade.uso_consulta_familiar to ffcmapp_carteira_familiar_owner;
create policy uso_consulta_familiar_insercao on identidade.uso_consulta_familiar
  for insert to ffcmapp_carteira_familiar_owner
  with check (usuario_id = (select auth_privado.uid()));
grant execute on function identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text) to ffcmapp_carteira_familiar_owner;
select set_config('ffcmapp.familiar_atestado_migrador',current_user,false);
select set_config('ffcmapp.familiar_atestado_tinha_owner',pg_has_role(current_user,'ffcmapp_carteira_familiar_owner','SET')::text,false);
select set_config('ffcmapp.familiar_atestado_tinha_create',has_schema_privilege('ffcmapp_carteira_familiar_owner','api','CREATE')::text,false);
do $$ begin
 if current_setting('ffcmapp.familiar_atestado_tinha_owner')='false' then
  if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor where r.rolname='ffcmapp_carteira_familiar_owner' and u.rolname=current_user and g.rolname=current_user) then raise exception 'MEMBERSHIP_EXISTENTE_SEM_SET'; end if;
  execute format('grant ffcmapp_carteira_familiar_owner to %I with inherit false, set true granted by %I',current_user,current_user);
 end if;
 if current_setting('ffcmapp.familiar_atestado_tinha_create')='false' then grant create on schema api to ffcmapp_carteira_familiar_owner; end if;
end $$;
set role ffcmapp_carteira_familiar_owner;
create function api.consultar_paciente_familiar_atestado_privado(p_transporte jsonb)
returns jsonb language plpgsql security definer set search_path='' set row_security=on as $$
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado';
 ator uuid; sessao uuid; req uuid; paciente uuid; inicio timestamptz; fim timestamptz; resultado jsonb;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object' or e - array['request_id','paciente_id','audiencia','geracao','atestado'] <> '{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501', message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; paciente:=(e->>'paciente_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or paciente is null or inicio is null or fim is null
  or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
  or a->>'request_id' is distinct from req::text or a->>'operacao' is distinct from 'api.consultar_paciente_familiar'
  or e->>'audiencia' is distinct from 'familiar'
  or coalesce(e->>'geracao','') !~ '^[1-9][0-9]{0,8}$'
  or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
  or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 perform 1 from identidade.geracao_sessao_familiar g where g.session_id=sessao and g.usuario_id=ator and g.ativa and g.geracao=(e->>'geracao')::bigint for share;
 if not found then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
 -- A unicidade serializa concorrentes. Rollback desfaz consumo; resultado
 -- incerto não autoriza replay automático e exige reconciliação própria.
 begin
  insert into identidade.uso_consulta_familiar(request_id,usuario_id,expira_em) values(req,ator,fim);
 exception when unique_violation then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 resultado:=api.consultar_paciente_familiar_privado(req,paciente);
 if fim<=clock_timestamp() then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
 return resultado;
end $$;
revoke all on function api.consultar_paciente_familiar_atestado_privado(jsonb) from public, anon, authenticated, service_role;
reset role;
select set_config('role',current_setting('ffcmapp.familiar_atestado_migrador'),false);
do $$ begin
 if current_setting('ffcmapp.familiar_atestado_tinha_create')='false' then revoke create on schema api from ffcmapp_carteira_familiar_owner; end if;
 if current_setting('ffcmapp.familiar_atestado_tinha_owner')='false' then execute format('revoke ffcmapp_carteira_familiar_owner from %I granted by %I',current_user,current_user); end if;
end $$;
