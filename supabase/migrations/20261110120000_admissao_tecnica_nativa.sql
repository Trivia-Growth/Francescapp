-- A exceção individual é previamente vinculada por operador restrito. Nenhuma
-- conta Auth, concessão ou credencial é criada por esta migração.
alter table identidade.concessao_equipe drop constraint concessao_equipe_metodo_check;
alter table identidade.concessao_equipe add constraint concessao_equipe_metodo_check
  check (metodo in ('google_workspace', 'tecnica'));
alter table identidade.concessao_equipe drop constraint concessao_estado_datas_chk;
alter table identidade.concessao_equipe add constraint concessao_estado_datas_chk check ((
  (estado = 'pendente' and metodo = 'google_workspace' and usuario_id is null
    and subject_google is null and vinculada_em is null and revogada_em is null
    and revogada_por_usuario_id is null and motivo_revogacao_cifrado is null)
  or (estado = 'vinculada' and usuario_id is not null and vinculada_em is not null
    and ((metodo = 'google_workspace' and nullif(btrim(subject_google), '') is not null)
      or (metodo = 'tecnica' and subject_google is null))
    and revogada_em is null and revogada_por_usuario_id is null and motivo_revogacao_cifrado is null)
  or (estado = 'revogada' and revogada_em is not null and revogada_por_usuario_id is not null
    and motivo_revogacao_cifrado is not null and (metodo <> 'tecnica' or subject_google is null))
) is true);

grant select (usuario_id, concessao_id), update (concessao_id) on identidade.excecao_tecnica to ffcmapp_auth_nativo_owner;
create policy excecao_auth_nativo_leitura on identidade.excecao_tecnica
  for select to ffcmapp_auth_nativo_owner using (usuario_id = (select auth_privado.uid()));
create policy excecao_auth_nativo_lock on identidade.excecao_tecnica
  for update to ffcmapp_auth_nativo_owner using (usuario_id = (select auth_privado.uid()))
  with check (usuario_id = (select auth_privado.uid()));

select set_config('ffcmapp.migrador_tecnica', current_user, false);
grant ffcmapp_auth_nativo_owner to current_user;
grant create on schema api, identidade to ffcmapp_auth_nativo_owner;
set role ffcmapp_auth_nativo_owner;
create function identidade.sessao_tecnica_nativa(p_request_id uuid, p_admitir boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_usuario uuid := auth_privado.uid();
  v_texto text := auth_privado.jwt() ->> 'session_id';
  v_sessao uuid;
  v_concessao record;
  v_perfil record;
  v_local record;
  v_permitido boolean := false;
  v_ator uuid;
  v_operador text;
begin
  if p_request_id is null then raise exception using errcode='22004', message='REQUEST_ID_OBRIGATORIO'; end if;
  select operador_auditoria into strict v_operador from identidade.configuracao_auth_nativo;
  if v_texto ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_sessao := v_texto::uuid;
  end if;
  <<autorizar>>
  begin
    if v_usuario is null or v_sessao is null
      or bloqueios_auth.travar(v_usuario, v_sessao) is distinct from true
      or not exists (select 1 from auth_privado.sessoes() s where s.id=v_sessao and s.user_id=v_usuario
        and (s.not_after is null or s.not_after > clock_timestamp()))
      or not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array'
        then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password')
      then exit autorizar; end if;
    -- Mesmo lock da revogação; a exceção deve corresponder ao UUID e concessão.
    select c.id, c.versao, c.perfil into v_concessao from identidade.concessao_equipe c
      where c.usuario_id=v_usuario and c.estado='vinculada' and c.metodo='tecnica'
        and c.subject_google is null for update;
    if not found then exit autorizar; end if;
    perform 1 from identidade.excecao_tecnica x where x.usuario_id=v_usuario
      and x.concessao_id=v_concessao.id for share;
    if not found then exit autorizar; end if;
    select u.perfil, u.ativo, u.versao into v_perfil from public.usuario u
      where u.id=v_usuario for share;
    if not found or not v_perfil.ativo or v_perfil.perfil <> v_concessao.perfil then exit autorizar; end if;
    select s.usuario_id,s.concessao_id,s.metodo,s.revogada_em,s.encerrada_em into v_local
      from identidade.sessao s where s.session_id=v_sessao for share;
    if found and (v_local.usuario_id <> v_usuario or v_local.concessao_id <> v_concessao.id
      or v_local.metodo <> 'tecnica' or v_local.revogada_em is not null or v_local.encerrada_em is not null)
      then exit autorizar; end if;
    if not exists (select 1 from auth_privado.sessoes() s where s.id=v_sessao and s.user_id=v_usuario
      and (s.not_after is null or s.not_after > clock_timestamp())) then exit autorizar; end if;
    if p_admitir then
      insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
        values(v_sessao,v_usuario,v_concessao.id,v_concessao.versao,'tecnica') on conflict (session_id) do nothing;
    end if;
    select s.usuario_id,s.concessao_id,s.metodo,s.revogada_em,s.encerrada_em into v_local
      from identidade.sessao s where s.session_id=v_sessao for share;
    if not found or v_local.usuario_id <> v_usuario or v_local.concessao_id <> v_concessao.id
      or v_local.metodo <> 'tecnica' or v_local.revogada_em is not null or v_local.encerrada_em is not null
      then exit autorizar; end if;
    v_permitido := true;
  end;
  select u.id into v_ator from public.usuario u where u.id=v_usuario;
  insert into auditoria.evento(id,ator_usuario_id,operador_restrito,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),v_ator,case when v_ator is null then v_operador else null end,
      case when p_admitir then 'admitir_sessao_nativa' else 'consultar_sessao_nativa' end,
      'sessao',v_sessao,case when v_permitido then 'permitido' else 'negado' end,p_request_id);
  if not v_permitido then return null; end if;
  if not exists (select 1 from auth_privado.sessoes() s where s.id=v_sessao and s.user_id=v_usuario
    and (s.not_after is null or s.not_after > clock_timestamp())) then
    raise exception using errcode='42501', message='SEM_PERMISSAO';
  end if;
  return jsonb_build_object('session_id',v_sessao,'usuario',jsonb_build_object('id',v_usuario,
    'perfil',v_perfil.perfil,'ativo',true,'versao',v_perfil.versao),'capacidades',
    case when v_perfil.perfil='administrador' then jsonb_build_array('administrar_concessoes','administrar_cadastro','consultar_carteira_integral','consultar_auditoria')
      else jsonb_build_array('consultar_pacientes_vinculados') end);
end $$;
revoke all on function identidade.sessao_tecnica_nativa(uuid,boolean) from public, anon, authenticated;
-- Roteamento exclusivo pelo método autenticado no JWT, sem parâmetro de cliente.
create or replace function api.admitir_sessao_nativa(p_request_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select case when exists (select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array'
    then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password')
    then identidade.sessao_tecnica_nativa(p_request_id,true) else identidade.sessao_nativa(p_request_id,true) end;
$$;
create or replace function api.consultar_sessao_nativa(p_request_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select case when exists (select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array'
    then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password')
    then identidade.sessao_tecnica_nativa(p_request_id,false) else identidade.sessao_nativa(p_request_id,false) end;
$$;
reset role;
select set_config('role', current_setting('ffcmapp.migrador_tecnica'), false);
revoke create on schema api, identidade from ffcmapp_auth_nativo_owner;
revoke ffcmapp_auth_nativo_owner from current_user granted by current_user;
