-- Preparação privada: sem rota, atestado ou EXECUTE para a aplicação.
-- Revisão e provas reais de RLS, concorrência e revogação são obrigatórias antes da integração.
create role ffcmapp_carteira_familiar_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_carteira_familiar_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_carteira_familiar_owner;
grant usage on schema public, identidade, cadastro, auditoria, auth_privado, bloqueios_auth to ffcmapp_carteira_familiar_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.sessoes(), bloqueios_auth.travar(uuid, uuid) to ffcmapp_carteira_familiar_owner;
grant select (id, perfil, ativo), update (versao) on public.usuario to ffcmapp_carteira_familiar_owner;
grant select (session_id, usuario_id, concessao_id, concessao_versao_admissao, metodo, revogada_em, encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_carteira_familiar_owner;
grant select (id, paciente_id, usuario_id, revogada_em), update (versao) on cadastro.acesso_paciente to ffcmapp_carteira_familiar_owner;
grant select (id, criado_em, nome_cifrado, nome_preferencia_cifrado, versao) on cadastro.paciente to ffcmapp_carteira_familiar_owner;
grant insert (id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id) on auditoria.evento to ffcmapp_carteira_familiar_owner;
create policy carteira_familiar_usuario on public.usuario for select to ffcmapp_carteira_familiar_owner using (id = (select auth_privado.uid()));
create policy carteira_familiar_usuario_lock on public.usuario for update to ffcmapp_carteira_familiar_owner using (id = (select auth_privado.uid())) with check (false);
create policy carteira_familiar_sessao on identidade.sessao for select to ffcmapp_carteira_familiar_owner using (usuario_id = (select auth_privado.uid()));
create policy carteira_familiar_sessao_lock on identidade.sessao for update to ffcmapp_carteira_familiar_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy carteira_familiar_acesso on cadastro.acesso_paciente for select to ffcmapp_carteira_familiar_owner using (usuario_id = (select auth_privado.uid()) and revogada_em is null);
create policy carteira_familiar_acesso_lock on cadastro.acesso_paciente for update to ffcmapp_carteira_familiar_owner using (usuario_id = (select auth_privado.uid()) and revogada_em is null) with check (false);
create policy carteira_familiar_paciente on cadastro.paciente for select to ffcmapp_carteira_familiar_owner using (exists (select 1 from cadastro.acesso_paciente a where a.paciente_id = paciente.id and a.usuario_id = (select auth_privado.uid()) and a.revogada_em is null));
create policy carteira_familiar_auditoria on auditoria.evento for insert to ffcmapp_carteira_familiar_owner with check (ator_usuario_id = (select auth_privado.uid()) and acao = 'api.listar_pacientes_familiar' and tipo_objeto = 'carteira');
select set_config('ffcmapp.carteira_familiar_migrador', current_user, false);
set role ffcmapp_carteira_familiar_owner;
create function api.listar_pacientes_familiar_privado(p_request_id uuid, p_limite integer, p_cursor uuid default null)
returns jsonb language plpgsql security definer set search_path = '' set row_security = on as $$
declare
  v_ator uuid := auth_privado.uid(); v_sessao uuid; v_texto text := auth_privado.jwt()->>'session_id';
  v_autorizado boolean := false; v_criado timestamptz; v_pagina jsonb;
begin
  if p_request_id is null or p_limite is null or p_limite < 1 or p_limite > 100 then
    raise exception using errcode = '22023', message = 'PARAMETRO_INVALIDO';
  end if;
  if v_texto ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then v_sessao := v_texto::uuid; end if;
  if v_ator is not null and v_sessao is not null and bloqueios_auth.travar(v_ator, v_sessao) is true
    and exists (select 1 from auth_privado.sessoes() s where s.id = v_sessao and s.user_id = v_ator and (s.not_after is null or s.not_after > clock_timestamp()))
    and exists (select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'password') then
    perform 1 from public.usuario u where u.id = v_ator and u.ativo and u.perfil = 'familia' for share;
    if found then
      perform 1 from cadastro.acesso_paciente a where a.usuario_id = v_ator and a.revogada_em is null order by a.id limit 1 for share;
      if found then
        perform 1 from identidade.sessao s where s.session_id = v_sessao and s.usuario_id = v_ator and s.metodo = 'familia' and s.concessao_id is null and s.concessao_versao_admissao is null and s.revogada_em is null and s.encerrada_em is null for share;
        v_autorizado := found;
      end if;
    end if;
  end if;
  if v_autorizado and p_cursor is not null then
    perform 1 from cadastro.acesso_paciente a where a.usuario_id = v_ator and a.paciente_id = p_cursor and a.revogada_em is null for share;
    v_autorizado := found;
    if v_autorizado then select p.criado_em into v_criado from cadastro.paciente p where p.id = p_cursor; v_autorizado := found; end if;
  end if;
  if v_autorizado then
    with s as (select p.id, p.criado_em, p.nome_cifrado, p.nome_preferencia_cifrado, p.versao from cadastro.paciente p join cadastro.acesso_paciente a on a.paciente_id = p.id where a.usuario_id = v_ator and a.revogada_em is null and (p_cursor is null or (p.criado_em, p.id) > (v_criado, p_cursor)) order by p.criado_em, p.id limit p_limite + 1 for share of a),
    n as (select *, row_number() over (order by criado_em, id) ordem from s)
    select jsonb_build_object('itens', coalesce(jsonb_agg(jsonb_build_object('paciente_id', id, 'nome', nome_cifrado, 'nome_preferencia', nome_preferencia_cifrado, 'versao', versao) order by criado_em, id) filter (where ordem <= p_limite), '[]'::jsonb), 'proximo_cursor', case when count(*) > p_limite then max(id::text) filter (where ordem = p_limite) end) into v_pagina from n;
    v_autorizado := exists (select 1 from auth_privado.sessoes() s where s.id = v_sessao and s.user_id = v_ator and (s.not_after is null or s.not_after > clock_timestamp()));
  end if;
  -- Identidade inexistente não pode ser referenciada em auditoria; nenhum dado é retornado.
  if v_ator is not null and exists (select 1 from public.usuario u where u.id = v_ator) then
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id) values (gen_random_uuid(), v_ator, 'api.listar_pacientes_familiar', 'carteira', null, case when v_autorizado then 'permitido' else 'negado' end, p_request_id);
  end if;
  if not v_autorizado then return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', p_request_id); end if;
  return jsonb_build_object('ok', true, 'dados', v_pagina, 'request_id', p_request_id);
end $$;
revoke all on function api.listar_pacientes_familiar_privado(uuid, integer, uuid) from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.carteira_familiar_migrador'), false);
revoke create on schema api from ffcmapp_carteira_familiar_owner;
revoke ffcmapp_carteira_familiar_owner from current_user;
