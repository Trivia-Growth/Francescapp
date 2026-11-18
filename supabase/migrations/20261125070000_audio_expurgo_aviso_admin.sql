-- Estado operacional somente leitura, sem áudio, pessoa ou causa bruta.
create function api.consultar_expurgo_audio(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  e jsonb := p_transporte->'entrada'; a jsonb := e->'atestado';
  ator uuid; sessao uuid; req uuid; auditoria_id uuid;
  inicio timestamptz; fim timestamptz; concessao uuid; dominio text; sujeito text;
  google record; autorizado boolean := false; repeticao boolean := false;
  anterior operacao.requisicao; resultado jsonb; acao text;
  alvo uuid; versao_atual integer; esperada integer; cofre_anterior uuid; cofre_novo uuid;
begin
  if jsonb_typeof(p_transporte) is distinct from 'object'
    or p_transporte - array['entrada', 'entrada_canonica', 'dados_canonicos'] <> '{}'::jsonb
    or jsonb_typeof(e) is distinct from 'object'
    or e - array['request_id', 'segredo_chave', 'valor', 'versao_esperada',
      'chave_idempotencia', 'digest_idempotencia', 'auditoria_id', 'atestado'] <> '{}'::jsonb
    or jsonb_typeof(a) is distinct from 'object' then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  begin
    ator := auth_privado.uid(); sessao := (auth_privado.jwt()->>'session_id')::uuid;
    req := (e->>'request_id')::uuid; auditoria_id := (e->>'auditoria_id')::uuid;
    inicio := (a->>'emitido_em')::timestamptz; fim := (a->>'expira_em')::timestamptz;
    acao := a->>'operacao';
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end;
  if ator is null or sessao is null or req is null or inicio is null or fim is null
    or acao is distinct from 'api.consultar_expurgo_audio'
    or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
    or a->>'request_id' is distinct from req::text
    or inicio > clock_timestamp() or fim <= clock_timestamp() or fim <= inicio or fim - inicio > interval '30 seconds'
    or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica', p_transporte->>'dados_canonicos', e - 'atestado', a - 'mac', a->>'mac') is distinct from true then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  -- Bloco de autorização idêntico ao de operacao.criar_concessao_equipe_privado (admin-only):
  -- Google Workspace vinculado como administrador, ou exceção técnica individual vinculada
  -- como administrador. Nenhuma alteração de lógica em relação ao original.
  if bloqueios_auth.travar(ator, sessao) is true then
    select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
    if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'oauth') then
      select i.provider_id, i.identity_data into google from auth_privado.identidades() i where i.user_id = ator and i.provider = 'google'
        and bloqueios_auth.travar(ator, sessao)
        and exists(select 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp()))
        and (select count(*) from auth_privado.identidades() j where j.user_id = ator and j.provider = 'google') = 1;
      if google.identity_data->>'sub' = google.provider_id and google.identity_data->>'email_verified' = 'true' and google.identity_data#>>'{custom_claims,hd}' = dominio then
        select c.id, c.subject_google into concessao, sujeito from identidade.concessao_equipe c
          where c.usuario_id = ator and c.estado = 'vinculada' and c.metodo = 'google_workspace' and c.perfil = 'administrador' for share;
        if found and sujeito = google.provider_id then
          perform 1 from public.usuario u where u.id = ator and u.ativo and u.perfil = 'administrador' for share;
          if found then
            perform 1 from identidade.sessao s where s.session_id = sessao and s.usuario_id = ator and s.concessao_id = concessao
              and s.metodo = 'google_workspace' and s.revogada_em is null and s.encerrada_em is null for share;
            if found then
              perform 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp());
              autorizado := found;
            end if;
          end if;
        end if;
      end if;
    end if;
    if not autorizado and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'password') then
      select c.id into concessao from identidade.concessao_equipe c
        where c.usuario_id = ator and c.estado = 'vinculada' and c.metodo = 'tecnica' and c.perfil = 'administrador' for share;
      if found then
        perform 1 from public.usuario u where u.id = ator and u.ativo and u.perfil = 'administrador' for share;
        if found then
          perform 1 from identidade.excecao_tecnica x where x.usuario_id = ator and x.concessao_id = concessao for share;
          if found then
            perform 1 from identidade.sessao s where s.session_id = sessao and s.usuario_id = ator and s.concessao_id = concessao
              and s.metodo = 'tecnica' and s.revogada_em is null and s.encerrada_em is null for share;
            if found then
              perform 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp());
              autorizado := found;
            end if;
          end if;
        end if;
      end if;
    end if;
  end if;
  if not autorizado or fim <= clock_timestamp() then
    if exists(select 1 from public.usuario where id = ator) then
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'audio_expurgo', null, 'negado', req);
      if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
    end if;
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end if;
  if e - array['request_id', 'atestado'] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
  end if;
  select jsonb_build_object('ativo', exists(select 1 from identidade.configuracao_sistema where chave='ffcm.transcricao.expurgo_ativo' and valor='true'::jsonb),
    'ultima_execucao', (select jsonb_build_object('executado_em', executado_em, 'falhas', falhas, 'apagados', apagados) from operacao.audio_expurgo_execucao order by executado_em desc, id desc limit 1)) into resultado;
  insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
    values(gen_random_uuid(), ator, acao, 'audio_expurgo', null, 'permitido', req);
  return jsonb_build_object('ok', true, 'dados', resultado, 'request_id', req);
end $$;
revoke all on function api.consultar_expurgo_audio(jsonb) from public, anon, authenticated, service_role;
grant select (id, executado_em, falhas, apagados) on operacao.audio_expurgo_execucao to ffcmapp_segredos_integracoes_owner;
create policy audio_expurgo_estado_admin on operacao.audio_expurgo_execucao for select to ffcmapp_segredos_integracoes_owner using (true);
grant select (chave,valor) on identidade.configuracao_sistema to ffcmapp_segredos_integracoes_owner;
create policy audio_expurgo_estado_config on identidade.configuracao_sistema for select to ffcmapp_segredos_integracoes_owner using (chave='ffcm.transcricao.expurgo_ativo');
select set_config('ffcmapp.audio_aviso_migrador',current_user,false);
select set_config('ffcmapp.audio_aviso_tinha_set',pg_has_role(current_user,'ffcmapp_segredos_integracoes_owner','SET')::text,false);
select set_config('ffcmapp.audio_aviso_tinha_create',exists(
 select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
 where n.nspname='api' and a.grantee='ffcmapp_segredos_integracoes_owner'::regrole and a.privilege_type='CREATE')::text,false);
do $$ begin
 if current_setting('ffcmapp.audio_aviso_tinha_set')='false' then
  if exists(select 1 from pg_auth_members m where m.roleid='ffcmapp_segredos_integracoes_owner'::regrole
   and m.member=current_user::regrole and m.grantor=current_user::regrole) then
   raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET';
  end if;
  execute format('grant ffcmapp_segredos_integracoes_owner to %I with inherit false, set true granted by %I',current_user,current_user);
 end if;
 if current_setting('ffcmapp.audio_aviso_tinha_create')='false' then
  grant create on schema api to ffcmapp_segredos_integracoes_owner;
 end if;
end $$;
alter function api.consultar_expurgo_audio(jsonb) owner to ffcmapp_segredos_integracoes_owner;
set role ffcmapp_segredos_integracoes_owner;
grant execute on function api.consultar_expurgo_audio(jsonb) to authenticated;
reset role;
select set_config('role',current_setting('ffcmapp.audio_aviso_migrador'),false);
do $$ begin
 if current_setting('ffcmapp.audio_aviso_tinha_create')='false' then
  revoke create on schema api from ffcmapp_segredos_integracoes_owner;
 end if;
 if current_setting('ffcmapp.audio_aviso_tinha_set')='false' then
  execute format('revoke ffcmapp_segredos_integracoes_owner from %I granted by %I',current_user,current_user);
 end if;
end $$;
