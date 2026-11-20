-- FR-068/FR-069/FR-070 (design D1 e D2): a audiência financeira, conferida no banco.
--
-- Duas funções auxiliares, para que cada RPC financeira não repita — e não divirja de — o
-- bloco de autorização:
--
--   operacao.financeiro_atestado_privada  verifica o atestado assinado e devolve ator/sessão.
--   operacao.financeiro_audiencia_privada responde "esta pessoa tem audiência financeira?".
--
-- O ponto do design D1 está no que a segunda NÃO lê: `cadastro.acesso_paciente` não entra em
-- nenhuma consulta e o papel dono não recebe `select` nela. A separação "financeiro não deriva
-- do vínculo de caso" fica garantida por privilégio ausente, não por disciplina de quem
-- escreve a consulta.
--
-- Ambas são SECURITY DEFINER sob um papel próprio porque, assim, os privilégios de identidade
-- (configuração Auth, concessão, sessão, exceção técnica) ficam concentrados em um papel só,
-- que não enxerga nenhuma tabela financeira nem nenhuma tabela clínica. Os papéis donos das
-- tabelas financeiras recebem apenas EXECUTE.
create schema financeiro;
revoke all on schema financeiro from public, anon, authenticated, service_role;

create role ffcmapp_financeiro_audiencia_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_financeiro_audiencia_owner to current_user with inherit false, set true;
grant usage, create on schema operacao to ffcmapp_financeiro_audiencia_owner;
grant usage on schema public, identidade, auditoria, auth_privado, bloqueios_auth to ffcmapp_financeiro_audiencia_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.identidades(), auth_privado.sessoes(), bloqueios_auth.travar(uuid, uuid) to ffcmapp_financeiro_audiencia_owner;
grant select (dominio_workspace, google_unico_oauth_confirmado), update (dominio_workspace) on identidade.configuracao_auth_nativo to ffcmapp_financeiro_audiencia_owner;
-- A decisão trava as linhas de identidade com `for share` para não ser atropelada por uma
-- revogação concorrente, e o PostgreSQL exige privilégio de UPDATE para travar linha. O
-- UPDATE concedido é inócuo: as policies `_lock` abaixo trazem `with check (false)`, então
-- nenhuma escrita passa — o grant existe só para o travamento, como no molde de
-- 20261118100000. O recorte de linhas fica nas policies: este papel enxerga as linhas do
-- próprio ator e nenhuma linha de caso ou de conteúdo clínico.
grant select (id, perfil, ativo), update (versao) on public.usuario to ffcmapp_financeiro_audiencia_owner;
grant select (id, usuario_id, perfil, estado, subject_google, metodo, habilitado_financeiro), update (habilitado_financeiro) on identidade.concessao_equipe to ffcmapp_financeiro_audiencia_owner;
grant select (usuario_id, concessao_id), update (concessao_id) on identidade.excecao_tecnica to ffcmapp_financeiro_audiencia_owner;
grant select (session_id, usuario_id, concessao_id, metodo, revogada_em, encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_financeiro_audiencia_owner;
-- Deliberadamente ausente: qualquer grant em cadastro.* . Ver design D1.
create policy financeiro_audiencia_config on identidade.configuracao_auth_nativo for select to ffcmapp_financeiro_audiencia_owner using (true);
create policy financeiro_audiencia_config_lock on identidade.configuracao_auth_nativo for update to ffcmapp_financeiro_audiencia_owner using (true) with check (false);
create policy financeiro_audiencia_usuario on public.usuario for select to ffcmapp_financeiro_audiencia_owner using (id = (select auth_privado.uid()));
create policy financeiro_audiencia_concessao on identidade.concessao_equipe for select to ffcmapp_financeiro_audiencia_owner using (usuario_id = (select auth_privado.uid()));
create policy financeiro_audiencia_excecao on identidade.excecao_tecnica for select to ffcmapp_financeiro_audiencia_owner using (usuario_id = (select auth_privado.uid()));
create policy financeiro_audiencia_sessao on identidade.sessao for select to ffcmapp_financeiro_audiencia_owner using (usuario_id = (select auth_privado.uid()));
-- Nenhuma escrita: `with check (false)` fecha todas as quatro.
create policy financeiro_audiencia_usuario_lock on public.usuario for update to ffcmapp_financeiro_audiencia_owner using (id = (select auth_privado.uid())) with check (false);
create policy financeiro_audiencia_concessao_lock on identidade.concessao_equipe for update to ffcmapp_financeiro_audiencia_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy financeiro_audiencia_excecao_lock on identidade.excecao_tecnica for update to ffcmapp_financeiro_audiencia_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy financeiro_audiencia_sessao_lock on identidade.sessao for update to ffcmapp_financeiro_audiencia_owner using (usuario_id = (select auth_privado.uid())) with check (false);

-- Verificação do atestado. Não decide audiência: só prova que o transporte foi assinado para
-- esta pessoa, esta sessão, esta operação e esta entrada, dentro da janela declarada.
create function operacao.financeiro_atestado_privada(p_transporte jsonb, p_acoes text[]) returns jsonb
language plpgsql security definer set search_path = '' set row_security = on as $$
declare
  e jsonb := p_transporte->'entrada'; a jsonb := p_transporte#>'{entrada,atestado}';
  ator uuid; sessao uuid; req uuid; inicio timestamptz; fim timestamptz; acao text;
begin
  if jsonb_typeof(p_transporte) is distinct from 'object'
    or p_transporte - array['entrada', 'entrada_canonica', 'dados_canonicos'] <> '{}'::jsonb
    or jsonb_typeof(e) is distinct from 'object'
    or jsonb_typeof(a) is distinct from 'object' then
    return null;
  end if;
  begin
    ator := auth_privado.uid(); sessao := (auth_privado.jwt()->>'session_id')::uuid;
    req := (e->>'request_id')::uuid;
    inicio := (a->>'emitido_em')::timestamptz; fim := (a->>'expira_em')::timestamptz;
    acao := a->>'operacao';
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    return null;
  end;
  if ator is null or sessao is null or req is null or inicio is null or fim is null
    or acao is null or not (acao = any(p_acoes))
    or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
    or a->>'request_id' is distinct from req::text
    or inicio > clock_timestamp() or fim <= clock_timestamp() or fim <= inicio
    or fim - inicio > interval '30 seconds'
    or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica', p_transporte->>'dados_canonicos', e - 'atestado', a - 'mac', a->>'mac') is distinct from true then
    return null;
  end if;
  return jsonb_build_object('ator', ator, 'sessao', sessao, 'request_id', req, 'operacao', acao, 'expira_em', fim);
end $$;
revoke all on function operacao.financeiro_atestado_privada(jsonb, text[]) from public, anon, authenticated, service_role;

-- Audiência financeira: Administrador, ou profissional cuja concessão vinculada carrega a
-- marca financeira. Nenhum vínculo de caso é consultado, em nenhum dos dois caminhos.
create function operacao.financeiro_audiencia_privada(p_ator uuid, p_sessao uuid) returns boolean
language plpgsql security definer set search_path = '' set row_security = on as $$
#variable_conflict use_variable
declare
  dominio text; sujeito text; google record; concessao uuid; perfil_ator text;
  autorizado boolean := false;
begin
  if p_ator is null or p_sessao is null
    or p_ator is distinct from auth_privado.uid()
    or (auth_privado.jwt()->>'session_id')::uuid is distinct from p_sessao then
    return false;
  end if;
  if bloqueios_auth.travar(p_ator, p_sessao) is not true then return false; end if;
  select u.perfil into perfil_ator from public.usuario u where u.id = p_ator and u.ativo for share;
  if not found then return false; end if;
  -- Caminho Google Workspace, idêntico ao das demais operações administrativas.
  select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
  if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'oauth') then
    select i.provider_id, i.identity_data into google from auth_privado.identidades() i
      where i.user_id = p_ator and i.provider = 'google'
        and (select count(*) from auth_privado.identidades() j where j.user_id = p_ator and j.provider = 'google') = 1;
    if google.identity_data->>'sub' = google.provider_id and google.identity_data->>'email_verified' = 'true'
      and google.identity_data#>>'{custom_claims,hd}' = dominio then
      select c.id, c.subject_google into concessao, sujeito from identidade.concessao_equipe c
        where c.usuario_id = p_ator and c.estado = 'vinculada' and c.metodo = 'google_workspace'
          and c.perfil = perfil_ator
          and (c.perfil = 'administrador' or c.habilitado_financeiro) for share;
      if found and sujeito = google.provider_id then
        perform 1 from identidade.sessao s where s.session_id = p_sessao and s.usuario_id = p_ator
          and s.concessao_id = concessao and s.metodo = 'google_workspace'
          and s.revogada_em is null and s.encerrada_em is null for share;
        if found then
          perform 1 from auth_privado.sessoes() s where s.id = p_sessao and s.user_id = p_ator
            and (s.not_after is null or s.not_after > clock_timestamp());
          autorizado := found;
        end if;
      end if;
    end if;
  end if;
  -- Caminho da exceção técnica individual, pelas mesmas regras.
  if not autorizado and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'password') then
    select c.id into concessao from identidade.concessao_equipe c
      where c.usuario_id = p_ator and c.estado = 'vinculada' and c.metodo = 'tecnica'
        and c.perfil = perfil_ator
        and (c.perfil = 'administrador' or c.habilitado_financeiro) for share;
    if found then
      perform 1 from identidade.excecao_tecnica x where x.usuario_id = p_ator and x.concessao_id = concessao for share;
      if found then
        perform 1 from identidade.sessao s where s.session_id = p_sessao and s.usuario_id = p_ator
          and s.concessao_id = concessao and s.metodo = 'tecnica'
          and s.revogada_em is null and s.encerrada_em is null for share;
        if found then
          perform 1 from auth_privado.sessoes() s where s.id = p_sessao and s.user_id = p_ator
            and (s.not_after is null or s.not_after > clock_timestamp());
          autorizado := found;
        end if;
      end if;
    end if;
  end if;
  return autorizado;
end $$;
revoke all on function operacao.financeiro_audiencia_privada(uuid, uuid) from public, anon, authenticated, service_role;

alter function operacao.financeiro_atestado_privada(jsonb, text[]) owner to ffcmapp_financeiro_audiencia_owner;
alter function operacao.financeiro_audiencia_privada(uuid, uuid) owner to ffcmapp_financeiro_audiencia_owner;
select set_config('ffcmapp.financeiro_audiencia_migrador', current_user, false);
set role ffcmapp_financeiro_audiencia_owner;
revoke all on function operacao.financeiro_atestado_privada(jsonb, text[]) from public, anon, authenticated, service_role;
revoke all on function operacao.financeiro_audiencia_privada(uuid, uuid) from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.financeiro_audiencia_migrador'), false);
revoke create on schema operacao from ffcmapp_financeiro_audiencia_owner;

-- O verificador do atestado é de outro owner; conceder exige assumir o papel dono.
select set_config('ffcmapp.financeiro_audiencia_tinha_verificador', pg_has_role(current_user, 'ffcmapp_atestado_verificador_owner', 'SET')::text, false);
do $$ begin
  if current_setting('ffcmapp.financeiro_audiencia_tinha_verificador') = 'false' then
    if exists(select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member join pg_roles g on g.oid = m.grantor
      where r.rolname = 'ffcmapp_atestado_verificador_owner' and u.rolname = current_user and g.rolname = current_user) then
      raise exception 'MEMBERSHIP_VERIFICADOR_CONCEDENTE_EXISTENTE_SEM_SET';
    end if;
    execute format('grant ffcmapp_atestado_verificador_owner to %I with inherit false, set true granted by %I', current_user, current_user);
  end if;
end $$;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text, text, jsonb, jsonb, text) to ffcmapp_financeiro_audiencia_owner;
reset role;
select set_config('role', current_setting('ffcmapp.financeiro_audiencia_migrador'), false);
do $$ begin
  if current_setting('ffcmapp.financeiro_audiencia_tinha_verificador') = 'false' then
    execute format('revoke ffcmapp_atestado_verificador_owner from %I granted by %I', current_user, current_user);
  end if;
end $$;
revoke ffcmapp_financeiro_audiencia_owner from current_user;
