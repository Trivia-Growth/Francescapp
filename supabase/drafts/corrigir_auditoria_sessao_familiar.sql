-- Draft privado: sem alteração de grants ou ativação.
create or replace function identidade.sessao_familiar_privada(p_request_id uuid, p_admitir boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_usuario uuid := auth_privado.uid();
  v_texto text := auth_privado.jwt() ->> 'session_id';
  v_sessao uuid;
  v_perfil record;
  v_local record;
  v_acesso uuid;
  v_permitido boolean := false;
  v_ator uuid;
  v_operador text;
begin
  if p_request_id is null or p_admitir is null then
    raise exception using errcode = '22004', message = 'PARAMETRO_OBRIGATORIO';
  end if;
  select operador_auditoria into strict v_operador from identidade.configuracao_auth_nativo;
  if v_texto ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_sessao := v_texto::uuid;
  end if;
  <<autorizar>>
  begin
    if v_usuario is null or v_sessao is null
      or bloqueios_auth.travar(v_usuario, v_sessao) is distinct from true
      or not exists (select 1 from auth_privado.sessoes() s where s.id = v_sessao
        and s.user_id = v_usuario and (s.not_after is null or s.not_after > clock_timestamp()))
      or not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array'
        then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'password')
    then exit autorizar; end if;
    select u.perfil, u.ativo, u.versao into v_perfil from public.usuario u
      where u.id = v_usuario for share;
    if not found or not v_perfil.ativo or v_perfil.perfil <> 'familia' then exit autorizar; end if;
    select a.id into v_acesso from cadastro.acesso_paciente a
      where a.usuario_id = v_usuario and a.revogada_em is null
      order by a.id limit 1 for share;
    if not found then exit autorizar; end if;
    select s.usuario_id, s.concessao_id, s.concessao_versao_admissao, s.metodo,
      s.revogada_em, s.encerrada_em into v_local
      from identidade.sessao s where s.session_id = v_sessao for share;
    if found and (v_local.usuario_id <> v_usuario or v_local.concessao_id is not null
      or v_local.concessao_versao_admissao is not null or v_local.metodo <> 'familia'
      or v_local.revogada_em is not null or v_local.encerrada_em is not null)
    then exit autorizar; end if;
    if not exists (select 1 from auth_privado.sessoes() s where s.id = v_sessao
      and s.user_id = v_usuario and (s.not_after is null or s.not_after > clock_timestamp()))
    then exit autorizar; end if;
    if p_admitir then
      insert into identidade.sessao(session_id, usuario_id, concessao_id, concessao_versao_admissao, metodo)
        values(v_sessao, v_usuario, null, null, 'familia') on conflict (session_id) do nothing;
    end if;
    select s.usuario_id, s.concessao_id, s.concessao_versao_admissao, s.metodo,
      s.revogada_em, s.encerrada_em into v_local
      from identidade.sessao s where s.session_id = v_sessao for share;
    if not found or v_local.usuario_id <> v_usuario or v_local.concessao_id is not null
      or v_local.concessao_versao_admissao is not null or v_local.metodo <> 'familia'
      or v_local.revogada_em is not null or v_local.encerrada_em is not null
    then exit autorizar; end if;
    v_permitido := true;
  end;
  select u.id into v_ator from public.usuario u where u.id = v_usuario;
  insert into auditoria.evento(id, ator_usuario_id, operador_restrito, acao, tipo_objeto, objeto_id, resultado, request_id)
    values(gen_random_uuid(), v_ator, case when v_ator is null then v_operador else null end,
      case when p_admitir then 'admitir_sessao_nativa' else 'consultar_sessao_nativa' end,
      'sessao', v_sessao, case when v_permitido then 'permitido' else 'negado' end, p_request_id);
  if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
  if not v_permitido then return null; end if;
  if not exists (select 1 from auth_privado.sessoes() s where s.id = v_sessao
    and s.user_id = v_usuario and (s.not_after is null or s.not_after > clock_timestamp())) then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  return jsonb_build_object('session_id', v_sessao, 'usuario', jsonb_build_object('id', v_usuario,
    'perfil', v_perfil.perfil, 'ativo', true, 'versao', v_perfil.versao),
    'capacidades', jsonb_build_array('consultar_pacientes_vinculados'));
end $$;
