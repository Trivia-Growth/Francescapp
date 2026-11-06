-- Experimento privado, sem grants ou runtime. O prazo é apenas fixture.
-- Não demonstra isolamento da chave nem autoriza acesso em produção.
create function experimento_atestado.autorizar_carteira_nativa_fixture(
  p_entrada_canonica text, p_dados_canonicos text, p_entrada jsonb, p_dados jsonb, p_mac text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_usuario uuid := auth.uid();
  v_sessao uuid;
  v_concessao uuid;
  v_perfil text;
  v_subject text;
  v_google record;
  v_dominio text;
  v_emitido timestamptz;
  v_expira timestamptz;
begin
  begin
    v_sessao := (auth.jwt()->>'session_id')::uuid;
    v_emitido := (p_dados->>'emitido_em')::timestamptz;
    v_expira := (p_dados->>'expira_em')::timestamptz;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    return false;
  end;
  if v_usuario is null or v_sessao is null or v_emitido is null or v_expira is null
    or p_dados->>'usuario_id' is distinct from v_usuario::text
    or p_dados->>'session_id' is distinct from v_sessao::text
    or p_dados->>'operacao' is distinct from 'api.listar_pacientes'
    or v_emitido > clock_timestamp() or v_expira <= clock_timestamp()
    or v_expira <= v_emitido or v_expira - v_emitido > interval '30 seconds'
    or identidade.verificar_assinatura_atestado(p_entrada_canonica,p_dados_canonicos,p_entrada,p_dados,p_mac) is distinct from true
  then return false; end if;

  select dominio_workspace into v_dominio from identidade.configuracao_auth_nativo
    where google_unico_oauth_confirmado;
  if not found or not exists (select 1 from jsonb_array_elements(
    case when jsonb_typeof(auth.jwt()->'amr')='array' then auth.jwt()->'amr' else '[]'::jsonb end
  ) m where m->>'method'='oauth') then return false; end if;
  if (select count(*) from auth.identities i where i.user_id=v_usuario and i.provider='google') <> 1
    then return false; end if;
  select i.provider_id,i.identity_data into v_google from auth.identities i
    where i.user_id=v_usuario and i.provider='google';
  if v_google.identity_data->>'sub' is distinct from v_google.provider_id
    or v_google.identity_data->>'email_verified' is distinct from 'true'
    or v_google.identity_data#>>'{custom_claims,hd}' is distinct from v_dominio then return false; end if;

  -- Mesma ordem da admissão nativa: concessão, usuário, sessão local.
  select c.id,c.perfil,c.subject_google into v_concessao,v_perfil,v_subject
    from identidade.concessao_equipe c where c.usuario_id=v_usuario and c.estado='vinculada'
      and c.metodo='google_workspace' for share;
  if v_subject is distinct from v_google.provider_id then return false; end if;
  if not found then return false; end if;
  perform 1 from public.usuario u where u.id=v_usuario and u.ativo and u.perfil=v_perfil for share;
  if not found then return false; end if;
  perform 1 from identidade.sessao s where s.session_id=v_sessao and s.usuario_id=v_usuario
    and s.concessao_id=v_concessao and s.metodo='google_workspace'
    and s.revogada_em is null and s.encerrada_em is null for share;
  if not found then return false; end if;
  perform 1 from auth.sessions s where s.id=v_sessao and s.user_id=v_usuario
    and (s.not_after is null or s.not_after > clock_timestamp());
  if not found then return false; end if;
  return v_expira > clock_timestamp();
end $$;
revoke all on function experimento_atestado.autorizar_carteira_nativa_fixture(text,text,jsonb,jsonb,text)
  from public, anon, authenticated, service_role;
