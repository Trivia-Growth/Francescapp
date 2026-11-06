-- Leitura e lock limitados à exceção individual do usuário autenticado.
grant select (usuario_id, concessao_id), update (concessao_id) on identidade.excecao_tecnica to ffcmapp_carteira_owner;
create policy carteira_tecnica_excecao on identidade.excecao_tecnica for select to ffcmapp_carteira_owner using (usuario_id=(select auth_privado.uid()));
create policy carteira_tecnica_excecao_lock on identidade.excecao_tecnica for update to ffcmapp_carteira_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy carteira_tecnica_paciente on cadastro.paciente for select to ffcmapp_carteira_owner using (
 exists (select 1 from public.usuario u
  join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil
  join identidade.excecao_tecnica x on x.usuario_id=u.id and x.concessao_id=c.id
  join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id
  where u.id=(select auth_privado.uid()) and u.ativo and u.perfil in ('administrador','profissional')
   and c.estado='vinculada' and c.metodo='tecnica' and c.subject_google is null
   and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo='tecnica'
   and s.revogada_em is null and s.encerrada_em is null
   and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after>clock_timestamp()))
   and exists(select 1 from jsonb_array_elements(case when jsonb_typeof((select auth_privado.jwt())->'amr')='array' then (select auth_privado.jwt())->'amr' else '[]'::jsonb end) m where m->>'method'='password')
   and (u.perfil='administrador' or exists(select 1 from cadastro.acesso_paciente a where a.paciente_id=paciente.id and a.usuario_id=u.id and a.revogada_em is null))
  )
);
select set_config('ffcmapp.migrador_carteira_tecnica', current_user, false);
select set_config('ffcmapp.carteira_tecnica_tinha_owner', pg_has_role(current_user, 'ffcmapp_carteira_owner', 'SET')::text, false);
do $$ begin
  if current_setting('ffcmapp.carteira_tecnica_tinha_owner')='false' then
    if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid
      join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor
      where r.rolname='ffcmapp_carteira_owner' and u.rolname=current_user and g.rolname=current_user) then
      raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET';
    end if;
    execute format('grant ffcmapp_carteira_owner to %I with inherit false, set true granted by %I', current_user, current_user);
  end if;
end $$;
select set_config('ffcmapp.carteira_tecnica_tinha_create_identidade', exists(select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a join pg_roles r on r.oid=a.grantee where n.nspname='identidade' and r.rolname='ffcmapp_carteira_owner' and a.privilege_type='CREATE')::text, false);
do $$ begin
  if current_setting('ffcmapp.carteira_tecnica_tinha_create_identidade')='false' then
    grant create on schema identidade to ffcmapp_carteira_owner;
  end if;
end $$;
set role ffcmapp_carteira_owner;
create or replace function identidade.listar_carteira_privada(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path='' set row_security=on as $$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid; sessao uuid; req uuid;
 inicio timestamptz; fim timestamptz; concessao uuid; perfil text; sujeito text; google record;
 dominio text; limite integer; cursor_id uuid; cursor_criado timestamptz; pagina jsonb; autorizado boolean:=false;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
   or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
   or jsonb_typeof(e) is distinct from 'object' or e - array['request_id','limite','cursor','atestado'] <> '{}'::jsonb
   or jsonb_typeof(a) is distinct from 'object' or jsonb_typeof(e->'limite') is distinct from 'number'
   or coalesce(e->>'limite','') !~ '^(100|[1-9][0-9]?)$'
   or (e ? 'cursor' and jsonb_typeof(e->'cursor') is distinct from 'string') then
   raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid; req:=(e->>'request_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
  limite:=(e->>'limite')::integer; if e ? 'cursor' then cursor_id:=(e->>'cursor')::uuid; end if;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or inicio is null or fim is null
   or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
   or a->>'request_id' is distinct from req::text or a->>'operacao' is distinct from 'api.listar_pacientes'
   or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
   or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 if exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password') then
  select c.id,c.perfil into concessao,perfil from identidade.concessao_equipe c
   where c.usuario_id=ator and c.estado='vinculada' and c.metodo='tecnica' and c.subject_google is null for share;
  if found and perfil in ('administrador','profissional') then
   perform 1 from identidade.excecao_tecnica x where x.usuario_id=ator and x.concessao_id=concessao for share;
   if found then
    perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil=perfil for share;
    if found then
     perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and s.concessao_id=concessao
      and s.metodo='tecnica' and s.revogada_em is null and s.encerrada_em is null for share;
     if found then
      perform 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp());
      autorizado:=found;
     end if;
    end if;
   end if;
  end if;
 else
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
 if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='oauth') then
  select i.provider_id,i.identity_data into google from auth_privado.identidades() i where i.user_id=ator and i.provider='google'
   and bloqueios_auth.travar(ator,sessao)
   and exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp()))
   and (select count(*) from auth_privado.identidades() j where j.user_id=ator and j.provider='google')=1;
  if google.identity_data->>'sub'=google.provider_id and google.identity_data->>'email_verified'='true'
    and google.identity_data#>>'{custom_claims,hd}'=dominio then
   select c.id,c.perfil,c.subject_google into concessao,perfil,sujeito from identidade.concessao_equipe c
    where c.usuario_id=ator and c.estado='vinculada' and c.metodo='google_workspace' for share;
   if found and perfil in ('administrador','profissional') and sujeito=google.provider_id then
    perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil=perfil for share;
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
 end if;
 if autorizado and cursor_id is not null then
  if perfil='profissional' then
   perform 1 from cadastro.acesso_paciente x where x.usuario_id=ator and x.paciente_id=cursor_id and x.revogada_em is null for share;
   autorizado:=found;
  end if;
  if autorizado then
   select p.criado_em into cursor_criado from cadastro.paciente p where p.id=cursor_id;
   autorizado:=found;
  end if;
 end if;
 if autorizado and perfil='administrador' then
  with s as (select p.id,p.criado_em,p.nome_cifrado,p.nome_preferencia_cifrado,p.versao from cadastro.paciente p
    where cursor_id is null or (p.criado_em,p.id)>(cursor_criado,cursor_id) order by p.criado_em,p.id limit limite+1),
   n as (select *,row_number() over(order by criado_em,id) ordem from s)
  select jsonb_build_object('itens',coalesce(jsonb_agg(jsonb_build_object('paciente_id',id,'nome',nome_cifrado,'nome_preferencia',nome_preferencia_cifrado,'versao',versao) order by criado_em,id) filter(where ordem<=limite),'[]'::jsonb),
   'proximo_cursor',case when count(*)>limite then max(id::text) filter(where ordem=limite) end) into pagina from n;
 elsif autorizado then
  with s as (select p.id,p.criado_em,p.nome_cifrado,p.nome_preferencia_cifrado,p.versao from cadastro.paciente p join cadastro.acesso_paciente x on x.paciente_id=p.id
    where x.usuario_id=ator and x.revogada_em is null and (cursor_id is null or (p.criado_em,p.id)>(cursor_criado,cursor_id))
    order by p.criado_em,p.id limit limite+1 for share of x), n as (select *,row_number() over(order by criado_em,id) ordem from s)
  select jsonb_build_object('itens',coalesce(jsonb_agg(jsonb_build_object('paciente_id',id,'nome',nome_cifrado,'nome_preferencia',nome_preferencia_cifrado,'versao',versao) order by criado_em,id) filter(where ordem<=limite),'[]'::jsonb),
   'proximo_cursor',case when count(*)>limite then max(id::text) filter(where ordem=limite) end) into pagina from n;
 end if;
 autorizado:=autorizado and fim>clock_timestamp() and exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp()));
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
 values(gen_random_uuid(),ator,'api.listar_pacientes','carteira',null,case when autorizado then 'permitido' else 'negado' end,req);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 if not autorizado then return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req); end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',pagina,'request_id',req);
end $$;
reset role;
select set_config('role',current_setting('ffcmapp.migrador_carteira_tecnica'),false);
do $$ begin
  if current_setting('ffcmapp.carteira_tecnica_tinha_create_identidade')='false' then
    revoke create on schema identidade from ffcmapp_carteira_owner;
  end if;
  if current_setting('ffcmapp.carteira_tecnica_tinha_owner')='false' then
    execute format('revoke ffcmapp_carteira_owner from %I granted by %I', current_user, current_user);
  end if;
end $$;
