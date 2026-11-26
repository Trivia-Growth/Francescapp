-- Materialização do acesso familiar na primeira entrada — decisão de 12/11/2026.
-- A equipe já decidiu quem entra quando pré-autorizou; a entrada apenas executa essa
-- decisão, sem ampliar nada e sem depender de alguém estar online.
--
-- Papel SEPARADO da ativação de propósito: `ffcmapp_ativar_familiar_owner` continua
-- sem qualquer INSERT (a confirmação de e-mail não provisiona, e a guarda
-- ATIVACAO_COM_PROVISIONAMENTO continua valendo). Quem materializa é a entrada, com
-- este papel próprio, cujo privilégio de escrita é limitado pelas políticas abaixo:
-- o banco recusa qualquer linha que não corresponda a uma pré-autorização vigente
-- vinculada a esta conta. Depende de 20261119250000 e 20261119260000.
-- Rollback: drop function api.materializar_acesso_familiar_nativa(uuid);
--   drop owned by ffcmapp_materializar_familiar_owner; drop role ffcmapp_materializar_familiar_owner;
create role ffcmapp_materializar_familiar_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_materializar_familiar_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_materializar_familiar_owner;
grant usage on schema identidade, cadastro, auditoria, public, auth_privado to ffcmapp_materializar_familiar_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.sessoes() to ffcmapp_materializar_familiar_owner;
grant select (id, perfil, ativo), insert (id, perfil, ativo), update (versao) on public.usuario to ffcmapp_materializar_familiar_owner;
grant select (id, paciente_id, usuario_id, revogada_em), update (versao),
  insert (id, paciente_id, usuario_id, concedido_por_usuario_id, motivo_concessao_cifrado)
  on cadastro.acesso_paciente to ffcmapp_materializar_familiar_owner;
-- `update (atualizado_em)` existe só para sustentar o `for update` do convite; a
-- política `_lock` com `check (false)` impede qualquer alteração real.
grant select (id, paciente_id, estado, usuario_id, acesso_preautorizado_id, acesso_autorizado_por,
    motivo_acesso_cifrado, acesso_revogado_em),
  update (atualizado_em) on identidade.convite_familiar to ffcmapp_materializar_familiar_owner;
grant select (operador_auditoria) on identidade.configuracao_auth_nativo to ffcmapp_materializar_familiar_owner;
grant insert (id, ator_usuario_id, operador_restrito, acao, tipo_objeto, objeto_id, resultado, request_id)
  on auditoria.evento to ffcmapp_materializar_familiar_owner;

create policy materializar_familiar_convite_select on identidade.convite_familiar for select
  to ffcmapp_materializar_familiar_owner using (usuario_id = (select auth_privado.uid()));
create policy materializar_familiar_convite_lock on identidade.convite_familiar for update
  to ffcmapp_materializar_familiar_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy materializar_familiar_config on identidade.configuracao_auth_nativo for select
  to ffcmapp_materializar_familiar_owner using (true);
create policy materializar_familiar_usuario_select on public.usuario for select
  to ffcmapp_materializar_familiar_owner using (id = (select auth_privado.uid()));
create policy materializar_familiar_usuario_lock on public.usuario for update
  to ffcmapp_materializar_familiar_owner using (id = (select auth_privado.uid())) with check (false);
-- Perfil só nasce para a própria conta, só como família, e só se houver uma
-- pré-autorização vigente já vinculada a ela.
create policy materializar_familiar_usuario_insert on public.usuario for insert
  to ffcmapp_materializar_familiar_owner
  with check (id = (select auth_privado.uid()) and perfil = 'familia' and ativo
    and exists (select 1 from identidade.convite_familiar c
      where c.usuario_id = (select auth_privado.uid()) and c.estado = 'ativado'
        and c.acesso_preautorizado_id is not null and c.acesso_revogado_em is null));
create policy materializar_familiar_acesso_select on cadastro.acesso_paciente for select
  to ffcmapp_materializar_familiar_owner using (usuario_id = (select auth_privado.uid()));
create policy materializar_familiar_acesso_lock on cadastro.acesso_paciente for update
  to ffcmapp_materializar_familiar_owner using (usuario_id = (select auth_privado.uid())) with check (false);
-- A garantia estrutural: a linha de acesso tem de ser exatamente a que a
-- pré-autorização vigente descreve — mesmo id, mesmo caso, mesmo autorizador, mesmo
-- motivo cifrado. Nem um caso a mais, e nada se a pré-autorização foi revogada.
create policy materializar_familiar_acesso_insert on cadastro.acesso_paciente for insert
  to ffcmapp_materializar_familiar_owner
  with check (usuario_id = (select auth_privado.uid()) and exists (
    select 1 from identidade.convite_familiar c
      where c.acesso_preautorizado_id = acesso_paciente.id
        and c.paciente_id = acesso_paciente.paciente_id
        and c.acesso_autorizado_por = acesso_paciente.concedido_por_usuario_id
        and c.motivo_acesso_cifrado = acesso_paciente.motivo_concessao_cifrado
        and c.acesso_revogado_em is null and c.estado = 'ativado'
        and c.usuario_id = (select auth_privado.uid())));
create policy materializar_familiar_auditoria on auditoria.evento for insert
  to ffcmapp_materializar_familiar_owner
  with check (acao = 'materializar_acesso_familiar' and tipo_objeto = 'convite_familiar'
    and ((ator_usuario_id = (select auth_privado.uid()) and operador_restrito is null)
      or (ator_usuario_id is null and operador_restrito is not null)));

select set_config('ffcmapp.materializar_familiar_migrador', current_user, false);
set role ffcmapp_materializar_familiar_owner;
create function api.materializar_acesso_familiar_nativa(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' set row_security = on as $$
declare
  v_ator uuid := auth_privado.uid();
  v_texto text := auth_privado.jwt() ->> 'session_id';
  v_sessao uuid; v_convite record; v_materializados integer := 0;
  v_algum boolean := false; v_registro uuid; v_operador text; v_eventos integer;
begin
  if p_request_id is null then
    raise exception using errcode = '22004', message = 'REQUEST_ID_OBRIGATORIO';
  end if;
  if v_texto ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_sessao := v_texto::uuid;
  end if;
  -- Mesma prova de entrada exigida pela sessão familiar: conta, sessão Auth vigente e
  -- autenticação por senha. Sem isso a materialização não é alcançável fora do login.
  if v_ator is null or v_sessao is null
    or not exists (select 1 from auth_privado.sessoes() s where s.id = v_sessao
      and s.user_id = v_ator and (s.not_after is null or s.not_after > clock_timestamp()))
    or not exists (select 1 from jsonb_array_elements(
      case when jsonb_typeof(auth_privado.jwt() -> 'amr') = 'array'
        then auth_privado.jwt() -> 'amr' else '[]'::jsonb end) m where m ->> 'method' = 'password') then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  -- Cada pré-autorização vigente vinculada a esta conta, travada na mesma transação.
  -- Revogada, de outro caso ou de outra conta simplesmente não aparece aqui.
  for v_convite in
    select c.id, c.paciente_id, c.acesso_preautorizado_id, c.acesso_autorizado_por, c.motivo_acesso_cifrado
      from identidade.convite_familiar c
      where c.usuario_id = v_ator and c.estado = 'ativado'
        and c.acesso_preautorizado_id is not null and c.acesso_autorizado_por is not null
        and c.motivo_acesso_cifrado is not null and c.acesso_revogado_em is null
      order by c.id for update
  loop
    v_algum := true;
    -- Perfil de aplicação só na primeira vez; a política limita forma e condição.
    insert into public.usuario(id, perfil, ativo) values (v_ator, 'familia', true)
      on conflict (id) do nothing;
    -- Vínculo revogado antes não vira reconcessão por uma nova entrada.
    perform 1 from cadastro.acesso_paciente a
      where a.paciente_id = v_convite.paciente_id and a.usuario_id = v_ator
        and a.revogada_em is not null for share;
    if not found then
      insert into cadastro.acesso_paciente(id, paciente_id, usuario_id, concedido_por_usuario_id, motivo_concessao_cifrado)
        values (v_convite.acesso_preautorizado_id, v_convite.paciente_id, v_ator,
          v_convite.acesso_autorizado_por, v_convite.motivo_acesso_cifrado)
        on conflict (id) do nothing;
      if found then v_materializados := v_materializados + 1; end if;
    end if;
    insert into auditoria.evento(id, ator_usuario_id, operador_restrito, acao, tipo_objeto, objeto_id, resultado, request_id)
      values (gen_random_uuid(), v_ator, null, 'materializar_acesso_familiar', 'convite_familiar',
        v_convite.id, 'permitido', p_request_id);
    get diagnostics v_eventos = row_count;
    if v_eventos <> 1 then raise exception using errcode = '55000', message = 'AUDITORIA_NAO_INSERIDA'; end if;
  end loop;
  if not v_algum then
    -- Negado também é auditado. Sem perfil ainda, o evento sai pelo operador restrito.
    select u.id into v_registro from public.usuario u where u.id = v_ator;
    if v_registro is null then
      select c.operador_auditoria into strict v_operador from identidade.configuracao_auth_nativo c;
    end if;
    insert into auditoria.evento(id, ator_usuario_id, operador_restrito, acao, tipo_objeto, objeto_id, resultado, request_id)
      values (gen_random_uuid(), v_registro, v_operador, 'materializar_acesso_familiar', 'convite_familiar',
        null, 'negado', p_request_id);
    get diagnostics v_eventos = row_count;
    if v_eventos <> 1 then raise exception using errcode = '55000', message = 'AUDITORIA_NAO_INSERIDA'; end if;
    return jsonb_build_object('ok', false, 'request_id', p_request_id);
  end if;
  return jsonb_build_object('ok', true, 'materializados', v_materializados, 'request_id', p_request_id);
end $$;
revoke all on function api.materializar_acesso_familiar_nativa(uuid) from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.materializar_familiar_migrador'), false);
revoke create on schema api from ffcmapp_materializar_familiar_owner;
revoke ffcmapp_materializar_familiar_owner from current_user;
